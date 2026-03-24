#!/usr/bin/env node
/**
 * run-claude-prompts.js
 *
 * Runs brand prompts through Claude (claude-opus-4-6) with the web_search tool enabled,
 * so responses include cited web sources. Stores results in prompt_results with
 * provider='claude' and citations in chatgpt_citations[] (picked up by Tavily processor).
 *
 * Runs in parallel with ChatGPT onboarding chunks and daily batches (spawned by queue-organizer.js).
 *
 * Environment variables:
 *   BRAND_ID           - The brand to process
 *   DAILY_REPORT_ID    - The daily report to attach results to
 *   PROMPT_IDS_JSON    - JSON array of prompt IDs to process
 *   ANTHROPIC_API_KEY  - Anthropic API key
 *   (Supabase env vars from .env)
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
  if (error) console.warn('[CLAUDE] BME update failed:', error.message);
}

// Delay between prompts to avoid rate limits (30k input tokens/min on Opus)
const RATE_LIMIT_MS = 15000;

/**
 * Run a single prompt through Claude with web_search enabled.
 * Returns { text, citationUrls } or throws on API error.
 */
async function runClaude(promptText) {
  const response = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 1024,
    tools: [{ type: 'web_search_20250305', name: 'web_search' }],
    messages: [{ role: 'user', content: promptText }],
  });

  return extractTextAndCitations(response);
}

/**
 * Extract the final text response and all citation URLs from a Claude response.
 *
 * Response structure when web_search is used:
 *   content[]: text blocks (final answer) + tool_use blocks (search calls)
 *   Citations are embedded in text blocks as inline references like [1], and
 *   the actual URLs come from tool_result content within the message exchange.
 *
 * Since Claude 3.7+, citations also appear in dedicated `citations` fields
 * on text blocks. We extract from all sources for maximum coverage.
 */
function extractTextAndCitations(response) {
  let text = '';
  const citationUrls = new Set();

  for (const block of response.content) {
    if (block.type === 'text') {
      text += block.text;

      // Some SDK versions embed citations as structured data on text blocks
      if (block.citations) {
        for (const cit of block.citations) {
          if (cit.url) citationUrls.add(cit.url);
          if (cit.start_page_url) citationUrls.add(cit.start_page_url);
        }
      }
    }

    // web_search_tool_result blocks contain search results with direct URL fields
    if (block.type === 'web_search_tool_result') {
      const content = Array.isArray(block.content) ? block.content : [];
      for (const c of content) {
        if (c.url) citationUrls.add(c.url);
      }
    }
  }

  // Also extract any URLs appearing directly in the response text
  const textUrls = text.match(/https?:\/\/[^\s\)\]"',]+/g) || [];
  textUrls.forEach(u => citationUrls.add(cleanUrl(u)));

  return {
    text: text.trim(),
    citationUrls: [...citationUrls].filter(u => u.startsWith('http')),
  };
}

