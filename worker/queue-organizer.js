#!/usr/bin/env node
/**
 * queue-organizer.js
 *
 * Event-driven two-phase onboarding queue organizer.
 * Replaces queue-checker.js.
 *
 * Triggered by:
 *   - Webhook POST /run-queue-organizer (on onboarding completion)
 *   - Webhook POST /chunk-complete (when a chunk finishes)
 *   - Cron fallback every 5 min (safety net only)
 *
 * Two-phase design:
 *   Phase 1: Dispatch wave-1 prompts (first 5, status=active) → partial EOD → user gets dashboard
 *   Phase 2: Dispatch wave-2 prompts (remaining 45, switched to active) → full EOD → complete results
 *
 * Prompt status lifecycle:
 *   complete-final sets: wave-1 → status='active', wave-2 → status='inactive'
 *   finalizePhase(wave=1) flips: wave-2 prompts → status='active' before Phase 2 dispatch
 *   Only status='active' prompts are ever claimed and dispatched.
 *
 * Key behaviors:
 *   - Wave-aware: only dispatches prompts for the current phase
 *   - Only claims status='active' prompts — inactive prompts are never touched
 *   - Balanced chunk sizing: ceil(pendingCount / availableAgents) so work splits evenly
 *     e.g. 5 wave-1 prompts × 2 agents → ceil(5/2)=3 each
 *   - Timeout owned by agent (run-onboarding-chunk.js): 2.5 min/prompt
 *   - No concurrent daily+onboarding: skips accounts with active daily batches
 *   - failed prompts = retriable (same as pending)
 *   - Max 3 accounts per brand onboarding at once
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const MINUTES_PER_PROMPT = 2.5;
const SESSION_MAX_PROMPTS = 5;       // Browserless 15-min session cap
const SAFETY_BUFFER_MINUTES = 1.5;   // Reserve before next daily batch
const MAX_ACCOUNTS_PER_BRAND = 3;    // Cap parallelism per brand
const RESERVE_WINDOW_MINUTES = 15;   // Block accounts with batch within 15 min
const STALE_CLAIM_MINUTES = 15;      // Reset claimed prompts older than this

const chunkScript = path.join(__dirname, 'run-onboarding-chunk.js');
const aioScript = path.join(__dirname, 'run-google-aio-prompts.js');
const claudeScript = path.join(__dirname, 'run-claude-prompts.js');

async function runQueueOrganizer() {
  console.log('[QUEUE-ORG] Starting at', new Date().toISOString());

  // 0. Reset stale claimed prompts (agent crashed or hard-timed-out without DB cleanup)
  //    Any prompt claimed >15 min ago with no completion = stuck. Reset to 'failed' so it retries.
  const staleClaimCutoff = new Date(Date.now() - STALE_CLAIM_MINUTES * 60 * 1000).toISOString();
  const { data: staleReset } = await supabase
    .from('brand_prompts')
    .update({
      onboarding_status: 'failed',
      onboarding_claimed_account_id: null,
      onboarding_claimed_at: null,
    })
    .eq('onboarding_status', 'claimed')
    .lt('onboarding_claimed_at', staleClaimCutoff)
    .select('id, brand_id');

  if (staleReset && staleReset.length > 0) {
    console.log('[QUEUE-ORG] Reset', staleReset.length, 'stale claimed prompt(s) to failed:', staleReset.map(p => p.id.substring(0, 8)).join(', '));
  }

  // 0a. Mark overdue pending batches as failed so the retry scheduler picks them up.
  //     A batch is overdue if its execution_time passed >10 min ago and it's still 'pending'
  //     (meaning cron never fired it — typically due to the 08:00–15:00 crontab dead window).
  //     Grace period of 10 min avoids racing with execute-batch.js on batches that just fired.
  const overdueCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: overdueMarked } = await supabase
    .from('daily_schedules')
    .update({
      status: 'failed',
      error_message: 'Auto-marked failed: cron never fired (execution_time elapsed >10min with status=pending)',
    })
    .eq('status', 'pending')
    .lt('execution_time', overdueCutoff)
    .select('id, batch_number, brand_id');

  if (overdueMarked && overdueMarked.length > 0) {
    console.log('[QUEUE-ORG] Marked', overdueMarked.length, 'overdue pending batch(es) as failed:', overdueMarked.map(b => `#${b.batch_number}`).join(', '));
  }

  // 0b. Dispatch due wave-2 onboarding batches (replaces crontab-based dispatch).
  //     Runs on every tick so there is no dead window. Sequential per brand — never
  //     dispatches a second batch for a brand that already has one running.
  await dispatchDueWave2Batches();

  // 0c. Safety sweep: catch brands stuck in phase1_complete where all wave-2 prompts completed
  //     but Phase 2 EOD was never triggered (last chunk's webhook failed, organizer crashed, etc.)
  //     Also catches: report already is_partial=false but brand status was not updated.
  {
    const { data: p1cBrands } = await supabase
      .from('brands')
      .select('id, owner_user_id, onboarding_daily_report_id')
      .eq('first_report_status', 'phase1_complete')
      .eq('onboarding_completed', true);

    for (const brand of (p1cBrands || [])) {
      if (!brand.onboarding_daily_report_id) continue;

      const { data: rep } = await supabase
        .from('daily_reports')
        .select('status, is_partial')
        .eq('id', brand.onboarding_daily_report_id)
        .single();

      // Case A: EOD already ran (is_partial=false) but brand status not updated → just fix brand
      if (rep && rep.status === 'completed' && rep.is_partial === false) {
        console.log('[QUEUE-ORG] SAFETY: brand', brand.id.substring(0, 8), 'report complete+is_partial=false but brand still phase1_complete — setting succeeded');
        await supabase.from('brands').update({ first_report_status: 'succeeded' }).eq('id', brand.id);
        continue;
      }

      // Case B: All wave-2 prompts completed but Phase 2 EOD never ran → trigger it now
      const [{ count: incomplete }, { count: completed }] = await Promise.all([
        supabase.from('brand_prompts').select('id', { count: 'exact', head: true })
          .eq('brand_id', brand.id).eq('onboarding_wave', 2)
          .in('onboarding_status', ['pending', 'claimed', 'failed']),
        supabase.from('brand_prompts').select('id', { count: 'exact', head: true })
          .eq('brand_id', brand.id).eq('onboarding_wave', 2)
          .eq('onboarding_status', 'completed'),
      ]);

      if (incomplete === 0 && completed > 0) {
        console.log('[QUEUE-ORG] SAFETY SWEEP: brand', brand.id.substring(0, 8),
          'phase1_complete + all', completed, 'wave-2 prompts done, Phase 2 EOD never triggered — running now');
        await finalizePhase(brand, 2);
      }
    }
  }

  // 1. Find brands with active onboarding (Phase 1 or Phase 2)
  const { data: activeBrands } = await supabase
    .from('brands')
    .select('id, owner_user_id, onboarding_phase, onboarding_daily_report_id, onboarding_prompts_sent, onboarding_answers, chatgpt_account_id')
    .in('first_report_status', ['queued', 'running', 'phase1_complete'])
    .eq('onboarding_completed', true);

  if (!activeBrands || activeBrands.length === 0) {
    console.log('[QUEUE-ORG] No active onboarding brands. Exiting.');
    return;
  }

  console.log('[QUEUE-ORG] Active brands:', activeBrands.map(b => `${b.id.substring(0, 8)}(phase${b.onboarding_phase})`).join(', '));

  // 2. For each brand, check pending/failed prompts for current wave.
  //    Wave-1 prompts are status='active' (set by complete-final).
  //    Wave-2 prompts stay status='inactive' throughout onboarding to avoid the plan
  //    active-prompt limit. They're dispatched purely by onboarding_wave + onboarding_status.
  //    finalizePhase(2) is the only place that flips all prompts to status='active' (for daily scheduling).
  const brandsWithWork = [];
  for (const brand of activeBrands) {
    const currentWave = brand.onboarding_phase || 1;
    let pendingQuery = supabase
      .from('brand_prompts')
      .select('id', { count: 'exact', head: true })
      .eq('brand_id', brand.id)
      .eq('onboarding_wave', currentWave)
      .in('onboarding_status', ['pending', 'failed']);
    // Wave-1 prompts are always status='active'; wave-2 stay 'inactive' during onboarding.
    if (currentWave === 1) pendingQuery = pendingQuery.eq('status', 'active');
    const { count } = await pendingQuery;

    if (count > 0) {
      if (currentWave === 2) {
        // Dispatch is handled by dispatchDueWave2Batches() above.
        // Self-healing: if pending prompts exist but no batches are scheduled or running,
        // re-inject so the next dispatchDueWave2Batches() call picks them up.
        const { count: scheduledCount } = await supabase
          .from('daily_schedules')
          .select('id', { count: 'exact', head: true })
          .eq('brand_id', brand.id)
          .eq('batch_type', 'onboarding')
          .in('status', ['pending', 'running']);
        if ((scheduledCount || 0) === 0) {
          console.log('[QUEUE-ORG] Brand', brand.id.substring(0, 8), '— wave-2 has', count, 'pending/failed prompts but no scheduled batches — re-injecting');
          await injectWave2IntoSchedule(brand);
        }
        continue;
      }
      brandsWithWork.push({ ...brand, currentWave, pendingCount: count });
    } else {
      // Wave has no active pending/failed — check if it also has no claimed (might be done)
      const { count: claimedCount } = await supabase
        .from('brand_prompts')
        .select('id', { count: 'exact', head: true })
        .eq('brand_id', brand.id)
        .eq('onboarding_wave', currentWave)
        .eq('onboarding_status', 'claimed');

      if (claimedCount === 0) {
        // Wave truly done — no pending, no claimed.
        console.log('[QUEUE-ORG] Brand', brand.id.substring(0, 8), 'wave', currentWave, 'complete — finalizing');
        await finalizePhase(brand, currentWave);
      } else {
        console.log('[QUEUE-ORG] Brand', brand.id.substring(0, 8), 'wave', currentWave, 'still has', claimedCount, 'claimed — waiting');
      }
    }
  }

  if (brandsWithWork.length === 0) {
    console.log('[QUEUE-ORG] No brands need dispatching. Exiting.');
    return;
  }

  // 3. Get available accounts (not running daily batch, not running onboarding)
  const accountStates = await getAccountStates();
  const dispatchableAccounts = accountStates.filter(a => calculatePromptsForAccount(a) > 0);

  if (dispatchableAccounts.length === 0) {
    console.log('[QUEUE-ORG] No accounts available right now. Exiting.');
    return;
  }

  console.log('[QUEUE-ORG] Dispatchable accounts:', dispatchableAccounts.map(a => `${a.email.split('@')[0]}(${a.state})`).join(', '));

  // 4. Dispatch: pair accounts with brands, claim prompts, spawn chunks
  //
  //    KEY: Balanced chunk sizing — divide work evenly across all available agents.
  //    e.g. 6 wave-1 prompts × 2 agents → ceil(6/2) = 3 each (not 5+1).
  //    This ensures full parallelism from the first organizer run.
  const childPromises = [];
  const brandDailyReportMap = new Map();
  const allAioPromptIds = []; // collects all claimed prompt IDs across chunks for AIO
  let accountsUsedForBrand = 0;

  const targetBrand = brandsWithWork[0]; // Process one brand at a time (simplest)

  // Calculate how many agents we'll actually use, then set target chunk per agent
  const maxAgentsForBrand = Math.min(dispatchableAccounts.length, MAX_ACCOUNTS_PER_BRAND);
  const targetChunkSize = Math.ceil(targetBrand.pendingCount / maxAgentsForBrand);
  console.log('[QUEUE-ORG] Brand', targetBrand.id.substring(0, 8), ':', targetBrand.pendingCount,
    'pending → target', targetChunkSize, 'per agent across', maxAgentsForBrand, 'agent(s)');

  for (const accountState of dispatchableAccounts) {
    if (accountsUsedForBrand >= MAX_ACCOUNTS_PER_BRAND) break;
    if (targetBrand.pendingCount === 0) break;

    // How many this agent can handle based on its schedule window
    const agentMax = calculatePromptsForAccount(accountState);
    if (agentMax === 0) continue;

    // Give this agent min(agentCapacity, balancedChunk, remaining)
    const promptsToGive = Math.min(agentMax, targetChunkSize, targetBrand.pendingCount);
    if (promptsToGive === 0) continue;

    // Claim prompts atomically (only status='active' prompts)
    const claimedPrompts = await claimPrompts(accountState.id, targetBrand.id, targetBrand.currentWave, promptsToGive);
    if (claimedPrompts.length === 0) {
      console.log('[QUEUE-ORG] Account', accountState.email, '— no prompts claimed (race), skipping');
      continue;
    }

    console.log('[QUEUE-ORG] Account', accountState.email, '— claimed', claimedPrompts.length, 'wave-' + targetBrand.currentWave + ' prompts for brand', targetBrand.id.substring(0, 8));
    allAioPromptIds.push(...claimedPrompts.map(p => p.id));

    // Auto-reinit: if this account previously failed prompts for this brand+wave,
    // its ChatGPT session is likely stale/broken — reinitialize before dispatching again.
    const hasPreviousFailures = await accountHasFailedPrompts(accountState.id, targetBrand.id, targetBrand.currentWave);
    if (hasPreviousFailures) {
      console.log('[QUEUE-ORG] Account', accountState.email, 'has prior failed prompts — triggering session reinit before dispatch');
      const reinitOk = await reinitializeSession(accountState.email);
      if (!reinitOk) {
        console.warn('[QUEUE-ORG] Reinit failed for', accountState.email, '— releasing claims, will retry on next organizer run');
        await releasePrompts(claimedPrompts.map(p => p.id));
        continue;
      }
    }

    // Flip brand to 'running' on first dispatch (idempotent — only if still 'queued')
    if (accountsUsedForBrand === 0) {
      await supabase
        .from('brands')
        .update({ first_report_status: 'running' })
        .eq('id', targetBrand.id)
        .eq('first_report_status', 'queued');
    }

    // Get or create daily report (using anchored ID if available)
    // total_prompts is always 50 — both phases write to the same report row
    const today = new Date().toISOString().split('T')[0];
    const dailyReportId = targetBrand.onboarding_daily_report_id
      || await getOrCreateDailyReport(targetBrand.id, today);

    if (!dailyReportId) {
      await releasePrompts(claimedPrompts.map(p => p.id));
      continue;
    }

    brandDailyReportMap.set(targetBrand.id, dailyReportId);

    // Get total prompts count for progress display
    const { count: totalPrompts } = await supabase
      .from('brand_prompts')
      .select('id', { count: 'exact', head: true })
      .eq('brand_id', targetBrand.id)
      .in('status', ['active', 'inactive']);

    // Spawn chunk child process — timeout is owned by the agent itself
    // Log output to /tmp so we can diagnose failures (previously stdio:'inherit' → no logs via webhook)
    const agentSlug = accountState.email.split('@')[0];
    const chunkLogPath = `/tmp/chunk-${targetBrand.id.substring(0, 8)}-${agentSlug}-${Date.now()}.log`;
    const chunkLogFd = fs.openSync(chunkLogPath, 'w');
    console.log('[QUEUE-ORG] Chunk log →', chunkLogPath);

    const childPromise = new Promise((resolve) => {
      const child = spawn('node', [chunkScript], {
        stdio: ['ignore', chunkLogFd, chunkLogFd],
        cwd: __dirname,
        env: {
          ...process.env,
          BRAND_ID: targetBrand.id,
          DAILY_REPORT_ID: dailyReportId,
          REPORT_DATE: today,
          OWNER_USER_ID: targetBrand.owner_user_id || '',
          CHATGPT_ACCOUNT_EMAIL: accountState.email,
          CHATGPT_ACCOUNT_ID: accountState.id,
          PROMPTS_JSON: JSON.stringify(claimedPrompts),
          TOTAL_PROMPTS: String(totalPrompts || 50),
          ONBOARDING_WAVE: String(targetBrand.currentWave),
        },
      });

      // Parent closes its copy of the fd immediately — child still holds its own inherited copy
      try { fs.closeSync(chunkLogFd); } catch (e) {}

      child.on('close', async (code) => {
        if (code !== 0) {
          // Agent handles its own timeout — just clean up any still-claimed prompts (e.g. hard crash)
          console.error('[QUEUE-ORG] Chunk exited with code', code, '— log:', chunkLogPath, '— marking any remaining claimed prompts as failed');
          await supabase
            .from('brand_prompts')
            .update({ onboarding_status: 'failed', onboarding_claimed_account_id: null, onboarding_claimed_at: null })
            .in('id', claimedPrompts.map(p => p.id))
            .eq('onboarding_status', 'claimed');
        }
        resolve(code);
      });
    });

    childPromises.push(childPromise);
    accountsUsedForBrand++;

    // Decrement remaining so next agent gets a fair share of what's left
    targetBrand.pendingCount = Math.max(0, targetBrand.pendingCount - claimedPrompts.length);
  }

  // Spawn Google AIO and Claude processes in parallel with ChatGPT (fire-and-forget)
  const extraReportId = brandDailyReportMap.get(targetBrand.id);
  if (allAioPromptIds.length > 0 && extraReportId) {
    const spawnExtra = (script, envKey, label) => {
      if (!process.env[envKey]) return;
      const logPath = `/tmp/${label}-${targetBrand.id.substring(0, 8)}-${Date.now()}.log`;
      const logFd = fs.openSync(logPath, 'w');
      const child = spawn('node', [script], {
        stdio: ['ignore', logFd, logFd],
        cwd: __dirname,
        detached: true,
        env: {
          ...process.env,
          BRAND_ID: targetBrand.id,
          DAILY_REPORT_ID: extraReportId,
          PROMPT_IDS_JSON: JSON.stringify(allAioPromptIds),
        },
      });
      try { fs.closeSync(logFd); } catch (e) {}
      child.unref();
      console.log(`[QUEUE-ORG] Spawned ${label} for`, allAioPromptIds.length, 'prompts → log:', logPath);
    };

    spawnExtra(aioScript,    'SERPAPI_KEY',       'aio');
    spawnExtra(claudeScript, 'ANTHROPIC_API_KEY', 'claude');
  }

  if (childPromises.length > 0) {
    console.log('[QUEUE-ORG] Waiting for', childPromises.length, 'chunk(s) running in parallel...');
    await Promise.all(childPromises);
    console.log('[QUEUE-ORG] All chunks complete.');

    // Post-completion: check if current wave is fully done → finalize phase
    for (const [brandId, dailyReportId] of brandDailyReportMap) {
      const brand = activeBrands.find(b => b.id === brandId);
      if (!brand) continue;
      const currentWave = brand.onboarding_phase || 1;

      // Wave-2 prompts stay status='inactive' during dispatch — don't filter by status for wave-2.
      let remainingQuery = supabase
        .from('brand_prompts')
        .select('id', { count: 'exact', head: true })
        .eq('brand_id', brandId)
        .eq('onboarding_wave', currentWave)
        .in('onboarding_status', ['pending', 'claimed', 'failed']);
      if (currentWave === 1) remainingQuery = remainingQuery.eq('status', 'active');
      const { count: remaining } = await remainingQuery;

      if (remaining === 0) {
        console.log('[QUEUE-ORG] Brand', brandId.substring(0, 8), 'wave', currentWave, 'complete — finalizing phase');
        await finalizePhase({ ...brand, onboarding_daily_report_id: dailyReportId }, currentWave);
      } else {
        console.log('[QUEUE-ORG] Brand', brandId.substring(0, 8), 'still has', remaining, 'failed/pending prompts — fresh organizer run already triggered by agent webhook');
      }
    }
  }

  console.log('[QUEUE-ORG] Done at', new Date().toISOString());
}

/**
 * Finalize a phase after all its wave prompts complete.
 * Phase 1: flip wave-2 prompts to active, run partial EOD, flip to phase1_complete + phase=2
 * Phase 2: run full EOD, flip to succeeded
 */
