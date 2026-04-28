#!/usr/bin/env node

const { createServiceClient } = require('./lib/supabase');
const { isExecuteMode, modeLabel } = require('./lib/config');
const { calculateChatGptTiming, isPastHardTimeout } = require('./lib/batch-timing');
const { getActiveLeases } = require('./lib/account-lease');

async function fetchRunningSchedules(supabase) {
  const { data, error } = await supabase
    .from('daily_schedules')
    .select('id, brand_id, batch_type, batch_size, batch_number, chatgpt_account_id, status, started_at, execution_time, error_message')
    .eq('status', 'running')
    .order('started_at', { ascending: true, nullsFirst: true });

  if (error) throw new Error(`Failed to fetch running schedules: ${error.message}`);
  return data || [];
}

function classifySchedule(schedule, now) {
  const startedAt = schedule.started_at || schedule.execution_time;
  const promptCount = Number(schedule.batch_size || 5);
  const timing = calculateChatGptTiming(promptCount, startedAt ? new Date(startedAt) : now);
  const timedOut = isPastHardTimeout(startedAt, promptCount, now);

  if (!startedAt) {
    return {
      action: 'inspect',
      reason: 'running row has no started_at',
      timing,
    };
  }

  if (timedOut) {
    return {
      action: 'kill_and_reinitialize',
      reason: `past hard timeout ${timing.hardTimeoutAt.toISOString()}`,
      timing,
    };
  }

  return {
    action: 'leave_running',
    reason: `inside hard timeout until ${timing.hardTimeoutAt.toISOString()}`,
    timing,
  };
}

async function main() {
  const execute = isExecuteMode();
  const now = new Date();
  const supabase = createServiceClient();

  console.log(`Worker V3 recovery watchdog (${modeLabel(execute)})`);
  console.log(`UTC now: ${now.toISOString()}`);

  const [runningSchedules, leaseResult] = await Promise.all([
    fetchRunningSchedules(supabase),
    getActiveLeases(supabase),
  ]);

  console.log(`\nRunning schedules: ${runningSchedules.length}`);
  for (const schedule of runningSchedules) {
    const classification = classifySchedule(schedule, now);
    console.log(JSON.stringify({
      id: schedule.id,
      brand_id: schedule.brand_id,
      batch_type: schedule.batch_type || 'daily',
      batch_number: schedule.batch_number,
      account_id: schedule.chatgpt_account_id,
      started_at: schedule.started_at,
      action: classification.action,
      reason: classification.reason,
      hard_timeout_at: classification.timing.hardTimeoutAt.toISOString(),
    }, null, 2));
  }

  if (leaseResult.missingTable) {
    console.log('\nLease table is missing. Watchdog can inspect schedules, but lease-based zombie detection is not active yet.');
  } else {
    console.log(`\nActive leases: ${leaseResult.leases.length}`);
    for (const lease of leaseResult.leases) {
      const expired = lease.expires_at && new Date(lease.expires_at).getTime() <= now.getTime();
      console.log(JSON.stringify({
        account_id: lease.account_id,
        owner_type: lease.owner_type,
        owner_id: lease.owner_id,
        heartbeat_at: lease.heartbeat_at,
        expires_at: lease.expires_at,
        expired,
      }, null, 2));
    }
  }

  if (!execute) {
    console.log('\nDry-run only. No process was killed, no session was reinitialized, and no row was changed.');
    return;
  }

  throw new Error(
    'Execute mode is intentionally disabled in worker-v3. Kill/reinitialize behavior needs a reviewed process map before enabling.'
  );
}

main().catch((error) => {
  console.error(`\nWorker V3 recovery watchdog failed: ${error.message}`);
  process.exitCode = 1;
});
