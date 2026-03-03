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
 *   Phase 1: Dispatch wave-1 prompts (first 6) → partial EOD → user gets dashboard
 *   Phase 2: Dispatch wave-2 prompts (remaining 24) → full EOD → complete results
 *
 * Key behaviors:
 *   - Wave-aware: only dispatches prompts for the current phase
 *   - Dynamic chunk sizing: min(5, floor(availableMinutes / 2.5))
 *   - Timeout owned by agent (run-onboarding-chunk.js): 2.5 min/prompt
 *   - No concurrent daily+onboarding: skips accounts with active daily batches
 *   - failed prompts = retriable (same as pending)
 *   - Max 3 accounts per brand onboarding at once
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { spawn } = require('child_process');
const path = require('path');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const MINUTES_PER_PROMPT = 2.5;
const SESSION_MAX_PROMPTS = 5;       // Browserless 15-min session cap
const SAFETY_BUFFER_MINUTES = 1.5;   // Reserve before next daily batch
const MAX_ACCOUNTS_PER_BRAND = 3;    // Cap parallelism per brand
const RESERVE_WINDOW_MINUTES = 15;   // Block accounts with batch within 15 min

const chunkScript = path.join(__dirname, 'run-onboarding-chunk.js');

async function runQueueOrganizer() {
  console.log('[QUEUE-ORG] Starting at', new Date().toISOString());

  // 1. Find brands with active onboarding (Phase 1 or Phase 2)
  const { data: activeBrands } = await supabase
    .from('brands')
    .select('id, owner_user_id, onboarding_phase, onboarding_daily_report_id, onboarding_prompts_sent')
    .in('first_report_status', ['queued', 'running', 'phase1_complete'])
    .eq('onboarding_completed', true);

  if (!activeBrands || activeBrands.length === 0) {
    console.log('[QUEUE-ORG] No active onboarding brands. Exiting.');
    return;
  }

  console.log('[QUEUE-ORG] Active brands:', activeBrands.map(b => `${b.id.substring(0, 8)}(phase${b.onboarding_phase})`).join(', '));

  // 2. For each brand, check pending/failed prompts for current wave
  const brandsWithWork = [];
  for (const brand of activeBrands) {
    const currentWave = brand.onboarding_phase || 1;
    const { count } = await supabase
      .from('brand_prompts')
      .select('id', { count: 'exact', head: true })
      .eq('brand_id', brand.id)
      .eq('onboarding_wave', currentWave)
      .in('onboarding_status', ['pending', 'failed']);

    if (count > 0) {
      brandsWithWork.push({ ...brand, currentWave, pendingCount: count });
    } else {
      // Wave has no pending/failed — check if it also has no claimed (might be done)
      const { count: claimedCount } = await supabase
        .from('brand_prompts')
        .select('id', { count: 'exact', head: true })
        .eq('brand_id', brand.id)
        .eq('onboarding_wave', currentWave)
        .eq('onboarding_status', 'claimed');

      if (claimedCount === 0) {
        // Wave fully done — finalize this phase
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
  const childPromises = [];
  const brandDailyReportMap = new Map();
  let accountsUsedForBrand = 0;

  const targetBrand = brandsWithWork[0]; // Process one brand at a time (simplest)

  for (const accountState of dispatchableAccounts) {
    if (accountsUsedForBrand >= MAX_ACCOUNTS_PER_BRAND) break;

    const remainingWavePrompts = targetBrand.pendingCount - (accountsUsedForBrand * SESSION_MAX_PROMPTS);
    if (remainingWavePrompts <= 0) break;

    const promptsCanDo = calculatePromptsForAccount(accountState, remainingWavePrompts);
    if (promptsCanDo === 0) continue;

    // Claim prompts atomically
    const claimedPrompts = await claimPrompts(accountState.id, targetBrand.id, targetBrand.currentWave, promptsCanDo);
    if (claimedPrompts.length === 0) {
      console.log('[QUEUE-ORG] Account', accountState.email, '— no prompts claimed (race), skipping');
      continue;
    }

    console.log('[QUEUE-ORG] Account', accountState.email, '— claimed', claimedPrompts.length, 'wave-' + targetBrand.currentWave + ' prompts for brand', targetBrand.id.substring(0, 8));

    // Flip brand to 'running' on first dispatch (idempotent — only if still 'queued')
    if (accountsUsedForBrand === 0) {
      await supabase
        .from('brands')
        .update({ first_report_status: 'running' })
        .eq('id', targetBrand.id)
        .eq('first_report_status', 'queued');
    }

    // Get or create daily report (using anchored ID if available)
    const today = new Date().toISOString().split('T')[0];
    const dailyReportId = targetBrand.onboarding_daily_report_id
      || await getOrCreateDailyReport(targetBrand.id, today, targetBrand.currentWave === 1 ? 6 : 30);

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
    const childPromise = new Promise((resolve) => {
      const child = spawn('node', [chunkScript], {
        stdio: 'inherit',
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
          TOTAL_PROMPTS: String(totalPrompts || 30),
          ONBOARDING_WAVE: String(targetBrand.currentWave),
        },
      });

      child.on('close', async (code) => {
        if (code !== 0) {
          // Agent handles its own timeout — just clean up any still-claimed prompts (e.g. hard crash)
          console.error('[QUEUE-ORG] Chunk exited with code', code, '— marking any remaining claimed prompts as failed');
          await supabase
            .from('brand_prompts')
            .update({ onboarding_status: 'failed', onboarding_claimed_account_id: null, onboarding_claimed_at: null })
            .in('id', claimedPrompts.map(p => p.id))
            .eq('onboarding_status', 'claimed'); // only ones still claimed — don't overwrite completed/failed set by agent
        }
        resolve(code);
      });
    });

    childPromises.push(childPromise);
    accountsUsedForBrand++;

    // Update pending count estimate for next account
    targetBrand.pendingCount = Math.max(0, targetBrand.pendingCount - claimedPrompts.length);
    if (targetBrand.pendingCount === 0) break;
  }

  if (childPromises.length > 0) {
    console.log('[QUEUE-ORG] Waiting for', childPromises.length, 'chunk(s)...');
    await Promise.all(childPromises);
    console.log('[QUEUE-ORG] All chunks complete.');

    // Post-completion: check if current wave is fully done → finalize phase
    for (const [brandId, dailyReportId] of brandDailyReportMap) {
      const brand = activeBrands.find(b => b.id === brandId);
      if (!brand) continue;
      const currentWave = brand.onboarding_phase || 1;

      const { count: remaining } = await supabase
        .from('brand_prompts')
        .select('id', { count: 'exact', head: true })
        .eq('brand_id', brandId)
        .eq('onboarding_wave', currentWave)
        .in('onboarding_status', ['pending', 'claimed', 'failed']);

      if (remaining === 0) {
        console.log('[QUEUE-ORG] Brand', brandId.substring(0, 8), 'wave', currentWave, 'complete — finalizing phase');
        await finalizePhase({ ...brand, onboarding_daily_report_id: dailyReportId }, currentWave);
      } else {
        // Agent already called /chunk-complete webhook which triggers a fresh organizer run.
        // That fresh run will see the failed prompts and re-dispatch. Nothing to do here.
        console.log('[QUEUE-ORG] Brand', brandId.substring(0, 8), 'still has', remaining, 'failed/pending prompts — fresh organizer run already triggered by agent webhook');
      }
    }
  }

  console.log('[QUEUE-ORG] Done at', new Date().toISOString());
}

/**
 * Finalize a phase after all its wave prompts complete.
 * Phase 1: run partial EOD, flip to phase1_complete
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

    // Advance brand to phase1_complete (Phase 2 dispatch added later)
    await supabase
      .from('brands')
      .update({
        first_report_status: 'phase1_complete',
        onboarding_prompts_sent: wave1Completed || 6,
      })
      .eq('id', brandId)
      .in('first_report_status', ['queued', 'running']); // idempotent guard

    console.log('[QUEUE-ORG] Brand', brandId.substring(0, 8), '→ phase1_complete.');

    // Ensure user is in users table (Phase 1 dashboard requires it)
    await ensureUserInTable(brand.owner_user_id);

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

    // Mark daily_report as fully complete
    await supabase
      .from('daily_reports')
      .update({ status: 'completed', completed_at: new Date().toISOString(), is_partial: false })
      .eq('id', dailyReportId);

    // Count all completed prompts
    const { count: totalCompleted } = await supabase
      .from('brand_prompts')
      .select('id', { count: 'exact', head: true })
      .eq('brand_id', brandId)
      .eq('onboarding_status', 'completed');

    // Mark brand as fully succeeded
    await supabase
      .from('brands')
      .update({
        first_report_status: 'succeeded',
        chatgpt_account_id: null,
        onboarding_prompts_sent: totalCompleted || 30,
      })
      .eq('id', brandId)
      .in('first_report_status', ['phase1_complete', 'running']); // idempotent guard

    // Ensure user is in users table
    await ensureUserInTable(brand.owner_user_id);

    console.log('[QUEUE-ORG] Brand', brandId.substring(0, 8), '→ succeeded. Onboarding complete!');
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
          { id: authData.user.id, email: authData.user.email, subscription_plan: 'free_trial', reports_enabled: true },
          { onConflict: 'id', ignoreDuplicates: true }
        );
      console.log('[QUEUE-ORG] Ensured user in users table:', authData.user.email);
    }
  } catch (err) {
    console.warn('[QUEUE-ORG] Could not upsert user:', err.message);
  }
}

/**
 * Get account states: classifies each eligible account as FREE, RESERVED, BUSY:daily, or BUSY:onboarding.
 * BUSY:onboarding now detected via brand_prompts (not brands.first_report_status)
 * so it works for both Phase 1 and Phase 2.
 */
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
    // Detect active onboarding via claimed prompts (works for Phase 1 AND Phase 2)
    supabase.from('brand_prompts')
      .select('onboarding_claimed_account_id')
      .eq('onboarding_status', 'claimed')
      .not('onboarding_claimed_account_id', 'is', null),
  ]);

  if (!accounts || accounts.length === 0) return [];

  // Build set of accounts with active onboarding claims
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
 * Dynamic chunk sizing.
 * FREE: full 5-prompt session (15 min Browserless limit)
 * RESERVED: floor((minutesUntilBatch - safetyBuffer) / 2.5), capped at 5
 * Also capped by remainingWavePrompts so we don't over-claim.
 */