async function finalizePhase(brand, completedWave) {
  const brandId = brand.id;
  const dailyReportId = brand.onboarding_daily_report_id;

  if (!dailyReportId) {
    console.error('[QUEUE-ORG] No dailyReportId for brand', brandId.substring(0, 8), '— cannot finalize');
    return;
  }

  // Idempotency check
  const { data: currentBrand } = await supabase
    .from('brands')
    .select('first_report_status')
    .eq('id', brandId)
    .single();

  if (completedWave === 1) {
    if (currentBrand?.first_report_status === 'phase1_complete' || currentBrand?.first_report_status === 'succeeded') {
      console.log('[QUEUE-ORG] Brand', brandId.substring(0, 8), 'phase 1 already finalized');
      return;
    }

    console.log('[QUEUE-ORG] Finalizing Phase 1 for brand', brandId.substring(0, 8));
    // Wave-2 prompts intentionally stay status='inactive' during Phase 2 dispatch.
    // They are dispatched based on onboarding_wave+onboarding_status only, bypassing
    // the plan's active-prompt limit. finalizePhase(2) flips all to status='active'.

    // Run partial EOD (brand analysis + visibility score only — no Tavily)
    try {
      const { processEndOfDay } = require('./end-of-day-processor');
      await processEndOfDay(dailyReportId, { phase: 1 });
      console.log('[QUEUE-ORG] Phase 1 EOD complete for brand', brandId.substring(0, 8));
    } catch (err) {
      console.warn('[QUEUE-ORG] Phase 1 EOD error (non-fatal):', err.message);
    }

    // Mark daily_report as partially done
    await supabase
      .from('daily_reports')
      .update({ is_partial: true })
      .eq('id', dailyReportId);

    // Count wave-1 completed prompts for progress
    const { count: wave1Completed } = await supabase
      .from('brand_prompts')
      .select('id', { count: 'exact', head: true })
      .eq('brand_id', brandId)
      .eq('onboarding_wave', 1)
      .eq('onboarding_status', 'completed');

    // Advance brand to phase1_complete, set phase=2 so next organizer run dispatches wave-2
    await supabase
      .from('brands')
      .update({
        first_report_status: 'phase1_complete',
        onboarding_prompts_sent: wave1Completed || 5,
        onboarding_phase: 2,
      })
      .eq('id', brandId)
      .in('first_report_status', ['queued', 'running']);

    console.log('[QUEUE-ORG] Brand', brandId.substring(0, 8), '→ phase1_complete. Phase set to 2. Wave-2 prompts now active.');

    await ensureUserInTable(brand.owner_user_id);

    // Create wave-2 batch schedule rows in daily_schedules.
    // queue-organizer dispatches them on every 5-min tick via dispatchDueWave2Batches()
    // (no crontab — avoids dead windows and enforces sequential per-brand execution).
    await injectWave2IntoSchedule(brand);

  } else if (completedWave === 2) {
    if (currentBrand?.first_report_status === 'succeeded') {
      console.log('[QUEUE-ORG] Brand', brandId.substring(0, 8), 'phase 2 already finalized');
      return;
    }

    console.log('[QUEUE-ORG] Finalizing Phase 2 for brand', brandId.substring(0, 8));

    // Run full EOD pipeline
    try {
      const { processEndOfDay } = require('./end-of-day-processor');
      await processEndOfDay(dailyReportId, { phase: 2 });
      console.log('[QUEUE-ORG] Phase 2 EOD complete for brand', brandId.substring(0, 8));
    } catch (err) {
      console.warn('[QUEUE-ORG] Phase 2 EOD error (non-fatal):', err.message);
    }

    // Count all completed prompts (V2 has ~50, V1 has 30 — use actual count)
    const { count: totalCompleted } = await supabase
      .from('brand_prompts')
      .select('id', { count: 'exact', head: true })
      .eq('brand_id', brandId)
      .eq('onboarding_status', 'completed');

    // Mark daily_report as fully complete with the real prompt count
    await supabase
      .from('daily_reports')
      .update({ status: 'completed', completed_at: new Date().toISOString(), is_partial: false, total_prompts: totalCompleted || 50 })
      .eq('id', dailyReportId);

    // Mark brand as fully succeeded
    await supabase
      .from('brands')
      .update({
        first_report_status: 'succeeded',
        chatgpt_account_id: null,
        onboarding_prompts_sent: totalCompleted || 50,
      })
      .eq('id', brandId)
      .in('first_report_status', ['phase1_complete', 'running']);

    await ensureUserInTable(brand.owner_user_id);

    // Flip all wave-2 prompts from inactive → active so they join the daily scheduling pool.
    // Wave-2 prompts stayed inactive throughout onboarding to avoid the plan trigger during dispatch.
    // Now that onboarding is complete and the trigger allows 50 for starter plan, we activate them.
    const { data: activated, error: activateErr } = await supabase
      .from('brand_prompts')
      .update({ status: 'active', is_active: true })
      .eq('brand_id', brandId)
      .eq('onboarding_wave', 2)
      .eq('status', 'inactive')
      .select('id');
    if (activateErr) {
      console.error('[QUEUE-ORG] Wave-2 final activation error:', activateErr.message);
    } else {
      console.log('[QUEUE-ORG] Activated', activated?.length || 0, 'wave-2 prompts for daily scheduling');
    }

    // Inject brand into tomorrow's daily schedule so daily reports start the very next day.
    // The nightly scheduler already ran (at noon) so we add this brand's batches directly.
    await injectBrandIntoTomorrowSchedule(brand);

    console.log('[QUEUE-ORG] Brand', brandId.substring(0, 8), '→ succeeded. Onboarding complete!');
  }
}