function cleanUrl(url) {
  // Strip trailing punctuation that regex may have captured
  return url.replace(/[.,;:!?]+$/, '');
}

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('🤖 CLAUDE PROMPTS PROCESSOR');
  console.log('='.repeat(60));

  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set');
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

  // Mark how many we're attempting
  await supabase
    .from('daily_reports')
    .update({ claude_attempted: prompts.length })
    .eq('id', DAILY_REPORT_ID);

  await updateBME({ status: 'running', started_at: new Date().toISOString(), prompts_attempted: prompts.length });

  let okCount = 0;
  let errorCount = 0;
  const errorReasons = {};
  let firstErrorMessage = null;

  for (let i = 0; i < prompts.length; i++) {
    const prompt = prompts[i];
    const promptText = (prompt.improved_prompt || prompt.raw_prompt || '').trim();

    console.log(`\n[${i + 1}/${prompts.length}] ${promptText.substring(0, 80)}...`);

    try {
      // Idempotency — skip if already have a result for this prompt+report+provider
      const { data: existing } = await supabase
        .from('prompt_results')
        .select('id')
        .eq('brand_prompt_id', prompt.id)
        .eq('daily_report_id', DAILY_REPORT_ID)
        .eq('provider', 'claude')
        .maybeSingle();

      if (existing) {
        console.log('  ⏭ Already processed, skipping');
        okCount++;
        continue;
      }

      const { text, citationUrls } = await runClaude(promptText);

      console.log(`  ✅ Response: ${text.length} chars, ${citationUrls.length} citations`);
      okCount++;

      await supabase.from('prompt_results').insert({
        brand_prompt_id: prompt.id,
        daily_report_id: DAILY_REPORT_ID,
        provider: 'claude',
        provider_status: 'ok',
        prompt_text: promptText,
        claude_response: text,
        chatgpt_citations: citationUrls, // picked up by Tavily citation processor
        brand_mentioned: false,           // set by brand-analyzer during EOD
        brand_position: null,
      });

    } catch (err) {
      console.error('  ❌ Error:', err.message);

      // On rate limit, wait 60s and retry once
      if (err.status === 429) {
        console.log('  ⏳ Rate limit hit, waiting 60s then retrying...');
        await new Promise(r => setTimeout(r, 60000));
        try {
          const { text, citationUrls } = await runClaude(promptText);
          console.log(`  ✅ Retry OK: ${text.length} chars, ${citationUrls.length} citations`);
          okCount++;
          await supabase.from('prompt_results').insert({
            brand_prompt_id: prompt.id,
            daily_report_id: DAILY_REPORT_ID,
            provider: 'claude',
            provider_status: 'ok',
            prompt_text: promptText,
            claude_response: text,
            chatgpt_citations: citationUrls,
            brand_mentioned: false,
            brand_position: null,
          });
          continue;
        } catch (retryErr) {
          console.error('  ❌ Retry also failed:', retryErr.message);
        }
      }

      // Determine granular error status
      let errorStatus = 'error';
      if (err.status === 429) errorStatus = 'rate_limit';
      else if (err.message && err.message.includes('credit balance')) errorStatus = 'credit_error';

      errorCount++;
      errorReasons[errorStatus] = (errorReasons[errorStatus] || 0) + 1;
      if (!firstErrorMessage) firstErrorMessage = err.message;
      await supabase.from('prompt_results').insert({
        brand_prompt_id: prompt.id,
        daily_report_id: DAILY_REPORT_ID,
        provider: 'claude',
        provider_status: errorStatus,
        prompt_text: promptText,
        claude_response: null,
        chatgpt_citations: [],
        brand_mentioned: false,
        brand_position: null,
      });
    }

    if (i < prompts.length - 1) {
      await new Promise(r => setTimeout(r, RATE_LIMIT_MS));
    }
  }

  // Update daily report stats
  await supabase
    .from('daily_reports')
    .update({
      claude_ok: okCount,
      claude_status: okCount > 0 ? 'complete' : (errorCount > 0 ? 'failed' : 'no_results'),
    })
    .eq('id', DAILY_REPORT_ID);

  const errorSummary = firstErrorMessage
    ? `${errorCount} failed: ${firstErrorMessage}`
    : Object.entries(errorReasons).map(([k, v]) => `${v}× ${k}`).join(', ');
  await updateBME({
    status: errorCount === prompts.length ? 'failed' : 'completed',
    completed_at: new Date().toISOString(),
    prompts_ok: okCount,
    prompts_failed: errorCount,
    ...(errorCount > 0 && { error_message: errorSummary }),
  });

  console.log('\n' + '='.repeat(60));
  console.log('📊 CLAUDE SUMMARY');
  console.log('='.repeat(60));
  console.log('OK:     ', okCount);
  console.log('Errors: ', errorCount);
  console.log('='.repeat(60) + '\n');
}

main().catch(async err => {
  console.error('[CLAUDE] Fatal:', err.message, err.stack);
  await updateBME({ status: 'failed', completed_at: new Date().toISOString(), error_message: err.message });
  process.exit(1);
});
