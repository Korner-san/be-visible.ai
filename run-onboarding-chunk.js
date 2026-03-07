#!/usr/bin/env node
/**
 * run-onboarding-chunk.js
 *
 * Child process that runs a pre-claimed chunk of onboarding prompts for one account.
 * Called by queue-organizer.js with specific prompt IDs already atomically claimed
 * in the brand_prompts.onboarding_status column.
 *
 * Each prompt is marked completed/failed individually.
 * After completion, calls /chunk-complete webhook to trigger the next organizer run.
 * Does NOT run processEndOfDay — that's handled by queue-organizer after all chunks finish.
 *
 * Env vars (set by queue-organizer.js):
 *   BRAND_ID
 *   DAILY_REPORT_ID
 *   REPORT_DATE
 *   PROMPTS_JSON         (JSON array of {id, raw_prompt, improved_prompt})
 *   OWNER_USER_ID
 *   CHATGPT_ACCOUNT_EMAIL
 *   CHATGPT_ACCOUNT_ID
 *   TOTAL_PROMPTS        (total brand prompts, for progress display)
 *   ONBOARDING_WAVE      (1 or 2)
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const chatgptExecutor = require('./executors/chatgpt-executor');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PROMPT_TIMEOUT_MS = 2.5 * 60 * 1000; // 2.5 min per prompt
const CONNECT_TIME_MS   = 90 * 1000;        // 90s connection overhead budget (added once per chunk)

const BRAND_ID        = process.env.BRAND_ID;
const DAILY_REPORT_ID = process.env.DAILY_REPORT_ID;
const REPORT_DATE     = process.env.REPORT_DATE;
const OWNER_USER_ID   = process.env.OWNER_USER_ID || '';
const TOTAL_PROMPTS   = parseInt(process.env.TOTAL_PROMPTS || '30', 10);
const ONBOARDING_WAVE = parseInt(process.env.ONBOARDING_WAVE || '1', 10);

let chunkPrompts;
try {
  chunkPrompts = JSON.parse(process.env.PROMPTS_JSON);
} catch (e) {
  console.error('[CHUNK] Failed to parse PROMPTS_JSON:', e.message);
  process.exit(1);
}

if (!BRAND_ID || !DAILY_REPORT_ID || !REPORT_DATE || !Array.isArray(chunkPrompts) || chunkPrompts.length === 0) {
  console.error('[CHUNK] Missing required env vars');
  process.exit(1);
}

// Bug fix: retry 3x with 2s delay and log errors — previously silently swallowed errors
async function markRemainingFailed() {
  const promptIds = chunkPrompts.map(p => p.id);
  for (let attempt = 1; attempt <= 3; attempt++) {
    const { data, error } = await supabase
      .from('brand_prompts')
      .update({ onboarding_status: 'failed', onboarding_claimed_account_id: null, onboarding_claimed_at: null })
      .in('id', promptIds)
      .eq('onboarding_status', 'claimed') // only still-claimed ones — completed are untouched
      .select('id');
    if (!error) {
      console.log('[CHUNK] markRemainingFailed: marked', data?.length ?? 0, 'prompt(s) as failed');
      return;
    }
    console.error('[CHUNK] markRemainingFailed attempt', attempt, 'failed:', error.message);
    if (attempt < 3) await new Promise(r => setTimeout(r, 2000));
  }
  console.error('[CHUNK] markRemainingFailed: all 3 attempts failed — prompts may stay stuck as claimed');
}

async function runChunk() {
  // Bug fix: add CONNECT_TIME_MS so single-prompt chunks don't timeout before execution starts.
  // Old: chunkPrompts.length * 2.5min  (e.g. 1 prompt = 2.5min — connection eats 1min, leaving 1.5min)
  // New: 90s + chunkPrompts.length * 2.5min (e.g. 1 prompt = 4min — plenty of room)
  const chunkTimeoutMs = CONNECT_TIME_MS + chunkPrompts.length * PROMPT_TIMEOUT_MS;

  console.log('='.repeat(60));
  console.log('[CHUNK] Account:', process.env.CHATGPT_ACCOUNT_EMAIL);
  console.log('[CHUNK] Brand:', BRAND_ID, '— Wave:', ONBOARDING_WAVE, '— Prompts:', chunkPrompts.length);
  console.log('[CHUNK] Timeout:', (chunkTimeoutMs / 60000).toFixed(1) + ' min (' + (CONNECT_TIME_MS/1000) + 's connect + ' + chunkPrompts.length + 'x' + (PROMPT_TIMEOUT_MS/60000) + 'min)');
  console.log('[CHUNK] Prompt IDs:', chunkPrompts.map(p => p.id.substring(0, 8)).join(', '));
  console.log('='.repeat(60));

  const executeBatchPromise = chatgptExecutor.executeBatch({
    scheduleId: 'onboarding-' + BRAND_ID,
    userId: OWNER_USER_ID,
    brandId: BRAND_ID,
    reportDate: REPORT_DATE,
    prompts: chunkPrompts.map(p => ({
      promptId: p.id,
      promptText: p.improved_prompt || p.raw_prompt,
      brandId: BRAND_ID,
    })),
    onPromptComplete: async (promptIndexInBatch, success) => {
      const prompt = chunkPrompts[promptIndexInBatch];
      if (!prompt) return;

      // Mark this prompt's onboarding status.
      // Guard: only update if still 'claimed' — prevents stomping a prompt released/re-claimed elsewhere.
      await supabase
        .from('brand_prompts')
        .update({
          onboarding_status: success ? 'completed' : 'failed',
          // On success: preserve claimed_account_id and claimed_at so the monitor
          // can show which agent processed each prompt and calculate actual duration.
          // On failure: clear both so the stale-claim reset works cleanly on retry.
          ...(success ? {} : {
            onboarding_claimed_account_id: null,
            onboarding_claimed_at: null,
          }),
        })
        .eq('id', prompt.id)
        .eq('onboarding_status', 'claimed');

      // Update progress counter using actual count of completed prompts
      const { count } = await supabase
        .from('brand_prompts')
        .select('id', { count: 'exact', head: true })
        .eq('brand_id', BRAND_ID)
        .eq('onboarding_status', 'completed');

      if (count !== null) {
        await supabase
          .from('brands')
          .update({ onboarding_prompts_sent: count })
          .eq('id', BRAND_ID);
        console.log('[CHUNK] Progress:', count + '/' + TOTAL_PROMPTS, success ? 'OK' : 'FAIL', '(wave ' + ONBOARDING_WAVE + ')');
      }
    },
  });

  // Agent-owned timeout: if executeBatch doesn't finish in time, we give up
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('CHUNK_TIMEOUT')), chunkTimeoutMs)
  );

  await Promise.race([executeBatchPromise, timeoutPromise]).catch(async (err) => {
    if (err.message === 'CHUNK_TIMEOUT') {
      console.error('[CHUNK] TIMED OUT after', (chunkTimeoutMs / 60000).toFixed(1), 'min — marking remaining claimed prompts as failed');
      await markRemainingFailed();
      await notifyChunkComplete();
      process.exit(1);
    }
    throw err; // re-throw non-timeout errors to outer catch
  });

  console.log('[CHUNK] Batch complete. Notifying queue-organizer via /chunk-complete webhook.');
}

async function notifyChunkComplete() {
  const baseUrl = process.env.WEBHOOK_BASE_URL || 'http://135.181.203.202:3001';
  const webhookSecret = process.env.WEBHOOK_SECRET || 'your-secret-key-here';
  try {
    const res = await fetch(`${baseUrl}/chunk-complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: webhookSecret,
        brandId: BRAND_ID,
        dailyReportId: DAILY_REPORT_ID,
        wave: ONBOARDING_WAVE,
      }),
    });
    if (res.ok) {
      console.log('[CHUNK] /chunk-complete webhook fired successfully');
    } else {
      console.warn('[CHUNK] /chunk-complete webhook returned', res.status);
    }
  } catch (err) {
    console.warn('[CHUNK] /chunk-complete webhook failed (non-fatal):', err.message);
  }
}

runChunk()
  .then(async () => {
    await notifyChunkComplete();
    process.exit(0);
  })
  .catch(async err => {
    console.error('[CHUNK] Fatal error:', err.message);
    // Mark remaining claimed prompts as failed (not pending) so they show in monitoring
    await markRemainingFailed();
    // Still notify so organizer can pick up failed prompts
    await notifyChunkComplete();
    process.exit(1);
  });
