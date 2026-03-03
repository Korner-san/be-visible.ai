#!/usr/bin/env node
/**
 * queue-checker.js
 *
 * Polls the onboarding prompt queue and dispatches available accounts
 * to work on pending prompts. Designed to be:
 *   - Run by cron every 2 minutes: "* /2 * * * * node /root/be-visible.ai/worker/queue-checker.js" (remove space after *)
 *   - Triggered on-demand via POST /run-queue-checker webhook
 *
 * Logic per run:
 *   1. Release stale claims (claimed >12 min ago with no result)
 *   2. Find brands with first_report_status IN ('queued','running') that have pending prompts
 *   3. Get system capacity (account states)
 *   4. For each account with available capacity, claim N prompts and spawn run-onboarding-chunk.js
 *   5. Multiple accounts spawn simultaneously (parallel child processes)
 *   6. After all chunks complete, verify each dispatched brand — finalize any that are fully done
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { spawn } = require('child_process');
const path = require('path');
const { getSystemCapacity, calculatePromptsForAccount } = require('./account-selector');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CLAIM_TIMEOUT_MINUTES = 15; // Must cover max chunk: 5 prompts × 2.5 min + 2.5 min buffer
const chunkScript = path.join(__dirname, 'run-onboarding-chunk.js');

async function runQueueChecker() {
  console.log('[QUEUE-CHECKER] Starting at', new Date().toISOString());

  // 1. Release stale claims
  const staleThreshold = new Date(Date.now() - CLAIM_TIMEOUT_MINUTES * 60 * 1000).toISOString();
  const { data: staleClaims } = await supabase
    .from('brand_prompts')
    .select('id')
    .eq('onboarding_status', 'claimed')
    .lt('onboarding_claimed_at', staleThreshold);

  if (staleClaims && staleClaims.length > 0) {
    await supabase
      .from('brand_prompts')
      .update({ onboarding_status: 'pending', onboarding_claimed_account_id: null, onboarding_claimed_at: null })
      .in('id', staleClaims.map(p => p.id));
    console.log('[QUEUE-CHECKER] Released', staleClaims.length, 'stale claims');
  }

  // 2. Find brands with onboarding in progress
  const { data: activeBrands } = await supabase
    .from('brands')
    .select('id, owner_user_id, onboarding_prompts_sent')
    .in('first_report_status', ['queued', 'running'])
    .eq('onboarding_completed', true);

  if (!activeBrands || activeBrands.length === 0) {
    console.log('[QUEUE-CHECKER] No active onboarding brands. Exiting.');
    return;
  }

  // Filter to brands that actually have pending prompts
  const brandsWithWork = [];
  for (const brand of activeBrands) {
    const { count } = await supabase
      .from('brand_prompts')
      .select('id', { count: 'exact', head: true })
      .eq('brand_id', brand.id)
      .eq('onboarding_status', 'pending');
    if (count > 0) {
      brandsWithWork.push({ ...brand, pendingCount: count });
    }
  }

  if (brandsWithWork.length === 0) {
    console.log('[QUEUE-CHECKER] No pending prompts in any active brand. Exiting.');
    return;
  }

  console.log('[QUEUE-CHECKER] Brands with pending prompts:', brandsWithWork.map(b => `${b.id.substring(0, 8)}(${b.pendingCount})`).join(', '));

  // 3. Get system capacity
  const capacity = await getSystemCapacity();
  console.log('[QUEUE-CHECKER] Accounts:', capacity.accounts.map(a => `${a.email.split('@')[0]}=${a.state}`).join(', '));

  const accountsWithCapacity = capacity.accounts.filter(a => calculatePromptsForAccount(a) > 0);
  if (accountsWithCapacity.length === 0) {
    console.log('[QUEUE-CHECKER] No accounts have capacity right now. Exiting.');
    return;
  }

  // 4. Dispatch: pair accounts with brands, claim prompts, spawn chunks in parallel
  const today = new Date().toISOString().split('T')[0];
  const childPromises = [];
  const brandDailyReportMap = new Map(); // brandId → dailyReportId (for post-completion finalization)

  for (const accountState of accountsWithCapacity) {
    const promptsCanDo = calculatePromptsForAccount(accountState);
    const targetBrand = brandsWithWork[0];
    if (!targetBrand) break;

    // Claim prompts atomically
    const claimedPrompts = await claimPrompts(accountState.id, targetBrand.id, promptsCanDo);
    if (claimedPrompts.length === 0) {
      console.log('[QUEUE-CHECKER] Account', accountState.email, '— no prompts claimed (race condition), skipping');
      continue;
    }

    console.log('[QUEUE-CHECKER] Account', accountState.email, '— claimed', claimedPrompts.length, 'prompts for brand', targetBrand.id.substring(0, 8));

    // Get real total prompts count (all active/inactive) — used for both report creation and progress display
    // Must come BEFORE getOrCreateDailyReport so the report is created with the correct total, not just pendingCount
    const { count: totalPrompts } = await supabase
      .from('brand_prompts')
      .select('id', { count: 'exact', head: true })
      .eq('brand_id', targetBrand.id)
      .in('status', ['active', 'inactive']);

    // Get or create daily_report using real total (not dynamic pendingCount which changes as prompts are claimed)
    const dailyReportId = await getOrCreateDailyReport(targetBrand.id, today, totalPrompts || 30);
    if (!dailyReportId) {
      await releasePrompts(claimedPrompts.map(p => p.id));
      continue;
    }

    // Track brand → dailyReportId for post-completion finalization
    if (!brandDailyReportMap.has(targetBrand.id)) {
      brandDailyReportMap.set(targetBrand.id, dailyReportId);
    }

    // Spawn chunk child process (async — multiple accounts run in parallel)
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
        },
      });

      child.on('close', async (code) => {
        if (code !== 0) {
          console.error('[QUEUE-CHECKER] Chunk failed for account', accountState.email, '— releasing claims');
          await releasePrompts(claimedPrompts.map(p => p.id));
        }
        resolve(code);
      });
    });

    childPromises.push(childPromise);

    // Check if this brand still has remaining pending prompts after this claim
    const remainingAfterClaim = targetBrand.pendingCount - claimedPrompts.length;
    if (remainingAfterClaim <= 0) {
      brandsWithWork.shift(); // Move to next brand if this one is fully dispatched
    } else {
      brandsWithWork[0].pendingCount = remainingAfterClaim;
    }
  }

  if (childPromises.length > 0) {
    console.log('[QUEUE-CHECKER] Waiting for', childPromises.length, 'chunk process(es)...');
    await Promise.all(childPromises);
    console.log('[QUEUE-CHECKER] All chunks complete.');

    // Post-completion finalization: check each dispatched brand
    // This is the authoritative check — runs after ALL chunks finish, ensuring
    // we never miss finalization due to per-chunk race conditions.
    for (const [brandId, dailyReportId] of brandDailyReportMap) {
      const { count: remaining } = await supabase
        .from('brand_prompts')
        .select('id', { count: 'exact', head: true })
        .eq('brand_id', brandId)
        .in('onboarding_status', ['pending', 'claimed']);

      if (remaining === 0) {
        console.log('[QUEUE-CHECKER] Brand', brandId.substring(0, 8), 'fully complete — finalizing');
        await finalizeOnboarding(brandId, dailyReportId);
      } else {
        console.log('[QUEUE-CHECKER] Brand', brandId.substring(0, 8), 'still has', remaining, 'pending/claimed prompts — will retry next run');
      }
    }
  }

  console.log('[QUEUE-CHECKER] Done at', new Date().toISOString());
}

async function finalizeOnboarding(brandId, dailyReportId) {
  // Check if chunk fast-path already handled finalization
  const { data: brand } = await supabase
    .from('brands')
    .select('first_report_status, owner_user_id')
    .eq('id', brandId)
    .single();

  if (brand?.first_report_status === 'succeeded') {
    console.log('[QUEUE-CHECKER] Brand', brandId.substring(0, 8), 'already succeeded (chunk handled it)');
    // Still ensure user is in users table (belt-and-suspenders)
    await ensureUserInTable(brand.owner_user_id);
    return;
  }

  console.log('[QUEUE-CHECKER] Running finalization for brand', brandId.substring(0, 8));

  // Check if daily report already completed by chunk
  const { data: report } = await supabase
    .from('daily_reports')
    .select('status')
    .eq('id', dailyReportId)
    .single();

  if (report?.status !== 'completed') {
    try {
      const { processEndOfDay } = require('./end-of-day-processor');
      await processEndOfDay(dailyReportId);
      console.log('[QUEUE-CHECKER] End-of-day processor complete for brand', brandId.substring(0, 8));
    } catch (err) {
      console.warn('[QUEUE-CHECKER] End-of-day processor error (non-fatal):', err.message);
    }

    await supabase
      .from('daily_reports')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', dailyReportId);
  } else {
    console.log('[QUEUE-CHECKER] Daily report already completed for brand', brandId.substring(0, 8));
  }

  // Mark brand as succeeded
  const { count: totalCompleted } = await supabase
    .from('brand_prompts')
    .select('id', { count: 'exact', head: true })
    .eq('brand_id', brandId)
    .eq('onboarding_status', 'completed');

  await supabase
    .from('brands')
    .update({
      first_report_status: 'succeeded',
      onboarding_prompts_sent: totalCompleted || 30,
      chatgpt_account_id: null,
    })
    .eq('id', brandId)
    .in('first_report_status', ['queued', 'running']); // idempotent guard

  // Ensure user is in users table
  await ensureUserInTable(brand?.owner_user_id);

  console.log('[QUEUE-CHECKER] Brand', brandId.substring(0, 8), 'finalized successfully');
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
      console.log('[QUEUE-CHECKER] Ensured user in users table:', authData.user.email);
    }
  } catch (err) {
    console.warn('[QUEUE-CHECKER] Could not upsert user:', err.message);
  }
}

async function claimPrompts(accountId, brandId, count) {
  const { data: pendingPrompts } = await supabase
    .from('brand_prompts')
    .select('id, raw_prompt, improved_prompt')
    .eq('brand_id', brandId)
    .eq('onboarding_status', 'pending')
    .in('status', ['active', 'inactive'])
    .order('created_at')
    .limit(count);

  if (!pendingPrompts || pendingPrompts.length === 0) return [];

  const claimed = [];
  const now = new Date().toISOString();

  for (const prompt of pendingPrompts) {
    // Atomic optimistic lock: only succeeds if still pending
    const { data: updated } = await supabase
      .from('brand_prompts')
      .update({
        onboarding_status: 'claimed',
        onboarding_claimed_account_id: accountId,
        onboarding_claimed_at: now,
      })
      .eq('id', prompt.id)
      .eq('onboarding_status', 'pending')
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
    .insert({ brand_id: brandId, report_date: today, status: 'running', total_prompts: totalPrompts })
    .select('id')
    .single();

  if (error || !newReport) {
    console.error('[QUEUE-CHECKER] Failed to create daily_report:', error?.message);
    return null;
  }

  return newReport.id;
}

runQueueChecker().catch(err => {
  console.error('[QUEUE-CHECKER] Fatal error:', err.message);
  process.exit(1);
});
