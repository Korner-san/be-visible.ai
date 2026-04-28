const os = require('os');
const { CONFIG } = require('./config');

const TABLE = 'worker_account_leases';

function leaseRow({ accountId, ownerType, ownerId, pid = process.pid, timing }) {
  const now = new Date();
  return {
    account_id: accountId,
    owner_type: ownerType,
    owner_id: ownerId,
    pid,
    hostname: os.hostname(),
    started_at: now.toISOString(),
    heartbeat_at: now.toISOString(),
    expires_at: timing.hardTimeoutAt.toISOString(),
    expected_done_at: timing.expectedDoneAt.toISOString(),
    hard_timeout_at: timing.hardTimeoutAt.toISOString(),
  };
}

async function getActiveLeases(supabase) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .gt('expires_at', now);

  if (error) {
    if (error.code === '42P01') {
      return { missingTable: true, leases: [] };
    }
    throw new Error(`Failed to fetch leases: ${error.message}`);
  }

  return { missingTable: false, leases: data || [] };
}

async function acquireLease(supabase, input, execute = false) {
  const row = leaseRow(input);
  if (!execute) return { dryRun: true, row };

  const { error } = await supabase.from(TABLE).insert(row);
  if (error) {
    if (error.code === '42P01') {
      throw new Error(`Missing ${TABLE}. Run the V3 lease table migration before execute mode.`);
    }
    throw new Error(`Failed to acquire lease for account ${input.accountId}: ${error.message}`);
  }
  return { acquired: true, row };
}

async function releaseLease(supabase, accountId, ownerId, execute = false) {
  if (!execute) return { dryRun: true, accountId, ownerId };

  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('account_id', accountId)
    .eq('owner_id', ownerId);

  if (error && error.code !== '42P01') {
    throw new Error(`Failed to release lease: ${error.message}`);
  }

  return { released: true };
}

async function heartbeatLease(supabase, accountId, ownerId, execute = false) {
  if (!execute) return { dryRun: true };

  const { error } = await supabase
    .from(TABLE)
    .update({ heartbeat_at: new Date().toISOString() })
    .eq('account_id', accountId)
    .eq('owner_id', ownerId);

  if (error && error.code !== '42P01') {
    throw new Error(`Failed to heartbeat lease: ${error.message}`);
  }
}

function startHeartbeat(supabase, accountId, ownerId, execute) {
  if (!execute) return null;
  return setInterval(() => {
    heartbeatLease(supabase, accountId, ownerId, true).catch((err) => {
      console.warn('[LEASE] Heartbeat failed:', err.message);
    });
  }, CONFIG.leaseHeartbeatSeconds * 1000);
}

module.exports = {
  TABLE,
  getActiveLeases,
  acquireLease,
  releaseLease,
  heartbeatLease,
  startHeartbeat,
};