// ── Dispatch due wave-2 onboarding batches ────────────────────────────────────
// Runs on every queue-organizer tick. Replaces crontab-based dispatch entirely.
// Sequential per brand: never fires a second batch for a brand already running one.
// Fire-and-forget: detached child, organizer does not wait for completion.
async function dispatchDueWave2Batches() {
  const now = new Date().toISOString();

  // Brands that already have a running onboarding batch — skip them this tick
  const { data: runningBatches } = await supabase
    .from('daily_schedules')
    .select('brand_id')
    .eq('batch_type', 'onboarding')
    .eq('status', 'running');

  const runningBrandIds = new Set((runningBatches || []).map(b => b.brand_id));

  // All due pending onboarding batches (execution_time has passed), oldest first
  const { data: dueBatches } = await supabase
    .from('daily_schedules')
    .select('id, brand_id, batch_number, execution_time')
    .eq('batch_type', 'onboarding')
    .eq('status', 'pending')
    .lte('execution_time', now)
    .order('execution_time', { ascending: true });

  if (!dueBatches || dueBatches.length === 0) return;

  const dispatchedBrands = new Set();
  for (const batch of dueBatches) {
    if (runningBrandIds.has(batch.brand_id)) {
      console.log('[WAVE2-DISPATCH] Brand', batch.brand_id.substring(0, 8), '— batch already running, skipping #' + batch.batch_number);
      continue;
    }
    if (dispatchedBrands.has(batch.brand_id)) continue; // one dispatch per brand per tick

    console.log('[WAVE2-DISPATCH] Dispatching onboarding batch #' + batch.batch_number, 'for brand', batch.brand_id.substring(0, 8));
    const logPath = `/tmp/onboarding-dispatch-${batch.brand_id.substring(0, 8)}-${Date.now()}.log`;
    const logFd = fs.openSync(logPath, 'w');
    const child = spawn('node', [path.join(__dirname, 'execute-onboarding-batch.js'), batch.id], {
      stdio: ['ignore', logFd, logFd],
      cwd: __dirname,
      detached: true,
    });
    try { fs.closeSync(logFd); } catch (e) {}
    child.unref();

    dispatchedBrands.add(batch.brand_id);
    console.log('[WAVE2-DISPATCH] Spawned execute-onboarding-batch.js for schedule', batch.id.substring(0, 8), '→ log:', logPath);
  }

  if (dispatchedBrands.size > 0) {
    console.log('[WAVE2-DISPATCH] Dispatched', dispatchedBrands.size, 'onboarding batch(es) this tick');
  }
}

