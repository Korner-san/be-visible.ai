#!/usr/bin/env node

const { createServiceClient } = require('./lib/supabase');
const { CONFIG, isExecuteMode, modeLabel } = require('./lib/config');
const { getAccountAvailability } = require('./lib/account-availability');
const {
  getActiveOnboardingBrand,
  countPromptsByWave,
  getClaimablePromptIds,
  getExistingOnboardingSchedules,
} = require('./lib/onboarding-queries');

function pickAccount(accounts) {
  return accounts
    .filter((account) => account.canRunOnboardingNow)
    .sort((a, b) => {
      const aFuture = a.futureSchedules?.[0]?.execution_time || '9999-12-31T00:00:00.000Z';
      const bFuture = b.futureSchedules?.[0]?.execution_time || '9999-12-31T00:00:00.000Z';
      return aFuture.localeCompare(bFuture);
    })[0] || null;
}

function detectWave(brand) {
  if (brand.first_report_status === 'phase1_complete') return 2;
  const phase = Number(brand.onboarding_phase || 1);
  return phase >= 2 ? 2 : 1;
}

function printAccountStates(accounts) {
  console.log('\nAccount availability:');
  if (accounts.length === 0) {
    console.log('  No eligible ChatGPT accounts found.');
    return;
  }

  for (const account of accounts) {
    const next = account.futureSchedules?.[0]?.execution_time
      ? ` next=${account.futureSchedules[0].execution_time}`
      : '';
    const reason = account.reason ? ` reason=${account.reason}` : '';
    console.log(`  - ${account.email || account.id}: ${account.state}${reason}${next}`);
  }
}

async function main() {
  const execute = isExecuteMode();
  const now = new Date();
  const supabase = createServiceClient();

  console.log(`Worker V3 onboarding dispatcher (${modeLabel(execute)})`);
  console.log(`UTC now: ${now.toISOString()}`);

  const brand = await getActiveOnboardingBrand(supabase);
  if (!brand) {
    console.log('No active onboarding brand found.');
    return;
  }

  const wave = detectWave(brand);
  const batchSize = CONFIG.promptsPerBatch;
  const [remaining, promptIds, existingSchedules, accounts] = await Promise.all([
    countPromptsByWave(supabase, brand.id, wave),
    getClaimablePromptIds(supabase, brand.id, wave, batchSize),
    getExistingOnboardingSchedules(supabase, brand.id, wave),
    getAccountAvailability(supabase, {
      now,
      lookaheadHours: wave === 1 ? 0.25 : CONFIG.phase2LookaheadHours,
    }),
  ]);

  console.log(`\nBrand: ${brand.name || brand.id}`);
  console.log(`Brand id: ${brand.id}`);
  console.log(`Wave: ${wave}`);
  console.log(`Remaining claimable prompts in wave: ${remaining}`);
  console.log(`Existing active/completed onboarding schedules for wave: ${existingSchedules.length}`);
  console.log(`Next prompt ids: ${promptIds.join(', ') || '(none)'}`);

  printAccountStates(accounts);

  const selectedAccount = pickAccount(accounts);
  if (!selectedAccount) {
    console.log('\nDecision: wait.');
    console.log(`Reason: no account is free outside the ${CONFIG.dailyProtectionMinutes}-minute daily protection window.`);
    return;
  }

  if (promptIds.length === 0) {
    console.log('\nDecision: no batch to create.');
    console.log('Reason: no claimable prompts are available for this wave.');
    return;
  }

  const nextAction = {
    brand_id: brand.id,
    user_id: brand.owner_user_id,
    chatgpt_account_id: selectedAccount.id,
    batch_type: 'onboarding',
    onboarding_wave: wave,
    batch_size: promptIds.length,
    prompt_ids: promptIds,
    execution_time: now.toISOString(),
    status: 'pending',
  };

  console.log('\nDecision: create one onboarding schedule and dispatch it.');
  console.log(JSON.stringify(nextAction, null, 2));

  if (!execute) {
    console.log('\nDry-run only. No database rows were written and no batch was started.');
    return;
  }

  throw new Error(
    'Execute mode is intentionally disabled in worker-v3. Review the dry-run plan first, then enable writes in a separate step.'
  );
}

main().catch((error) => {
  console.error(`\nWorker V3 onboarding dispatcher failed: ${error.message}`);
  process.exitCode = 1;
});
