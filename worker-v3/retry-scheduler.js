#!/usr/bin/env node

const { createServiceClient } = require('./lib/supabase');
const { CONFIG, isExecuteMode, modeLabel } = require('./lib/config');
const { getDailyWindows } = require('./lib/time-windows');
const { createPendingBmeRows } = require('./lib/bme');

async function fetchFailedBatches(supabase, windows, now) {
  const { data, error } = await supabase
    .from('daily_schedules')
    .select('id, brand_id, user_id, chatgpt_account_id, batch_number, batch_size, prompt_ids, schedule_date, execution_time, batch_type, is_retry')
    .eq('status', 'failed')
    .or('is_retry.is.null,is_retry.eq.false')
    .gte('execution_time', windows.primaryStart.toISOString())
    .lt('execution_time', now.toISOString())
    .order('execution_time', { ascending: true });

  if (error) throw new Error(`Failed to fetch failed batches: ${error.message}`);
  return data || [];
}

function buildRetryPlan(failedBatches, windows) {
  if (failedBatches.length === 0) return [];

  const startMs = windows.retryPlanningEnd.getTime();
  const endMs = windows.retryEnd.getTime();
  const spacingMs = Math.max(10 * 60 * 1000, Math.floor((endMs - startMs) / failedBatches.length));

  return failedBatches.map((batch, index) => {
    const executionTime = new Date(Math.min(startMs + index * spacingMs, endMs - 60 * 1000));
    return {
      source_schedule_id: batch.id,
      retry_record: {
        schedule_date: batch.schedule_date,
        user_id: batch.user_id,
        brand_id: batch.brand_id,
        chatgpt_account_id: batch.chatgpt_account_id,
        batch_number: batch.batch_number,
        batch_size: batch.batch_size || CONFIG.promptsPerBatch,
        prompt_ids: batch.prompt_ids || [],
        batch_type: batch.batch_type || 'daily',
        status: 'pending',
        is_retry: true,
        execution_time: executionTime.toISOString(),
      },
    };
  });
}

async function main() {
  const execute = isExecuteMode();
  const now = new Date();
  const windows = getDailyWindows(now);
  const supabase = createServiceClient();

  console.log(`Worker V3 retry scheduler (${modeLabel(execute)})`);
  console.log(`UTC now: ${now.toISOString()}`);
  console.log(`Retry planning window: ${windows.retryPlanningStart.toISOString()} to ${windows.retryPlanningEnd.toISOString()}`);
  console.log(`Retry execution window: ${windows.retryPlanningEnd.toISOString()} to ${windows.retryEnd.toISOString()}`);

  const failedBatches = await fetchFailedBatches(supabase, windows, now);
  const plan = buildRetryPlan(failedBatches, windows);

  console.log(`\nFailed primary batches found: ${failedBatches.length}`);
  console.log(`Retry rows planned: ${plan.length}`);

  for (const item of plan) {
    console.log(JSON.stringify(item, null, 2));
  }

  if (!execute) {
    console.log('\nDry-run only. No retry rows or cron entries were created.');
    return;
  }

  throw new Error(
    'Execute mode is intentionally disabled in worker-v3. Retry insertion and cron loading will be enabled after dry-run review.'
  );
}

main().catch((error) => {
  console.error(`\nWorker V3 retry scheduler failed: ${error.message}`);
  process.exitCode = 1;
});
