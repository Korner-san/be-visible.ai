#!/usr/bin/env node
/**
 * run-onboarding-batch.js
 *
 * Runs a new v2 user's 30 selected prompts through Browserless/ChatGPT.
 * Updates brands.onboarding_prompts_sent after each prompt so the frontend
 * can show a live progress screen (0/30 → 10/30 → 20/30 → 30/30 → dashboard).
 *
 * Prompts are sent in batches of 5. Each batch runs as a SEPARATE child
 * process (run-onboarding-single-batch.js) so that:
 *   1. Playwright gets a fresh in-process state (no stale closed-browser state)
 *   2. The Browserless 15-min connection timer resets on every reconnect
 * The browser stays alive between batches via processKeepAlive (60s).
 *
 * Usage: BRAND_ID=<uuid> node run-onboarding-batch.js
 * Triggered by: POST /run-onboarding-batch { brandId, secret }
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { spawnSync } = require('child_process');
const path = require('path');
const { processEndOfDay } = require('./end-of-day-processor');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BRAND_ID = process.env.BRAND_ID;
const BATCH_SIZE = 5; // reconnect every 5 prompts to reset the 15-min session timer

if (!BRAND_ID) {
  console.error('BRAND_ID environment variable is required');
  process.exit(1);
}

async function runOnboardingBatch() {
  console.log('='.repeat(70));
  console.log('ONBOARDING BATCH RUNNER (v4 — child process per batch)');
  console.log('='.repeat(70));
  console.log('Brand ID:', BRAND_ID);
  console.log('Batch size:', BATCH_SIZE, '(reconnects every', BATCH_SIZE, 'prompts)');
  console.log('Timestamp:', new Date().toISOString());
  console.log('='.repeat(70));

  // 1. Fetch brand
  const { data: brand, error: brandError } = await supabase
    .from('brands')
    .select('id, name, domain, onboarding_completed, owner_user_id')
    .eq('id', BRAND_ID)
    .single();

  if (brandError || !brand) {
    console.error('Brand not found:', brandError?.message);
    process.exit(1);
  }
  console.log('Brand loaded:', brand.name);

  // 2. Fetch selected prompts
  const { data: prompts, error: promptsError } = await supabase
    .from('brand_prompts')
    .select('id, raw_prompt, improved_prompt')
    .eq('brand_id', BRAND_ID)
    .in('status', ['active', 'inactive'])
    .order('created_at');

  if (promptsError || !prompts || prompts.length === 0) {
    console.error('No selected prompts found:', promptsError?.message);
    await supabase.from('brands').update({ first_report_status: 'failed' }).eq('id', BRAND_ID);
    process.exit(1);
  }
  console.log('Found', prompts.length, 'prompts');

  // 3. Get or create daily_report for today
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
    console.log('Using existing daily_report:', dailyReportId);
  } else {
    const { data: newReport, error: reportError } = await supabase
      .from('daily_reports')
      .insert({ brand_id: BRAND_ID, report_date: today, status: 'running', total_prompts: prompts.length })
      .select('id')
      .single();

    if (reportError || !newReport) {
      console.error('Failed to create daily_report:', reportError?.message);
      await supabase.from('brands').update({ first_report_status: 'failed' }).eq('id', BRAND_ID);
      process.exit(1);
    }
    dailyReportId = newReport.id;
    console.log('Created daily_report:', dailyReportId);
  }

  // 4. Pick an eligible ChatGPT account
  const { data: account } = await supabase
    .from('chatgpt_accounts')
    .select('id, email, is_eligible')
    .eq('is_eligible', true)
    .limit(1)
    .single();

  if (!account) {
    console.error('No eligible ChatGPT account found');
    await supabase.from('brands').update({ first_report_status: 'failed' }).eq('id', BRAND_ID);
    process.exit(1);
  }

  process.env.CHATGPT_ACCOUNT_EMAIL = account.email;
  process.env.CHATGPT_ACCOUNT_ID = account.id;
  console.log('Using ChatGPT account:', account.email);

  // 5. Mark brand as running, reset counter
  await supabase
    .from('brands')
    .update({ first_report_status: 'running', onboarding_prompts_sent: 0 })
    .eq('id', BRAND_ID);

  // 6. Run prompts in batches of BATCH_SIZE.
  //    Each batch spawns a fresh child process so Playwright state is clean
  //    and the Browserless 15-min connection timer resets on every reconnect.
  let successCount = 0;
  let errorCount = 0;
  const totalBatches = Math.ceil(prompts.length / BATCH_SIZE);
  const singleBatchScript = path.join(__dirname, 'run-onboarding-single-batch.js');

  for (let batchStart = 0; batchStart < prompts.length; batchStart += BATCH_SIZE) {
    const batchPrompts = prompts.slice(batchStart, batchStart + BATCH_SIZE);
    const batchNum = Math.floor(batchStart / BATCH_SIZE) + 1;

    console.log('\n' + '='.repeat(70));
    console.log('Spawning child process for BATCH', batchNum + '/' + totalBatches,
      '— prompts', (batchStart + 1) + '-' + (batchStart + batchPrompts.length));
    console.log('='.repeat(70));

    const child = spawnSync('node', [singleBatchScript], {
      stdio: 'inherit',
      cwd: __dirname,
      env: {
        ...process.env,
        BRAND_ID,
        DAILY_REPORT_ID: dailyReportId,
        REPORT_DATE: today,
        BATCH_NUM: String(batchNum),
        TOTAL_BATCHES: String(totalBatches),
        PROMPTS_OFFSET: String(batchStart),
        TOTAL_PROMPTS: String(prompts.length),
        PROMPTS_JSON: JSON.stringify(batchPrompts),
        OWNER_USER_ID: brand.owner_user_id || '',
      },
    });

    if (child.status === 0) {
      successCount += batchPrompts.length;
      console.log('Batch', batchNum, 'child exited OK');
    } else {
      errorCount += batchPrompts.length;
      console.error('Batch', batchNum, 'child failed (exit code', child.status + ')');
      // Advance the progress counter past the failed batch so the UI doesn't freeze
      await supabase
        .from('brands')
        .update({ onboarding_prompts_sent: batchStart + batchPrompts.length })
        .eq('id', BRAND_ID);
    }

    // Brief pause between batches (browser stays alive via processKeepAlive)
    if (batchStart + BATCH_SIZE < prompts.length) {
      console.log('Pausing 3s before next batch...');
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  console.log('\nAll batches complete:', successCount, 'succeeded,', errorCount, 'failed');

  // 7. Run end-of-day processor
  console.log('Running end-of-day processor...');
  try {
    await processEndOfDay(dailyReportId);
    console.log('End-of-day processor complete');
  } catch (err) {
    console.warn('End-of-day processor error (non-fatal):', err.message);
  }

  // 8. Ensure owner has a users table row (needed for any code that still checks users table)
  if (brand.owner_user_id) {
    const { error: upsertUserError } = await supabase
      .from('users')
      .upsert(
        { id: brand.owner_user_id, subscription_plan: 'free_trial', reports_enabled: true },
        { onConflict: 'id', ignoreDuplicates: true }
      );
    if (upsertUserError) {
      console.warn('Warning: could not upsert users row:', upsertUserError.message);
    } else {
      console.log('Users table row ensured for owner:', brand.owner_user_id);
    }
  }

  // 9. Mark complete
  await supabase
    .from('daily_reports')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', dailyReportId);

  await supabase
    .from('brands')
    .update({ first_report_status: 'succeeded', onboarding_prompts_sent: prompts.length })
    .eq('id', BRAND_ID);

  console.log('='.repeat(70));
  console.log('ONBOARDING BATCH COMPLETE — Brand:', brand.name, '— Prompts:', successCount + '/' + prompts.length);
  console.log('='.repeat(70));
}

runOnboardingBatch().catch(err => {
  console.error('Fatal error:', err);
  supabase.from('brands').update({ first_report_status: 'failed' }).eq('id', BRAND_ID)
    .then(() => process.exit(1));
});