// ── Inject wave-2 onboarding batches into daily_schedules ────────────────────
// Called from finalizePhase(1) and from the self-healing check in the main loop.
// Distributes batches across ALL eligible accounts using greedy earliest-free-slot
// assignment. Guard prevents duplicate insertions.
// Rows are dispatched by dispatchDueWave2Batches() — NOT loaded into crontab.
async function injectWave2IntoSchedule(brand) {
  const WINDOW_MS         = 4 * 60 * 60 * 1000;
  const MIN_SPACING_MS    = 10 * 60 * 1000;
  const BATCH_DURATION_MS = SESSION_MAX_PROMPTS * MINUTES_PER_PROMPT * 60 * 1000;
  const CLEARANCE_MS      = BATCH_DURATION_MS + MIN_SPACING_MS;

  const now       = Date.now();
  const windowEnd = now + WINDOW_MS;

  const { data: fullBrand } = await supabase
    .from('brands')
    .select('owner_user_id')
    .eq('id', brand.id)
    .single();

  const ownerUserId = fullBrand?.owner_user_id || brand.owner_user_id;

  // Guard: if wave-2 batches already scheduled today, don't insert duplicates
  const today = new Date().toISOString().split('T')[0];
  const { count: alreadyScheduled } = await supabase
    .from('daily_schedules')
    .select('id', { count: 'exact', head: true })
    .eq('brand_id', brand.id)
    .eq('schedule_date', today)
    .eq('batch_type', 'onboarding')
    .in('status', ['pending', 'running']);

  if (alreadyScheduled > 0) {
    console.log('[WAVE2-SCHED] Wave-2 already scheduled for brand', brand.id.substring(0, 8), `(${alreadyScheduled} batches) — skipping`);
    return;
  }

  const { count: wave2Count } = await supabase
    .from('brand_prompts')
    .select('id', { count: 'exact', head: true })
    .eq('brand_id', brand.id)
    .eq('onboarding_wave', 2)
    .in('onboarding_status', ['pending', 'failed']);

  if (!wave2Count || wave2Count === 0) {
    console.log('[WAVE2-SCHED] No wave-2 prompts remaining for brand', brand.id.substring(0, 8), '— all done');
    return;
  }

  const numBatches = Math.ceil(wave2Count / SESSION_MAX_PROMPTS);
  console.log('[WAVE2-SCHED] Planning', numBatches, 'batches for', wave2Count, 'remaining wave-2 prompts over next 4h');

  // Fetch all eligible accounts
  const { data: accounts } = await supabase
    .from('chatgpt_accounts')
    .select('id, email')
    .eq('is_eligible', true)
    .eq('status', 'active')
    .not('proxy_host', 'is', null);

  if (!accounts || accounts.length === 0) {
    console.log('[WAVE2-SCHED] No eligible accounts — cannot schedule wave-2');
    return;
  }

  // Fetch existing pending/running batches for all eligible accounts in the 4h window
  const { data: existingBatches } = await supabase
    .from('daily_schedules')
    .select('chatgpt_account_id, execution_time, batch_size')
    .in('chatgpt_account_id', accounts.map(a => a.id))
    .gte('execution_time', new Date(now).toISOString())
    .lte('execution_time', new Date(windowEnd).toISOString())
    .in('status', ['pending', 'running'])
    .order('execution_time', { ascending: true });

  // Build per-account cursor: earliest time this account can start a new batch
  const accountCursors = accounts.map(account => {
    const slots = (existingBatches || [])
      .filter(b => b.chatgpt_account_id === account.id)
      .map(b => {
        const start = new Date(b.execution_time).getTime();
        return { start, end: start + (b.batch_size || 3) * MINUTES_PER_PROMPT * 60 * 1000 };
      })
      .sort((a, b) => a.start - b.start);

    let cursor = now + 60 * 1000;
    for (const slot of slots) {
      if (cursor + CLEARANCE_MS > slot.start - MIN_SPACING_MS) {
        cursor = Math.max(cursor, slot.end + MIN_SPACING_MS);
      }
    }
    return { account, cursor };
  });

  console.log('[WAVE2-SCHED] Eligible accounts (' + accounts.length + '):');
  accountCursors.forEach(({ account, cursor }) => {
    console.log(`  [WAVE2-SCHED]   ${account.email}: free in ${Math.round((cursor - now) / 60000)}min`);
  });

  // Greedy assignment: always assign next batch to account with earliest free cursor
  const { data: maxBatchRow } = await supabase
    .from('daily_schedules')
    .select('batch_number')
    .eq('schedule_date', today)
    .order('batch_number', { ascending: false })
    .limit(1)
    .single();
  const maxBatchNum = maxBatchRow?.batch_number || 0;

  const records = [];
  for (let i = 0; i < numBatches; i++) {
    accountCursors.sort((a, b) => a.cursor - b.cursor);
    const best = accountCursors[0];
    records.push({
      schedule_date:      today,
      user_id:            ownerUserId,
      brand_id:           brand.id,
      chatgpt_account_id: best.account.id,
      batch_number:       maxBatchNum + i + 1,
      execution_time:     new Date(Math.round(best.cursor)).toISOString(),
      prompt_ids:         [],
      batch_size:         SESSION_MAX_PROMPTS,
      status:             'pending',
      batch_type:         'onboarding',
    });
    best.cursor += CLEARANCE_MS;
  }

  const { error } = await supabase.from('daily_schedules').insert(records);
  if (error) {
    console.error('[WAVE2-SCHED] Failed to insert wave-2 schedule rows:', error.message);
    return;
  }

  console.log('[WAVE2-SCHED] Inserted', records.length, 'onboarding batches across', accounts.length, 'account(s):');
  records.forEach((r, i) => {
    const acct = accounts.find(a => a.id === r.chatgpt_account_id);
    const minFrom = Math.round((new Date(r.execution_time).getTime() - now) / 60000);
    console.log(`  [WAVE2-SCHED]   Batch ${i + 1}/${numBatches}: ${acct?.email} T+${minFrom}min = ${r.execution_time}`);
  });

  console.log('[WAVE2-SCHED] Wave-2 batches inserted — queue-organizer will dispatch on next tick (no crontab).');
}

