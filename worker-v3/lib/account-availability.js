const { CONFIG } = require('./config');
const { addMinutes, addHours } = require('./time-windows');
const { getActiveLeases } = require('./account-lease');

async function getAccountAvailability(supabase, { now = new Date(), lookaheadHours = CONFIG.phase2LookaheadHours } = {}) {
  const lookaheadEnd = addHours(now, lookaheadHours);
  const protectionEnd = addMinutes(now, CONFIG.dailyProtectionMinutes);

  const [
    { data: accounts, error: accountsError },
    { data: runningSchedules, error: runningError },
    { data: protectedDaily, error: protectedError },
    { data: futureSchedules, error: futureError },
    leaseResult,
  ] = await Promise.all([
    supabase
      .from('chatgpt_accounts')
      .select('id, email, status, is_eligible, proxy_host, browserless_session_id, last_visual_state')
      .eq('status', 'active')
      .eq('is_eligible', true)
      .not('proxy_host', 'is', null),
    supabase
      .from('daily_schedules')
      .select('id, chatgpt_account_id, batch_type, batch_size, execution_time, status')
      .eq('status', 'running'),
    supabase
      .from('daily_schedules')
      .select('id, chatgpt_account_id, batch_type, batch_size, execution_time, status')
      .eq('status', 'pending')
      .lte('execution_time', protectionEnd.toISOString()),
    supabase
      .from('daily_schedules')
      .select('id, chatgpt_account_id, batch_type, batch_size, execution_time, status, is_retry')
      .in('status', ['pending', 'running'])
      .gte('execution_time', now.toISOString())
      .lte('execution_time', lookaheadEnd.toISOString()),
    getActiveLeases(supabase),
  ]);

  if (accountsError) throw new Error(`Failed to fetch accounts: ${accountsError.message}`);
  if (runningError) throw new Error(`Failed to fetch running schedules: ${runningError.message}`);
  if (protectedError) throw new Error(`Failed to fetch protected daily schedules: ${protectedError.message}`);
  if (futureError) throw new Error(`Failed to fetch future schedules: ${futureError.message}`);

  const activeLeaseByAccount = new Map((leaseResult.leases || []).map((lease) => [lease.account_id, lease]));

  return (accounts || []).map((account) => {
    const running = (runningSchedules || []).find((s) => s.chatgpt_account_id === account.id);
    const protectedSchedule = (protectedDaily || []).find((s) =>
      s.chatgpt_account_id === account.id && (s.batch_type || 'daily') !== 'onboarding'
    );
    const lease = activeLeaseByAccount.get(account.id);
    const future = (futureSchedules || [])
      .filter((s) => s.chatgpt_account_id === account.id)
      .sort((a, b) => new Date(a.execution_time) - new Date(b.execution_time));

    let state = 'FREE';
    let reason = null;

    if (lease) {
      state = 'LEASED';
      reason = `${lease.owner_type}:${lease.owner_id}`;
    } else if (running) {
      state = `BUSY:${running.batch_type || 'daily'}`;
      reason = running.id;
    } else if (protectedSchedule) {
      state = 'PROTECTED_DAILY_WINDOW';
      reason = protectedSchedule.id;
    }

    return {
      ...account,
      state,
      reason,
      lease,
      futureSchedules: future,
      canRunOnboardingNow: state === 'FREE',
      leaseTableMissing: leaseResult.missingTable,
    };
  });
}

module.exports = {
  getAccountAvailability,
};