function calculatePromptsForAccount(accountState, remainingWavePrompts = SESSION_MAX_PROMPTS) {
  let maxByTime;
  if (accountState.state === 'FREE') {
    maxByTime = SESSION_MAX_PROMPTS;
  } else if (accountState.state === 'RESERVED') {
    const minutesUntilBatch = (new Date(accountState.nextBatchAt).getTime() - Date.now()) / 60000;
    const available = minutesUntilBatch - SAFETY_BUFFER_MINUTES;
    if (available < MINUTES_PER_PROMPT) return 0;
    maxByTime = Math.floor(available / MINUTES_PER_PROMPT);
  } else {
    return 0; // BUSY states cannot take any prompts
  }
  return Math.min(SESSION_MAX_PROMPTS, maxByTime, remainingWavePrompts);
}

async function claimPrompts(accountId, brandId, wave, count) {
  const { data: pendingPrompts } = await supabase
    .from('brand_prompts')
    .select('id, raw_prompt, improved_prompt')
    .eq('brand_id', brandId)
    .eq('onboarding_wave', wave)
    .in('onboarding_status', ['pending', 'failed'])
    .in('status', ['active', 'inactive'])
    .order('created_at')
    .limit(count);

  if (!pendingPrompts || pendingPrompts.length === 0) return [];

  const claimed = [];
  const now = new Date().toISOString();

  for (const prompt of pendingPrompts) {
    // Atomic optimistic lock: only claim if still pending or failed
    const { data: updated } = await supabase
      .from('brand_prompts')
      .update({
        onboarding_status: 'claimed',
        onboarding_claimed_account_id: accountId,
        onboarding_claimed_at: now,
      })
      .eq('id', prompt.id)
      .in('onboarding_status', ['pending', 'failed']) // atomic guard
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

async function getOrCreateDailyReport(brandId, today, totalPrompts) {
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
      total_prompts: totalPrompts,
      is_partial: true,
    })
    .select('id')
    .single();

  if (error || !newReport) {
    console.error('[QUEUE-ORG] Failed to create daily_report:', error?.message);
    return null;
  }

  // Anchor report to brand if not already set
  await supabase
    .from('brands')
    .update({ onboarding_daily_report_id: newReport.id })
    .eq('id', brandId)
    .is('onboarding_daily_report_id', null); // only if not already set

  return newReport.id;
}

runQueueOrganizer().catch(err => {
  console.error('[QUEUE-ORG] Fatal error:', err.message, err.stack);
  process.exit(1);
});