// ── Inject a newly onboarded brand into tomorrow's daily schedule ─────────────
// Called after finalizePhase(2) so the brand's daily reports start the next day.
// Adds only this brand's batches — does not regenerate or touch other brands.
async function injectBrandIntoTomorrowSchedule(brand) {
  try {
    // Determine which days to inject for this brand.
    //
    // Problem: if wave-2 finishes after UTC midnight, the nightly scheduler
    // already ran for UTC "today" WITHOUT this brand (they weren't succeeded yet).
    // Simply injecting for UTC "tomorrow" leaves a one-day gap in the user's timeline.
    //
    // Fix: check if the nightly already ran today (any other brand has schedules for
    // UTC "today"). If yes → inject for TODAY as well as TOMORROW so there's no gap.
    // If no → inject for TOMORROW only (nightly hasn't run yet, it will handle today).

    const utcToday    = new Date().toISOString().split('T')[0];
    const tomorrowDt  = new Date();
    tomorrowDt.setUTCDate(tomorrowDt.getUTCDate() + 1);
    const utcTomorrow = tomorrowDt.toISOString().split('T')[0];

    // Did today's nightly already run? (any schedule exists for utcToday from another brand)
    const { data: todaySchedules } = await supabase
      .from('daily_schedules')
      .select('id')
      .eq('schedule_date', utcToday)
      .neq('brand_id', brand.id)
      .limit(1);
    const nightlyAlreadyRan = todaySchedules && todaySchedules.length > 0;

    // Always inject only for tomorrow — wave-2 onboarding already covers today's report.
    // (The old logic injected for today when the nightly had already run, but that causes
    // duplicate ChatGPT execution on onboarding day since wave-2 batches cover the same prompts.)
    const datesToInject = [utcTomorrow];
    console.log('[INJECT] Nightly already ran today:', nightlyAlreadyRan, '→ injecting for tomorrow only:', utcTomorrow);

    // Get brand's active prompts
    const { data: prompts } = await supabase
      .from('brand_prompts')
      .select('id')
      .eq('brand_id', brand.id)
      .eq('status', 'active');

    if (!prompts || prompts.length === 0) {
      console.log('[INJECT] No active prompts for brand', brand.id.substring(0, 8), '— skipping');
      return;
    }

    for (const scheduleDate of datesToInject) {
      // Idempotency — skip if already scheduled for this date
      const { data: alreadyScheduled } = await supabase
        .from('daily_schedules')
        .select('id')
        .eq('schedule_date', scheduleDate)
        .eq('brand_id', brand.id)
        .limit(1);
      if (alreadyScheduled && alreadyScheduled.length > 0) {
        console.log('[INJECT] Brand already scheduled for', scheduleDate, '— skipping');
        continue;
      }
      await injectForDate(brand, prompts, scheduleDate);
    }

    // Reload crontab so today's injected batches actually fire.
    // load-daily-schedule.js is a one-shot at 15:00 UTC — any rows inserted after that
    // won't have cron entries unless we re-run it here.
    console.log('[INJECT] Reloading crontab via load-daily-schedule.js...');
    const loadResult = spawnSync('node', [path.join(__dirname, 'load-daily-schedule.js')], {
      stdio: 'inherit',
      cwd: __dirname,
    });
    if (loadResult.status !== 0) {
      console.error('[INJECT] load-daily-schedule exited with status', loadResult.status);
    } else {
      console.log('[INJECT] Crontab reloaded successfully.');
    }
  } catch (err) {
    console.error('[INJECT] injectBrandIntoTomorrowSchedule error:', err.message);
  }
}

