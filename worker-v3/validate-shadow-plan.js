#!/usr/bin/env node

const { createServiceClient } = require('./lib/supabase');
const { utcDateString } = require('./lib/time-windows');
const { CONFIG } = require('./lib/config');
const { getArgValue } = require('./lib/args');

function targetDate() {
  return getArgValue('date') || utcDateString(new Date(Date.now() + 24 * 60 * 60 * 1000));
}

function addIssue(issues, severity, message, context = {}) {
  issues.push({ severity, message, context });
}

async function loadPlan(supabase, date) {
  const { data: batches, error: batchError } = await supabase
    .from('worker_v3_batches')
    .select('id, batch_number, batch_size, item_kind, schedule_date, execution_time, chatgpt_account_id, status, is_retry')
    .eq('schedule_date', date)
    .eq('item_kind', 'daily')
    .eq('is_retry', false)
    .order('batch_number', { ascending: true });

  if (batchError) throw new Error(`Failed to fetch worker_v3_batches: ${batchError.message}`);

  const { data: items, error: itemError } = await supabase
    .from('worker_v3_batch_items')
    .select('id, batch_id, item_index, item_kind, schedule_date, user_id, brand_id, prompt_id, status, is_retry')
    .eq('schedule_date', date)
    .eq('item_kind', 'daily')
    .eq('is_retry', false);

  if (itemError) throw new Error(`Failed to fetch worker_v3_batch_items: ${itemError.message}`);

  const { data: models, error: modelError } = await supabase
    .from('worker_v3_model_executions')
    .select('id, batch_id, item_id, provider, status')
    .in('batch_id', (batches || []).map((batch) => batch.id));

  if (modelError) throw new Error(`Failed to fetch worker_v3_model_executions: ${modelError.message}`);

  const { data: accounts, error: accountError } = await supabase
    .from('chatgpt_accounts')
    .select('id, email, status, is_eligible, proxy_host');

  if (accountError) throw new Error(`Failed to fetch chatgpt_accounts: ${accountError.message}`);

  return {
    batches: batches || [],
    items: items || [],
    models: models || [],
    accounts: accounts || [],
  };
}

function validate(plan) {
  const issues = [];
  const itemsByBatch = new Map();
  const modelsByBatch = new Map();
  const promptDateKeys = new Set();
  const accountById = new Map(plan.accounts.map((account) => [account.id, account]));

  for (const item of plan.items) {
    if (!itemsByBatch.has(item.batch_id)) itemsByBatch.set(item.batch_id, []);
    itemsByBatch.get(item.batch_id).push(item);

    const key = `${item.schedule_date}|${item.prompt_id}`;
    if (promptDateKeys.has(key)) {
      addIssue(issues, 'error', 'Duplicate prompt/date item found', { prompt_id: item.prompt_id, schedule_date: item.schedule_date });
    }
    promptDateKeys.add(key);

    for (const field of ['user_id', 'brand_id', 'prompt_id']) {
      if (!item[field]) addIssue(issues, 'error', `Item missing ${field}`, { item_id: item.id, batch_id: item.batch_id });
    }
  }

  for (const model of plan.models) {
    if (!modelsByBatch.has(model.batch_id)) modelsByBatch.set(model.batch_id, []);
    modelsByBatch.get(model.batch_id).push(model);
  }

  for (const batch of plan.batches) {
    const items = itemsByBatch.get(batch.id) || [];
    const models = modelsByBatch.get(batch.id) || [];
    const account = accountById.get(batch.chatgpt_account_id);

    if (batch.batch_size !== CONFIG.promptsPerBatch) {
      addIssue(issues, 'error', 'Batch size is not 5', { batch_id: batch.id, batch_number: batch.batch_number, batch_size: batch.batch_size });
    }

    if (items.length !== CONFIG.promptsPerBatch) {
      addIssue(issues, 'error', 'Batch does not have exactly 5 items', { batch_id: batch.id, batch_number: batch.batch_number, item_count: items.length });
    }

    const itemIndexes = new Set(items.map((item) => item.item_index));
    for (let i = 1; i <= CONFIG.promptsPerBatch; i += 1) {
      if (!itemIndexes.has(i)) {
        addIssue(issues, 'error', 'Batch missing item index', { batch_id: batch.id, batch_number: batch.batch_number, item_index: i });
      }
    }

    for (const provider of CONFIG.providers) {
      const providerRows = models.filter((model) => model.provider === provider && model.item_id === null);
      if (providerRows.length !== 1) {
        addIssue(issues, 'error', 'Batch missing provider model row', { batch_id: batch.id, batch_number: batch.batch_number, provider, rows: providerRows.length });
      }
    }

    if (!account) {
      addIssue(issues, 'error', 'Batch assigned to missing ChatGPT account', { batch_id: batch.id, account_id: batch.chatgpt_account_id });
    } else if (account.status !== 'active' || account.is_eligible !== true || !account.proxy_host) {
      addIssue(issues, 'warning', 'Batch assigned to account that is not currently eligible', {
        batch_id: batch.id,
        account_id: account.id,
        email: account.email,
        status: account.status,
        is_eligible: account.is_eligible,
        has_proxy: Boolean(account.proxy_host),
      });
    }
  }

  const batchIds = new Set(plan.batches.map((batch) => batch.id));
  for (const item of plan.items) {
    if (!batchIds.has(item.batch_id)) {
      addIssue(issues, 'error', 'Item references missing batch', { item_id: item.id, batch_id: item.batch_id });
    }
  }

  return issues;
}

async function main() {
  const date = targetDate();
  const supabase = createServiceClient();

  console.log(`Worker V3 shadow plan validator`);
  console.log(`Date: ${date}`);

  const plan = await loadPlan(supabase, date);
  const issues = validate(plan);
  const errors = issues.filter((issue) => issue.severity === 'error');
  const warnings = issues.filter((issue) => issue.severity === 'warning');

  console.log(`\nBatches: ${plan.batches.length}`);
  console.log(`Items: ${plan.items.length}`);
  console.log(`Model rows: ${plan.models.length}`);
  console.log(`Errors: ${errors.length}`);
  console.log(`Warnings: ${warnings.length}`);

  for (const issue of issues) {
    console.log(JSON.stringify(issue));
  }

  if (errors.length > 0) {
    process.exitCode = 1;
    return;
  }

  console.log('\nShadow plan validation passed.');
}

main().catch((error) => {
  console.error(`\nWorker V3 shadow validation failed: ${error.message}`);
  process.exitCode = 1;
});
