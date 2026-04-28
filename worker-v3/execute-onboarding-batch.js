#!/usr/bin/env node

const { createServiceClient } = require('./lib/supabase');
const { CONFIG, isExecuteMode, modeLabel } = require('./lib/config');
const { calculateChatGptTiming } = require('./lib/batch-timing');
const { createPendingBmeRows } = require('./lib/bme');

async function loadSchedule(supabase, scheduleId) {
  const { data, error } = await supabase
    .from('daily_schedules')
    .select('*')
    .eq('id', scheduleId)
    .maybeSingle();

  if (error) throw new Error(`Failed to load schedule ${scheduleId}: ${error.message}`);
  return data || null;
}

async function main() {
  const scheduleId = process.argv[2];
  const execute = isExecuteMode();

  if (!scheduleId) {
    console.error('Usage: node execute-onboarding-batch.js <daily_schedules.id>');
    process.exitCode = 1;
    return;
  }

  const supabase = createServiceClient();
  const schedule = await loadSchedule(supabase, scheduleId);

  console.log(`Worker V3 onboarding batch executor (${modeLabel(execute)})`);
  console.log(`Schedule id: ${scheduleId}`);

  if (!schedule) {
    console.log('Schedule not found.');
    process.exitCode = 1;
    return;
  }

  const promptIds = Array.isArray(schedule.prompt_ids) ? schedule.prompt_ids : [];
  const promptCount = Number(schedule.batch_size || promptIds.length || CONFIG.promptsPerBatch);
  const timing = calculateChatGptTiming(promptCount, new Date());

  console.log('\nSchedule snapshot:');
  console.log(JSON.stringify({
    id: schedule.id,
    brand_id: schedule.brand_id,
    status: schedule.status,
    batch_type: schedule.batch_type,
    onboarding_wave: schedule.onboarding_wave,
    chatgpt_account_id: schedule.chatgpt_account_id,
    batch_size: promptCount,
    prompt_ids: promptIds,
  }, null, 2));

  console.log('\nPlanned execution contract:');
  console.log(`  - Create BME rows for: ${CONFIG.providers.join(', ')}`);
  console.log(`  - Acquire account lease before connecting to Browserless`);
  console.log(`  - Start ChatGPT/browser batch with ${promptCount} prompt(s)`);
  console.log(`  - Expected done: ${timing.expectedDoneAt.toISOString()}`);
  console.log(`  - Hard timeout: ${timing.hardTimeoutAt.toISOString()} (${timing.hardTimeoutMinutes} min)`);
  console.log('  - Run API providers independently so Google/Claude credit failures are visible but do not block ChatGPT recovery');
  console.log('  - Trigger onboarding EOD after wave 1 and again after wave 2');

  await createPendingBmeRows(supabase, [scheduleId], false);

  if (!execute) {
    console.log('\nDry-run only. No status was changed, no lease was acquired, and no browser process was started.');
    return;
  }

  throw new Error(
    'Execute mode is intentionally disabled in worker-v3. The real runner will be enabled only after we review dry-run behavior.'
  );
}

main().catch((error) => {
  console.error(`\nWorker V3 onboarding batch executor failed: ${error.message}`);
  process.exitCode = 1;
});