// Shared helper — injects batches for a single date
async function injectForDate(brand, prompts, scheduleDate) {
  try {

    // Get eligible ChatGPT accounts
    const { data: accounts } = await supabase
      .from('chatgpt_accounts')
      .select('id, email')
      .eq('status', 'active')
      .eq('is_eligible', true)
      .not('proxy_host', 'is', null);

    if (!accounts || accounts.length === 0) {
      console.log('[INJECT] No eligible accounts — skipping injection');
      return;
    }

    // Read existing execution times for tomorrow to avoid slot conflicts
    const { data: existingSlots } = await supabase
      .from('daily_schedules')
      .select('execution_time, batch_number')
      .eq('schedule_date', scheduleDate)
      .order('batch_number', { ascending: false });

    const occupiedMins = new Set(
      (existingSlots || []).map(s => {
        const d = new Date(s.execution_time);
        return d.getUTCHours() * 60 + d.getUTCMinutes(); // store as UTC minutes
      })
    );

    const maxBatchNum = (existingSlots || [])[0]?.batch_number || 0;

    // Create batches of 1–6 prompts
    const MIN_BATCH = 1, MAX_BATCH = 6, MIN_SPACING = 10;
    // 8 AM – 6 PM Pacific = 16:00–02:00 UTC. Use a UTC equivalent range.
    // Pacific Standard Time = UTC-8, so 8 AM PST = 16:00 UTC, 6 PM PST = 02:00 UTC next day.
    // To keep it simple and match the generator, use 08:00–18:00 UTC+0 offset window.
    // The generator uses `${scheduleDate}T${h}:${m}:00-08:00` so hour 8-18 are PST hours.
    // We'll store minutes as PST (hour 8–18 = minute 480–1080).
    const SLOT_START = 0 * 60;   // 00:00 UTC
    const SLOT_END   = 20 * 60;  // 20:00 UTC

    const batches = [];
    let remaining = [...prompts];
    while (remaining.length > 0) {
      const size = Math.min(
        Math.floor(Math.random() * (MAX_BATCH - MIN_BATCH + 1)) + MIN_BATCH,
        remaining.length
      );
      batches.push(remaining.splice(0, size));
    }

    // Find a free time slot for each batch
    const assignedSlots = [];
    for (let i = 0; i < batches.length; i++) {
      let found = false;
      for (let attempt = 0; attempt < 50000 && !found; attempt++) {
        const candidate = SLOT_START + Math.floor(Math.random() * (SLOT_END - SLOT_START));
        let tooClose = false;
        for (const taken of occupiedMins) {
          if (Math.abs(candidate - taken) < MIN_SPACING) { tooClose = true; break; }
        }
        for (const s of assignedSlots) {
          if (Math.abs(candidate - s) < MIN_SPACING) { tooClose = true; break; }
        }
        if (!tooClose) {
          assignedSlots.push(candidate);
          occupiedMins.add(candidate);
          found = true;
        }
      }
      if (!found) {
        console.warn('[INJECT] Schedule full — could only fit', i, '/', batches.length, 'batches');
        batches.splice(i); // drop remaining batches we couldn't place
        break;
      }
    }

    assignedSlots.sort((a, b) => a - b);

    // Build records
    const records = batches.slice(0, assignedSlots.length).map((batch, i) => {
      const slotMin  = assignedSlots[i];
      const h        = Math.floor(slotMin / 60);
      const m        = slotMin % 60;
      const execTime = new Date(`${scheduleDate}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`);
      const account  = accounts[i % accounts.length];
      return {
        schedule_date:       scheduleDate,
        user_id:             brand.owner_user_id,
        brand_id:            brand.id,
        chatgpt_account_id:  account.id,
        batch_number:        maxBatchNum + i + 1,
        execution_time:      execTime.toISOString(),
        prompt_ids:          batch.map(p => p.id),
        batch_size:          batch.length,
        status:              'pending',
      };
    });

    const { data: inserted, error } = await supabase.from('daily_schedules').insert(records).select('id');
    if (error) {
      console.error('[INJECT] Failed to insert schedule batches:', error.message);
    } else {
      console.log('[INJECT] Injected', records.length, 'batches (', prompts.length, 'prompts) for "' + (brand.name || brand.id.substring(0, 8)) + '" into', scheduleDate);

      // Create pending BME rows per schedule so forensic Table D shows all 3 models from the start
      // (mirrors what generate-nightly-schedule-BRAND-AWARE.js does for regular brands)
      if (inserted && inserted.length > 0) {
        const bmeRows = inserted.flatMap(s => [
          { schedule_id: s.id, model: 'chatgpt',            status: 'pending' },
          { schedule_id: s.id, model: 'google_ai_overview', status: 'pending' },
          { schedule_id: s.id, model: 'claude',             status: 'pending' },
        ]);
        const { error: bmeError } = await supabase.from('batch_model_executions').insert(bmeRows);
        if (bmeError) console.warn('[INJECT] BME rows creation failed:', bmeError.message);
        else console.log('[INJECT] Created', bmeRows.length, 'BME tracking rows (3 per batch)');
      }
    }
  } catch (err) {
    console.error('[INJECT] injectBrandIntoTomorrowSchedule error:', err.message);
    // Non-fatal — onboarding already succeeded, injection failure just means manual recovery
  }
}

