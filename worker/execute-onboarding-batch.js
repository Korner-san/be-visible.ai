#!/usr/bin/env node
/**
 * execute-onboarding-batch.js <schedule_id>
 *
 * Called by crontab for daily_schedules rows with batch_type='onboarding'.
 * Claims the next wave-2 prompts for the brand and spawns run-onboarding-chunk.js.
 *
 * Unlike execute-batch.js (regular daily batches), this script:
 *   - Ignores prompt_ids in the schedule row (prompts assigned dynamically)
 *   - Claims from brand_prompts.onboarding_status='pending'|'failed' for wave=2
 *   - Passes ONBOARDING_WAVE=2 to run-onboarding-chunk.js
 *   - run-onboarding-chunk.js fires /chunk-complete → queue-organizer detects completion
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const chunkScript = path.join(__dirname, 'run-onboarding-chunk.js');

async function main() {
  const scheduleId = process.argv[2];
  if (!scheduleId) {
    console.error('[ONBOARDING-BATCH] Missing schedule_id argument');
    process.exit(1);
  }

  console.log('[ONBOARDING-BATCH] Starting for schedule', scheduleId, 'at', new Date().toISOString());

  // 1. Read schedule row
  const { data: schedule, error: schedErr } = await supabase
    .from('daily_schedules')
    .select('id, brand_id, chatgpt_account_id, batch_size, user_id, status')
    .eq('id', scheduleId)
    .single();

  if (schedErr || !schedule) {
    console.error('[ONBOARDING-BATCH] Schedule not found:', schedErr?.message);
    process.exit(1);
  }

  if (schedule.status !== 'pending') {
    console.log('[ONBOARDING-BATCH] Schedule status is', schedule.status, '— already ran, exiting');
    process.exit(0);
  }

  // 2. Mark running
  await supabase.from('daily_schedules').update({ status: 'running' }).eq('id', scheduleId);

  // 3. Get brand info
  const { data: brand } = await supabase
    .from('brands')
    .select('id, owner_user_id, onboarding_daily_report_id, first_report_status')
    .eq('id', schedule.brand_id)
    .single();

  if (!brand) {
    console.error('[ONBOARDING-BATCH] Brand not found:', schedule.brand_id);
    await supabase.from('daily_schedules').update({ status: 'failed' }).eq('id', scheduleId);
    process.exit(1);
  }

  // Brand already finalized — nothing left to do
  if (brand.first_report_status === 'succeeded') {
    console.log('[ONBOARDING-BATCH] Brand already succeeded — marking schedule complete');
    await supabase.from('daily_schedules').update({ status: 'completed' }).eq('id', scheduleId);
    process.exit(0);
  }

  // 4. Get ChatGPT account — fall back to any eligible account if not assigned
  let account = null;
  if (schedule.chatgpt_account_id) {
    const { data } = await supabase.from('chatgpt_accounts').select('id, email').eq('id', schedule.chatgpt_account_id).single();
    account = data;
  }
  if (!account) {
    const { data: fallback } = await supabase.from('chatgpt_accounts').select('id, email').eq('is_eligible', true).eq('status', 'active').not('proxy_host', 'is', null).limit(1).single();
    account = fallback;
    if (account) {
      console.log('[ONBOARDING-BATCH] No account assigned — using fallback account:', account.email);
      await supabase.from('daily_schedules').update({ chatgpt_account_id: account.id }).eq('id', scheduleId);
    }
  }
  if (!account) {
    console.error('[ONBOARDING-BATCH] No eligible ChatGPT account found');
    await supabase.from('daily_schedules').update({ status: 'failed' }).eq('id', scheduleId);
    process.exit(1);
  }

  // 5. Claim wave-2 prompts
  const batchSize = schedule.batch_size || 5;
  const claimedPrompts = await claimWave2Prompts(account.id, schedule.brand_id, batchSize);

  if (claimedPrompts.length === 0) {
    console.log('[ONBOARDING-BATCH] No wave-2 prompts available — all done or being processed by another batch');
    await supabase.from('daily_schedules').update({ status: 'completed' }).eq('id', scheduleId);
    // Fire /chunk-complete so queue-organizer can run the finalization check
    await fireChunkComplete(schedule.brand_id);
    process.exit(0);
  }

  console.log('[ONBOARDING-BATCH] Claimed', claimedPrompts.length, 'wave-2 prompts for brand', schedule.brand_id.substring(0, 8));

  // 6. Verify daily report exists
  const dailyReportId = brand.onboarding_daily_report_id;
  if (!dailyReportId) {
    console.error('[ONBOARDING-BATCH] No onboarding_daily_report_id on brand — cannot run');
    await releasePrompts(claimedPrompts.map(p => p.id));
    await supabase.from('daily_schedules').update({ status: 'failed' }).eq('id', scheduleId);
    process.exit(1);
  }

  // 7. Total prompt count for progress display
  const { count: totalPrompts } = await supabase
    .from('brand_prompts')
    .select('id', { count: 'exact', head: true })
    .eq('brand_id', schedule.brand_id)
    .in('status', ['active', 'inactive']);

  // 8. Spawn run-onboarding-chunk.js
  const today = new Date().toISOString().split('T')[0];
  const logPath = `/tmp/onboarding-batch-${schedule.brand_id.substring(0, 8)}-${Date.now()}.log`;
  const logFd = fs.openSync(logPath, 'w');
  console.log('[ONBOARDING-BATCH] Chunk log →', logPath);

  const exitCode = await new Promise((resolve) => {
    const child = spawn('node', [chunkScript], {
      stdio: ['ignore', logFd, logFd],
      cwd: __dirname,
      env: {
        ...process.env,
        BRAND_ID:             schedule.brand_id,
        DAILY_REPORT_ID:      dailyReportId,
        REPORT_DATE:          today,
        OWNER_USER_ID:        brand.owner_user_id || '',
        CHATGPT_ACCOUNT_EMAIL: account.email,
        CHATGPT_ACCOUNT_ID:   account.id,
        PROMPTS_JSON:         JSON.stringify(claimedPrompts),
        TOTAL_PROMPTS:        String(totalPrompts || 50),
        ONBOARDING_WAVE:      '2',
      },
    });

    try { fs.closeSync(logFd); } catch (e) {}

    child.on('close', async (code) => {
      if (code !== 0) {
        console.error('[ONBOARDING-BATCH] Chunk exited with code', code, '— log:', logPath);
        // Release any still-claimed prompts so the next batch can retry them
        await supabase
          .from('brand_prompts')
          .update({ onboarding_status: 'failed', onboarding_claimed_account_id: null, onboarding_claimed_at: null })
          .in('id', claimedPrompts.map(p => p.id))
          .eq('onboarding_status', 'claimed');
      }
      resolve(code);
    });
  });

  // 9. Mark schedule complete
  await supabase
    .from('daily_schedules')
    .update({ status: exitCode === 0 ? 'completed' : 'failed' })
    .eq('id', scheduleId);

  console.log('[ONBOARDING-BATCH] Done. Exit code:', exitCode);
  // run-onboarding-chunk.js already fired /chunk-complete — queue-organizer will handle finalization
}

async function claimWave2Prompts(accountId, brandId, count) {
  const { data: pending } = await supabase
    .from('brand_prompts')
    .select('id, raw_prompt, improved_prompt')
    .eq('brand_id', brandId)
    .eq('onboarding_wave', 2)
    .in('onboarding_status', ['pending', 'failed'])
    .order('created_at')
    .limit(count);

  if (!pending || pending.length === 0) return [];

  const claimed = [];
  const now = new Date().toISOString();
  for (const prompt of pending) {
    const { data: updated } = await supabase
      .from('brand_prompts')
      .update({
        onboarding_status: 'claimed',
        onboarding_claimed_account_id: accountId,
        onboarding_claimed_at: now,
      })
      .eq('id', prompt.id)
      .in('onboarding_status', ['pending', 'failed'])
      .select('id, raw_prompt, improved_prompt');
    if (updated && updated.length > 0) claimed.push(prompt);
  }
  return claimed;
}

async function releasePrompts(promptIds) {
  if (!promptIds || promptIds.length === 0) return;
  await supabase
    .from('brand_prompts')
    .update({ onboarding_status: 'pending', onboarding_claimed_account_id: null, onboarding_claimed_at: null })
    .in('id', promptIds);
}

async function fireChunkComplete(brandId) {
  const baseUrl = process.env.WEBHOOK_BASE_URL || 'http://135.181.203.202:3001';
  const secret  = process.env.WEBHOOK_SECRET || 'forensic-reinit-secret-2024';
  try {
    await fetch(`${baseUrl}/chunk-complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, brandId }),
    });
    console.log('[ONBOARDING-BATCH] Fired /chunk-complete for brand', brandId.substring(0, 8));
  } catch (err) {
    console.error('[ONBOARDING-BATCH] Failed to fire /chunk-complete:', err.message);
  }
}

main().catch(err => {
  console.error('[ONBOARDING-BATCH] Fatal error:', err.message, err.stack);
  process.exit(1);
});
