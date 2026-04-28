#!/usr/bin/env node

const { createServiceClient } = require('./lib/supabase');
const { getArgValue, hasFlag } = require('./lib/args');

function requireDate() {
  const date = getArgValue('date');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('Missing required --date=YYYY-MM-DD');
  }
  return date;
}

async function fetchPendingBatchIds(supabase, date) {
  const { data, error } = await supabase
    .from('worker_v3_batches')
    .select('id, batch_number, status')
    .eq('schedule_date', date)
    .eq('item_kind', 'daily')
    .eq('is_retry', false)
    .eq('status', 'pending');

  if (error) throw new Error(`Failed to fetch pending v3 batches: ${error.message}`);
  return data || [];
}

async function countRows(supabase, table, column, ids) {
  if (ids.length === 0) return 0;
  const { count, error } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true })
    .in(column, ids);

  if (error) throw new Error(`Failed to count ${table}: ${error.message}`);
  return count || 0;
}

async function main() {
  const date = requireDate();
  const confirm = hasFlag('confirm-delete');
  const supabase = createServiceClient();

  console.log(`Worker V3 clear shadow plan`);
  console.log(`Date: ${date}`);
  console.log(`Mode: ${confirm ? 'DELETE' : 'DRY-RUN'}`);

  const batches = await fetchPendingBatchIds(supabase, date);
  const batchIds = batches.map((batch) => batch.id);
  const itemCount = await countRows(supabase, 'worker_v3_batch_items', 'batch_id', batchIds);
  const modelCount = await countRows(supabase, 'worker_v3_model_executions', 'batch_id', batchIds);

  console.log(`Pending daily v3 batches: ${batches.length}`);
  console.log(`Related items: ${itemCount}`);
  console.log(`Related model rows: ${modelCount}`);

  if (!confirm) {
    console.log('\nDry-run only. Add --confirm-delete to delete these pending v3 shadow rows.');
    return;
  }

  if (batchIds.length === 0) {
    console.log('\nNo pending shadow rows to delete.');
    return;
  }

  const { error } = await supabase
    .from('worker_v3_batches')
    .delete()
    .in('id', batchIds);

  if (error) throw new Error(`Failed to delete pending shadow batches: ${error.message}`);

  console.log(`\nDeleted ${batchIds.length} pending v3 batch rows. Related items/model rows were removed by cascade.`);
}

main().catch((error) => {
  console.error(`\nWorker V3 clear shadow plan failed: ${error.message}`);
  process.exitCode = 1;
});