async function ensureUserInTable(userId) {
  if (!userId) return;
  try {
    const { data: authData } = await supabase.auth.admin.getUserById(userId);
    if (authData?.user) {
      await supabase
        .from('users')
        .upsert(
          { id: authData.user.id, email: authData.user.email, subscription_plan: 'starter', reports_enabled: true },
          { onConflict: 'id', ignoreDuplicates: true }
        );
      console.log('[QUEUE-ORG] Ensured user in users table:', authData.user.email);
    }
  } catch (err) {
    console.warn('[QUEUE-ORG] Could not upsert user:', err.message);
  }
}

async function getAccountStates() {
  const now = new Date();
  const reserveWindowEnd = new Date(now.getTime() + RESERVE_WINDOW_MINUTES * 60 * 1000);

  const [
    { data: accounts },
    { data: runningBatches },
    { data: reservedBatches },
    { data: claimedOnboardingPrompts },
  ] = await Promise.all([
    supabase.from('chatgpt_accounts')
      .select('id, email, last_connection_at')
      .eq('is_eligible', true)
      .eq('status', 'active')
      .not('proxy_host', 'is', null),
    supabase.from('daily_schedules')
      .select('chatgpt_account_id, batch_size, execution_time')
      .eq('status', 'running'),
    supabase.from('daily_schedules')
      .select('chatgpt_account_id, batch_size, execution_time')
      .eq('status', 'pending')
      .gte('execution_time', now.toISOString())
      .lte('execution_time', reserveWindowEnd.toISOString()),
    supabase.from('brand_prompts')
      .select('onboarding_claimed_account_id')
      .eq('onboarding_status', 'claimed')
      .not('onboarding_claimed_account_id', 'is', null),
  ]);

  if (!accounts || accounts.length === 0) return [];

  const onboardingAccountIds = new Set(
    (claimedOnboardingPrompts || []).map(p => p.onboarding_claimed_account_id)
  );

  return accounts.map(account => {
    const dailyBatch = (runningBatches || []).find(b => b.chatgpt_account_id === account.id);
    const reserved = (reservedBatches || []).find(b => b.chatgpt_account_id === account.id);
    const busyOnboarding = onboardingAccountIds.has(account.id);

    if (dailyBatch) {
      const batchStart = new Date(dailyBatch.execution_time);
      const estimatedFreeAt = new Date(batchStart.getTime() + (dailyBatch.batch_size || 3) * MINUTES_PER_PROMPT * 60 * 1000);
      return { ...account, state: 'BUSY:daily', estimatedFreeAt };
    }

    if (busyOnboarding) {
      return { ...account, state: 'BUSY:onboarding', estimatedFreeAt: null };
    }

    if (reserved) {
      const batchStart = new Date(reserved.execution_time);
      const estimatedFreeAt = new Date(batchStart.getTime() + (reserved.batch_size || 3) * MINUTES_PER_PROMPT * 60 * 1000);
      return { ...account, state: 'RESERVED', estimatedFreeAt, nextBatchAt: reserved.execution_time };
    }

    return { ...account, state: 'FREE', estimatedFreeAt: null };
  });
}

