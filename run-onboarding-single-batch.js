#!/usr/bin/env node
/**
 * run-onboarding-single-batch.js
 *
 * Runs ONE batch of prompts for the onboarding flow, then exits.
 * Called as a child process by run-onboarding-batch.js so each batch
 * gets a fresh Node.js process (fresh Playwright state + fresh 15-min
 * Browserless connection timer reset).
 *
 * Env vars set by parent:
 *   BRAND_ID, DAILY_REPORT_ID, REPORT_DATE
 *   BATCH_NUM, TOTAL_BATCHES
 *   PROMPTS_OFFSET, TOTAL_PROMPTS
 *   PROMPTS_JSON  (JSON array of {id, raw_prompt, improved_prompt})
 *   OWNER_USER_ID
 *   (inherits CHATGPT_ACCOUNT_EMAIL, CHATGPT_ACCOUNT_ID, SUPABASE_* from parent)
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const chatgptExecutor = require('./executors/chatgpt-executor');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BRAND_ID        = process.env.BRAND_ID;
const DAILY_REPORT_ID = process.env.DAILY_REPORT_ID;
const REPORT_DATE     = process.env.REPORT_DATE;
const BATCH_NUM       = parseInt(process.env.BATCH_NUM, 10);
const TOTAL_BATCHES   = parseInt(process.env.TOTAL_BATCHES, 10);
const PROMPTS_OFFSET  = parseInt(process.env.PROMPTS_OFFSET, 10);
const TOTAL_PROMPTS   = parseInt(process.env.TOTAL_PROMPTS, 10);
const OWNER_USER_ID   = process.env.OWNER_USER_ID || '';

let batchPrompts;
try {
  batchPrompts = JSON.parse(process.env.PROMPTS_JSON);
} catch (e) {
  console.error('Failed to parse PROMPTS_JSON:', e.message);
  process.exit(1);
}

if (!BRAND_ID || !DAILY_REPORT_ID || !REPORT_DATE || !Array.isArray(batchPrompts)) {
  console.error('Missing required env vars');
  process.exit(1);
}

async function runSingleBatch() {
  console.log('='.repeat(70));
  console.log('BATCH ' + BATCH_NUM + '/' + TOTAL_BATCHES +
    ' -- prompts ' + (PROMPTS_OFFSET + 1) + '-' + (PROMPTS_OFFSET + batchPrompts.length) +
    ' (fresh process, 15-min timer reset)');
  console.log('='.repeat(70));

  const onboardingScheduleId = 'onboarding-' + BRAND_ID;
  let processedInBatch = 0;

  const result = await chatgptExecutor.executeBatch({
    scheduleId: onboardingScheduleId,
    userId: OWNER_USER_ID,
    brandId: BRAND_ID,
    reportDate: REPORT_DATE,
    prompts: batchPrompts.map(p => ({
      promptId: p.id,
      promptText: p.improved_prompt || p.raw_prompt,
      brandId: BRAND_ID,
    })),
    onPromptComplete: async (promptIndexInBatch, success) => {
      processedInBatch++;
      const totalDone = PROMPTS_OFFSET + processedInBatch;
      console.log('Progress: ' + totalDone + '/' + TOTAL_PROMPTS + (success ? ' OK' : ' FAIL'));
      await supabase
        .from('brands')
        .update({ onboarding_prompts_sent: totalDone })
        .eq('id', BRAND_ID);
    },
  });

  console.log('Batch ' + BATCH_NUM + ' done -- ' +
    (result.successCount || 0) + ' ok, ' + (result.failureCount || 0) + ' failed');
}

runSingleBatch()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Single batch fatal:', err.message);
    process.exit(1);
  });
