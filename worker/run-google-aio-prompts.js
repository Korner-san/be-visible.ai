#!/usr/bin/env node
/**
 * run-google-aio-prompts.js
 *
 * Fetches Google AI Overview results for a set of prompts via SerpAPI (two-step fetch)
 * and stores them in prompt_results with provider='google_ai_overview'.
 *
 * Runs in parallel with ChatGPT onboarding chunks (spawned by queue-organizer.js)
 * and alongside daily batch executions.
 *
 * Two-step SerpAPI fetch:
 *   Step 1: engine=google&q=<prompt>  → returns ai_overview.page_token
 *   Step 2: engine=google_ai_overview&page_token=<token>  → returns ai_overview.text_blocks + references
 *
 * Environment variables:
 *   BRAND_ID           - The brand to process
 *   DAILY_REPORT_ID    - The daily report to attach results to
 *   PROMPT_IDS_JSON    - JSON array of prompt IDs to process
 *   SERPAPI_KEY        - SerpAPI key
 *   (Supabase env vars from .env)
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SERPAPI_KEY = process.env.SERPAPI_KEY;
const BRAND_ID = process.env.BRAND_ID;
const DAILY_REPORT_ID = process.env.DAILY_REPORT_ID;
const PROMPT_IDS_JSON = process.env.PROMPT_IDS_JSON;
const MODEL_EXECUTION_ID = process.env.MODEL_EXECUTION_ID || null;

async function updateBME(data) {
  if (!MODEL_EXECUTION_ID) return;
  const { error } = await supabase
    .from('batch_model_executions')
    .update(data)
    .eq('id', MODEL_EXECUTION_ID);
  if (error) console.warn('[AIO] BME update failed:', error.message);
}

// 1.2 sec between prompts — respects SerpAPI rate limit (each prompt = 2 API calls)
const RATE_LIMIT_MS = 1200;
// Small gap between step 1 and step 2 of the same prompt
const STEP_GAP_MS = 400;

async function fetchJson(url) {
  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SerpAPI HTTP ${res.status}: ${text.substring(0, 200)}`);
  }
  return res.json();
}

/**
 * Two-step SerpAPI fetch for Google AI Overview.
 * Returns the ai_overview object from step 2, or null if no AIO for this query.
 */
async function fetchGoogleAIO(query) {
  // Step 1: regular Google search to get page_token
  const searchUrl = new URL('https://serpapi.com/search');
  searchUrl.searchParams.set('engine', 'google');
  searchUrl.searchParams.set('q', query);
  searchUrl.searchParams.set('api_key', SERPAPI_KEY);
  searchUrl.searchParams.set('hl', 'en');
  searchUrl.searchParams.set('gl', 'us');

  const searchJson = await fetchJson(searchUrl);
  const pageToken = searchJson.ai_overview?.page_token;
  if (!pageToken) return null; // Google didn't show an AI Overview for this query

  await new Promise(r => setTimeout(r, STEP_GAP_MS));

  // Step 2: fetch actual AI overview content using page_token
  const aioUrl = new URL('https://serpapi.com/search');
  aioUrl.searchParams.set('engine', 'google_ai_overview');
  aioUrl.searchParams.set('page_token', pageToken);
  aioUrl.searchParams.set('api_key', SERPAPI_KEY);

  const aioJson = await fetchJson(aioUrl);
  return aioJson.ai_overview || null;
}

/**
 * Flatten text_blocks into a single readable string.
 * Handles paragraph, heading, and list block types.
 */
function extractText(aio) {
  if (!aio?.text_blocks) return '';
  return aio.text_blocks.map(block => {
    if (block.type === 'list') {
      return (block.list || []).map(item => item.snippet || '').join(' ');
    }
    return block.snippet || '';
  }).join(' ').trim();
}

/**
 * Extract citation URLs from references array.
 * These are passed to chatgpt_citations so the Tavily citation processor picks them up.
 */