/**
 * Returns the max prompts this account can handle right now.
 * FREE → SESSION_MAX_PROMPTS (5)
 * RESERVED → based on minutes until next batch minus safety buffer
 * BUSY → 0 (skip)
 */
function calculatePromptsForAccount(accountState) {
  if (accountState.state === 'FREE') return SESSION_MAX_PROMPTS;
  if (accountState.state === 'RESERVED') {
    const minutesUntilBatch = (new Date(accountState.nextBatchAt).getTime() - Date.now()) / 60000;
    const available = minutesUntilBatch - SAFETY_BUFFER_MINUTES;
    if (available < MINUTES_PER_PROMPT) return 0;
    return Math.min(SESSION_MAX_PROMPTS, Math.floor(available / MINUTES_PER_PROMPT));
  }
  return 0; // BUSY:daily or BUSY:onboarding
}

async function claimPrompts(accountId, brandId, wave, count) {
  // Wave-1 prompts are status='active'; wave-2 stay status='inactive' during onboarding.
  // Claim based on onboarding_wave + onboarding_status; only add status filter for wave-1.
  let claimQuery = supabase
    .from('brand_prompts')
    .select('id, raw_prompt, improved_prompt')
    .eq('brand_id', brandId)
    .eq('onboarding_wave', wave)
    .in('onboarding_status', ['pending', 'failed'])
    .order('created_at')
    .limit(count);
  if (wave === 1) claimQuery = claimQuery.eq('status', 'active');
  const { data: pendingPrompts } = await claimQuery;

  if (!pendingPrompts || pendingPrompts.length === 0) return [];

  const claimed = [];
  const now = new Date().toISOString();

  for (const prompt of pendingPrompts) {
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

    if (updated && updated.length > 0) {
      claimed.push(prompt);
    }
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

// Always creates with total_prompts=50 since both phases write to the same report row
async function getOrCreateDailyReport(brandId, today) {
  const { data: existing } = await supabase
    .from('daily_reports')
    .select('id')
    .eq('brand_id', brandId)
    .eq('report_date', today)
    .single();

  if (existing?.id) return existing.id;

  const { data: newReport, error } = await supabase
    .from('daily_reports')
    .insert({
      brand_id: brandId,
      report_date: today,
      status: 'running',
      total_prompts: 50,
      is_partial: true,
    })
    .select('id')
    .single();

  if (error || !newReport) {
    console.error('[QUEUE-ORG] Failed to create daily_report:', error?.message);
    return null;
  }

  await supabase
    .from('brands')
    .update({ onboarding_daily_report_id: newReport.id })
    .eq('id', brandId)
    .is('onboarding_daily_report_id', null);

  return newReport.id;
}

// ── Auto-reinit helpers ───────────────────────────────────────────────────────

/**
 * Returns true if this account has any failed prompts for this brand+wave.
 * A failed prompt means the account's previous chunk timed out or crashed
 * without completing it — indicating a stale/broken session.
 */
async function accountHasFailedPrompts(accountId, brandId, wave) {
  const { count } = await supabase
    .from('brand_prompts')
    .select('id', { count: 'exact', head: true })
    .eq('brand_id', brandId)
    .eq('onboarding_wave', wave)
    .eq('onboarding_claimed_account_id', accountId)
    .eq('onboarding_status', 'failed');
  return (count || 0) > 0;
}

/**
 * Calls /initialize-session for the given account and waits for it to complete.
 * The webhook handler blocks until the session script exits (success or failure).
 * Times out after 5 minutes to prevent queue-organizer from hanging forever.
 * Returns true on success, false on failure/timeout.
 */
async function reinitializeSession(accountEmail) {
  const baseUrl = process.env.WEBHOOK_BASE_URL || 'http://135.181.203.202:3001';
  const webhookSecret = process.env.WEBHOOK_SECRET || 'forensic-reinit-secret-2024';
  const REINIT_TIMEOUT_MS = 5 * 60 * 1000; // 5 min max

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), REINIT_TIMEOUT_MS);
    const res = await fetch(`${baseUrl}/initialize-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: webhookSecret, accountEmail }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (res.ok) {
      console.log('[QUEUE-ORG] Session reinit OK for', accountEmail);
      return true;
    }
    console.warn('[QUEUE-ORG] Session reinit failed for', accountEmail, '— HTTP', res.status);
    return false;
  } catch (err) {
    console.error('[QUEUE-ORG] Session reinit error for', accountEmail, ':', err.message);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────

runQueueOrganizer().catch(err => {
  console.error('[QUEUE-ORG] Fatal error:', err.message, err.stack);
  process.exit(1);
});
