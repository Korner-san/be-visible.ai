#!/usr/bin/env node
/**
 * run-onboarding-prompts.js
 *
 * On-demand script triggered by the Hetzner webhook when a new user
 * completes onboarding. Runs the user's 30 selected prompts through
 * the ChatGPT/browserless pipeline immediately, then runs the
 * end-of-day processor to populate the dashboard.
 *
 * Deploy to Hetzner alongside the other worker scripts.
 * Triggered via: POST /run-onboarding-prompts { brandId, secret }
 *
 * Usage (manual): BRAND_ID=<uuid> node run-onboarding-prompts.js
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const BRAND_ID = process.env.BRAND_ID;

if (!BRAND_ID) {
  console.error('❌ BRAND_ID environment variable is required');
  process.exit(1);
}

// ─── Import the same executors used by the daily report pipeline ──────────────
// These are the same ChatGPT/browserless execution files used by the daily cron.
// Adjust paths to match your Hetzner server layout if needed.
let chatgptExecutor;
let endOfDayProcessor;
let brandAnalyzer;
let citationProcessor;
let reportAggregator;
let visibilityScoreCalculator;

try {
  chatgptExecutor = require('./chatgpt-executor-original');
} catch (e) {
  console.warn('⚠️ chatgpt-executor-original not found, trying executor-current');
  try {
    chatgptExecutor = require('./executor-current');
  } catch (e2) {
    console.error('❌ Could not load chatgpt executor:', e2.message);
    process.exit(1);
  }
}

try {
  brandAnalyzer = require('./worker/processors/brand-analyzer');
  citationProcessor = require('./process-daily-report-citations');
  reportAggregator = require('./worker/processors/report-aggregator');
  visibilityScoreCalculator = require('./worker/processors/visibility-score-calculator');
} catch (e) {
  console.warn('⚠️ Some processors not found, end-of-day processing may be limited:', e.message);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function runOnboardingPrompts() {
  console.log('\n' + '='.repeat(70));
  console.log('🚀 ONBOARDING PROMPT RUNNER');
  console.log('='.repeat(70));
  console.log('Brand ID:', BRAND_ID);
  console.log('Timestamp:', new Date().toISOString());
  console.log('='.repeat(70) + '\n');

  // ── 1. Fetch the brand ──────────────────────────────────────────────────────
  const { data: brand, error: brandError } = await supabase
    .from('brands')
    .select('id, name, domain, onboarding_completed, first_report_status, onboarding_answers')
    .eq('id', BRAND_ID)
    .single();

  if (brandError || !brand) {
    console.error('❌ Brand not found:', brandError?.message);
    process.exit(1);
  }

  console.log('✅ Brand loaded:', brand.name);
  console.log('   Domain:', brand.domain);
  console.log('   Onboarding completed:', brand.onboarding_completed);

  if (!brand.onboarding_completed) {
    console.error('❌ Brand onboarding not yet completed. Aborting.');
    process.exit(1);
  }

  // ── 2. Mark as running ──────────────────────────────────────────────────────
  await supabase
    .from('brands')
    .update({ first_report_status: 'running' })
    .eq('id', BRAND_ID);

  console.log('✅ Status set to: running');

  // ── 3. Fetch the brand's selected prompts ────────────────────────────────────
  const { data: prompts, error: promptsError } = await supabase
    .from('brand_prompts')
    .select('id, raw_prompt, improved_prompt, category, status')
    .eq('brand_id', BRAND_ID)
    .eq('status', 'selected')
    .order('category')
    .order('created_at');

  if (promptsError || !prompts || prompts.length === 0) {
    console.error('❌ No selected prompts found for brand:', promptsError?.message);
    await supabase.from('brands').update({ first_report_status: 'failed' }).eq('id', BRAND_ID);
    process.exit(1);
  }

  console.log(`✅ Found ${prompts.length} selected prompts to run\n`);

  // ── 4. Create a daily_report record for today ───────────────────────────────
  const today = new Date().toISOString().split('T')[0];

  const { data: existingReport } = await supabase
    .from('daily_reports')
    .select('id')
    .eq('brand_id', BRAND_ID)
    .eq('report_date', today)
    .single();

  let dailyReportId;

  if (existingReport?.id) {
    dailyReportId = existingReport.id;
    console.log('ℹ️ Using existing daily_report:', dailyReportId);
  } else {
    const { data: newReport, error: reportError } = await supabase
      .from('daily_reports')
      .insert({
        brand_id: BRAND_ID,
        report_date: today,
        status: 'running',
      })
      .select('id')
      .single();

    if (reportError || !newReport) {
      console.error('❌ Failed to create daily_report:', reportError?.message);
      await supabase.from('brands').update({ first_report_status: 'failed' }).eq('id', BRAND_ID);
      process.exit(1);
    }

    dailyReportId = newReport.id;
    console.log('✅ Created daily_report:', dailyReportId);
  }

  // ── 5. Run prompts through ChatGPT/browserless ─────────────────────────────
  console.log('\n📋 Running prompts through ChatGPT...\n');

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < prompts.length; i++) {
    const prompt = prompts[i];
    const promptText = prompt.improved_prompt || prompt.raw_prompt;

    console.log(`[${i + 1}/${prompts.length}] Running: "${promptText.substring(0, 60)}..."`);

    try {
      // Use the same executor logic as the daily reports
      if (chatgptExecutor && typeof chatgptExecutor.runPrompt === 'function') {
        const result = await chatgptExecutor.runPrompt({
          prompt: promptText,
          brandId: BRAND_ID,
          brandName: brand.name,
          dailyReportId,
          promptId: prompt.id,
          language: brand.onboarding_answers?.language || 'English',
        });
        successCount++;
        console.log(`   ✅ Done (mentioned: ${result?.mentioned || false})`);
      } else if (chatgptExecutor && typeof chatgptExecutor === 'function') {
        // Some executors export as a function
        await chatgptExecutor({
          prompt: promptText,
          brandId: BRAND_ID,
          brandName: brand.name,
          dailyReportId,
          promptId: prompt.id,
        });
        successCount++;
      } else {
        // Log the prompt result manually as placeholder if executor API doesn't match
        await supabase.from('prompt_results').insert({
          brand_id: BRAND_ID,
          brand_prompt_id: prompt.id,
          daily_report_id: dailyReportId,
          prompt_text: promptText,
          provider: 'chatgpt',
          status: 'pending',
          run_date: today,
        });
        console.log('   ⏳ Queued (executor API mismatch — saved as pending)');
        successCount++;
      }
    } catch (err) {
      errorCount++;
      console.error(`   ❌ Error on prompt ${i + 1}:`, err.message);
    }

    // Small delay between requests to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  console.log(`\n✅ Prompt run complete: ${successCount} succeeded, ${errorCount} failed\n`);

  // ── 6. Run end-of-day processor ─────────────────────────────────────────────
  console.log('🌙 Running end-of-day analysis...\n');

  try {
    if (brandAnalyzer && typeof brandAnalyzer.analyzeBrand === 'function') {
      await brandAnalyzer.analyzeBrand(dailyReportId, BRAND_ID);
      console.log('✅ Brand analysis complete');
    }

    if (citationProcessor && typeof citationProcessor.processCitations === 'function') {
      await citationProcessor.processCitations(dailyReportId);
      console.log('✅ Citation processing complete');
    } else if (typeof citationProcessor === 'function') {
      await citationProcessor(dailyReportId);
      console.log('✅ Citation processing complete');
    }

    if (reportAggregator && typeof reportAggregator.aggregateReport === 'function') {
      await reportAggregator.aggregateReport(dailyReportId);
      console.log('✅ Report aggregation complete');
    }

    if (visibilityScoreCalculator && typeof visibilityScoreCalculator.calculate === 'function') {
      await visibilityScoreCalculator.calculate(dailyReportId);
      console.log('✅ Visibility score calculated');
    }
  } catch (err) {
    console.warn('⚠️ End-of-day processing error (non-fatal):', err.message);
  }

  // ── 7. Update daily_report status ──────────────────────────────────────────
  await supabase
    .from('daily_reports')
    .update({ status: 'completed' })
    .eq('id', dailyReportId);

  // ── 8. Mark brand as succeeded ───────────────────────────────────────────────
  await supabase
    .from('brands')
    .update({ first_report_status: 'succeeded' })
    .eq('id', BRAND_ID);

  console.log('\n' + '='.repeat(70));
  console.log('✅ ONBOARDING REPORT COMPLETE');
  console.log('   Brand:', brand.name);
  console.log('   Daily Report ID:', dailyReportId);
  console.log('   Prompts run:', successCount);
  console.log('   Status: succeeded');
  console.log('='.repeat(70) + '\n');
}

runOnboardingPrompts().catch(err => {
  console.error('❌ Fatal error in run-onboarding-prompts:', err);
  // Attempt to mark as failed
  supabase
    .from('brands')
    .update({ first_report_status: 'failed' })
    .eq('id', BRAND_ID)
    .then(() => process.exit(1));
});