function extractSourceUrls(aio) {
  return (aio?.references || [])
    .map(r => r.link || r.url || '')
    .filter(Boolean);
}

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('🌐 GOOGLE AI OVERVIEW PROCESSOR');
  console.log('='.repeat(60));

  if (!SERPAPI_KEY) throw new Error('SERPAPI_KEY not set in environment');
  if (!BRAND_ID) throw new Error('BRAND_ID not set');
  if (!DAILY_REPORT_ID) throw new Error('DAILY_REPORT_ID not set');
  if (!PROMPT_IDS_JSON) throw new Error('PROMPT_IDS_JSON not set');

  const promptIds = JSON.parse(PROMPT_IDS_JSON);
  console.log('Brand ID:        ', BRAND_ID);
  console.log('Daily Report ID: ', DAILY_REPORT_ID);
  console.log('Prompts:         ', promptIds.length);

  // Load prompt texts
  const { data: prompts, error: promptError } = await supabase
    .from('brand_prompts')
    .select('id, improved_prompt, raw_prompt')
    .in('id', promptIds);

  if (promptError || !prompts) throw new Error('Failed to load prompts: ' + promptError?.message);

  // Mark how many we're attempting in the daily report
  await supabase
    .from('daily_reports')
    .update({ google_ai_overview_attempted: prompts.length })
    .eq('id', DAILY_REPORT_ID);

  // Mark BME as running (started_at already set by execute-batch, just confirm)
  await updateBME({ status: 'running', started_at: new Date().toISOString(), prompts_attempted: prompts.length });

  let okCount = 0;
  let noResultCount = 0;
  let errorCount = 0;

  for (let i = 0; i < prompts.length; i++) {
    const prompt = prompts[i];
    const promptText = (prompt.improved_prompt || prompt.raw_prompt || '').trim();

    console.log(`\n[${i + 1}/${prompts.length}] ${promptText.substring(0, 80)}...`);

    try {
      // Skip if we already have a result for this prompt+report+provider (idempotent)
      const { data: existing } = await supabase
        .from('prompt_results')
        .select('id')
        .eq('brand_prompt_id', prompt.id)
        .eq('daily_report_id', DAILY_REPORT_ID)
        .eq('provider', 'google_ai_overview')
        .maybeSingle();

      if (existing) {
        console.log('  ⏭ Already processed, skipping');
        okCount++; // count it as ok since it was previously fetched
        continue;
      }

      const aio = await fetchGoogleAIO(promptText);

      if (!aio) {
        console.log('  ⚪ No AI Overview (normal for some queries)');
        noResultCount++;

        // Insert a no_result row so EOD knows this prompt was attempted
        await supabase.from('prompt_results').insert({
          brand_prompt_id: prompt.id,
          daily_report_id: DAILY_REPORT_ID,
          provider: 'google_ai_overview',
          provider_status: 'no_result',
          prompt_text: promptText,
          google_ai_overview_response: null,
          chatgpt_citations: [],
          brand_mentioned: null,
          brand_position: null,
        });

      } else {
        const text = extractText(aio);
        const sourceUrls = extractSourceUrls(aio);

        console.log(`  ✅ AIO found — ${text.length} chars, ${sourceUrls.length} citations`);
        okCount++;

        // Store in prompt_results — brand_mentioned/brand_position set later by brand-analyzer
        await supabase.from('prompt_results').insert({
          brand_prompt_id: prompt.id,
          daily_report_id: DAILY_REPORT_ID,
          provider: 'google_ai_overview',
          provider_status: 'ok',
          prompt_text: promptText,
          google_ai_overview_response: text,
          chatgpt_citations: sourceUrls,  // picked up by Tavily citation processor
          brand_mentioned: null,          // set by brand-analyzer during EOD
          brand_position: null,
        });
      }

    } catch (err) {
      console.error('  ❌ Error:', err.message);
      errorCount++;

      // Insert error row (non-fatal — don't throw)
      await supabase.from('prompt_results').insert({
        brand_prompt_id: prompt.id,
        daily_report_id: DAILY_REPORT_ID,
        provider: 'google_ai_overview',
        provider_status: 'error',
        prompt_text: promptText,
        google_ai_overview_response: null,
        chatgpt_citations: [],
        brand_mentioned: false,
        brand_position: null,
      }).catch(() => {});
    }

    // Rate limit between prompts (skip delay after last prompt)
    if (i < prompts.length - 1) {
      await new Promise(r => setTimeout(r, RATE_LIMIT_MS));
    }
  }

  // Update final stats on the daily report
  await supabase
    .from('daily_reports')
    .update({
      google_ai_overview_ok: okCount,
      google_ai_overview_status: okCount > 0 ? 'complete' : (errorCount > 0 ? 'failed' : 'no_results'),
    })
    .eq('id', DAILY_REPORT_ID);

  // Update BME with final outcome
  await updateBME({
    status: errorCount === prompts.length ? 'failed' : 'completed',
    completed_at: new Date().toISOString(),
    prompts_ok: okCount,
    prompts_no_result: noResultCount,
    prompts_failed: errorCount,
  });

  console.log('\n' + '='.repeat(60));
  console.log('📊 GOOGLE AIO SUMMARY');
  console.log('='.repeat(60));
  console.log('AIO found:  ', okCount);
  console.log('No result:  ', noResultCount);
  console.log('Errors:     ', errorCount);
  console.log('='.repeat(60) + '\n');
}

main().catch(async err => {
  console.error('[GOOGLE-AIO] Fatal:', err.message, err.stack);
  await updateBME({ status: 'failed', completed_at: new Date().toISOString(), error_message: err.message });
  process.exit(1);
});
