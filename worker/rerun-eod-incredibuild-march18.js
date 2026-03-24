#!/usr/bin/env node
/**
 * One-off: Re-run end-of-day processor for Incredibuild March 18 report.
 * Fixes wrong counts (each batch overwrote instead of accumulating) and
 * computes the missing visibility_score / share_of_voice.
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { processEndOfDay } = require('./end-of-day-processor');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BRAND_ID   = 'b1a37d48-375f-477a-b838-38486e5e1c2d';
const REPORT_ID  = 'c0c89044-9158-44d6-86c3-fdbf3ff40cd2';

(async () => {
  console.log('=== Re-running EOD for Incredibuild March 18 ===');

  // 1. Fix the wrong attempted/ok counts before EOD runs.
  //    Each batch set these to its own batch_size (2) instead of accumulating.
  //    Actual counts from prompt_results: chatgpt=10ok, aio=10ok, claude=0ok (credit_error).
  await supabase.from('daily_reports').update({
    total_prompts:                  10,
    completed_prompts:              10,
    chatgpt_attempted:              10,
    chatgpt_ok:                     10,
    google_ai_overview_attempted:   10,
    google_ai_overview_ok:          10,
    claude_attempted:               10,
    claude_ok:                       0,
    status: 'running', // let EOD set it to completed at the end
  }).eq('id', REPORT_ID);
  console.log('✅ Corrected report counts');

  // 2. Run full EOD pipeline (brand analysis, visibility score, SOV, citations, etc.)
  //    Pass all three providers so SOV and visibility are computed across all models.
  console.log('\nRunning processEndOfDay...');
  await processEndOfDay(REPORT_ID, { phase: 2 }, ['chatgpt', 'google_ai_overview', 'claude']);
  console.log('✅ processEndOfDay completed');

  // 3. Mark report completed
  await supabase.from('daily_reports').update({
    status: 'completed',
    completed_at: new Date().toISOString(),
  }).eq('id', REPORT_ID);
  console.log('✅ Report marked completed');

  // 4. Show final state
  const { data: r } = await supabase.from('daily_reports').select('status,total_prompts,visibility_score,chatgpt_ok,google_ai_overview_ok,claude_ok').eq('id', REPORT_ID).single();
  console.log('Final report state:', JSON.stringify(r, null, 2));
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
