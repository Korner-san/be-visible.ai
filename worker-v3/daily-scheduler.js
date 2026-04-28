#!/usr/bin/env node

const { createServiceClient } = require('./lib/supabase');
const { CONFIG, isExecuteMode, modeLabel } = require('./lib/config');
const { utcDateString, atUtc } = require('./lib/time-windows');

function isShadowWriteMode(argv = process.argv, env = process.env) {
  return argv.includes('--shadow-write') || env.WORKER_V3_SHADOW_WRITE === 'true';
}

function schedulerModeLabel({ execute, shadowWrite }) {
  if (execute) return modeLabel(true);
  if (shadowWrite) return 'SHADOW-WRITE';
  return modeLabel(false);
}

function parseTargetDate(argv = process.argv) {
  const arg = argv.find((item) => item.startsWith('--date='));
  if (!arg) return utcDateString(new Date(Date.now() + 24 * 60 * 60 * 1000));
  return arg.slice('--date='.length);
}

async function getEligibleBrands(supabase) {
  const { data, error } = await supabase
    .from('brands')
    .select('id, name, owner_user_id, onboarding_completed, is_demo')
    .eq('onboarding_completed', true)
    .eq('is_demo', false)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Failed to fetch eligible brands: ${error.message}`);
  return data || [];
}

async function getActivePromptsForBrand(supabase, brand) {
  const { data, error } = await supabase
    .from('brand_prompts')
    .select('id, raw_prompt, improved_prompt, created_at')
    .eq('brand_id', brand.id)
    .eq('status', 'active')
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Failed to fetch prompts for ${brand.id}: ${error.message}`);

  return (data || []).map((prompt) => ({
    brand_id: brand.id,
    brand_name: brand.name,
    user_id: brand.owner_user_id,
    prompt_id: prompt.id,
    prompt_text: prompt.improved_prompt || prompt.raw_prompt || '',
  }));
}

async function getAccounts(supabase) {
  const { data, error } = await supabase
    .from('chatgpt_accounts')
    .select('id, email, status, is_eligible, proxy_host, last_used_at')
    .eq('status', 'active')
    .eq('is_eligible', true)
    .not('proxy_host', 'is', null)
    .order('last_used_at', { ascending: true, nullsFirst: true });

  if (error) throw new Error(`Failed to fetch ChatGPT accounts: ${error.message}`);
  return data || [];
}

async function getExistingSchedules(supabase, targetDate) {
  const legacy = await supabase
    .from('daily_schedules')
    .select('id, brand_id, schedule_date, prompt_ids, status, is_retry')
    .eq('schedule_date', targetDate)
    .neq('batch_type', 'onboarding');

  if (legacy.error) throw new Error(`Failed to fetch existing schedules: ${legacy.error.message}`);

  const v3 = await supabase
    .from('worker_v3_batch_items')
    .select('id, prompt_id, schedule_date, item_kind, is_retry')
    .eq('schedule_date', targetDate)
    .eq('item_kind', 'daily')
    .eq('is_retry', false);

  if (v3.error && v3.error.code !== '42P01') {
    throw new Error(`Failed to fetch v3 scheduled items: ${v3.error.message}`);
  }

  return {
    legacySchedules: legacy.data || [],
    v3Items: v3.error?.code === '42P01' ? [] : (v3.data || []),
    v3ItemsTableMissing: v3.error?.code === '42P01',
  };
}

function interleaveQueues(itemsByBrand) {
  const queues = itemsByBrand.map((items) => [...items]).filter((queue) => queue.length > 0);
  const interleaved = [];

  while (queues.some((queue) => queue.length > 0)) {
    for (const queue of queues) {
      if (queue.length > 0) interleaved.push(queue.shift());
    }
  }

  return interleaved;
}

function chunkExactlyFive(prompts) {
  const batches = [];
  const leftovers = [];

  for (let i = 0; i < prompts.length; i += CONFIG.promptsPerBatch) {
    const chunk = prompts.slice(i, i + CONFIG.promptsPerBatch);
    if (chunk.length === CONFIG.promptsPerBatch) batches.push(chunk);
    else leftovers.push(...chunk);
  }

  return { batches, leftovers };
}

function buildTimeSlots(targetDate, batchCount) {
  const start = atUtc(targetDate, CONFIG.primaryWindowStartHourUtc);
  const end = atUtc(targetDate, CONFIG.primaryWindowEndHourUtc);
  const windowMs = end.getTime() - start.getTime();

  if (batchCount === 0) return [];

  const minSpacingMs = CONFIG.dailyProtectionMinutes * 60 * 1000;
  const spacingMs = Math.max(minSpacingMs, Math.floor(windowMs / batchCount));

  return Array.from({ length: batchCount }, (_, index) => (
    new Date(Math.min(start.getTime() + index * spacingMs, end.getTime() - minSpacingMs))
  ));
}

function existingPromptSet(existing) {
  const ids = new Set();
  for (const schedule of existing.legacySchedules || []) {
    for (const promptId of schedule.prompt_ids || []) ids.add(promptId);
  }
  for (const item of existing.v3Items || []) ids.add(item.prompt_id);
  return ids;
}

async function writeShadowPlan(supabase, plannedBatches) {
  if (plannedBatches.length === 0) {
    return { batches: 0, items: 0, modelExecutions: 0 };
  }

  const batchRows = plannedBatches.map((planned) => planned.batch);
  const { data: insertedBatches, error: batchError } = await supabase
    .from('worker_v3_batches')
    .insert(batchRows)
    .select('id, batch_number');

  if (batchError) {
    throw new Error(`Failed to insert worker_v3_batches: ${batchError.message}`);
  }

  const batchIdByNumber = new Map((insertedBatches || []).map((row) => [row.batch_number, row.id]));
  const itemRows = [];
  const modelRows = [];

  for (const planned of plannedBatches) {
    const batchId = batchIdByNumber.get(planned.batch.batch_number);
    if (!batchId) {
      throw new Error(`Inserted batch id missing for batch_number ${planned.batch.batch_number}`);
    }

    for (const item of planned.items) {
      itemRows.push({
        batch_id: batchId,
        item_index: item.item_index,
        item_kind: item.item_kind,
        schedule_date: item.schedule_date,
        user_id: item.user_id,
        brand_id: item.brand_id,
        prompt_id: item.prompt_id,
        daily_report_id: null,
        onboarding_wave: null,
        is_retry: item.is_retry,
        status: item.status,
        chatgpt_status: 'pending',
        google_ai_overview_status: 'pending',
        claude_status: 'pending',
      });
    }

    for (const provider of CONFIG.providers) {
      modelRows.push({
        batch_id: batchId,
        item_id: null,
        provider,
        status: 'pending',
        prompts_attempted: planned.items.length,
      });
    }
  }

  const { error: itemError } = await supabase
    .from('worker_v3_batch_items')
    .insert(itemRows);

  if (itemError) {
    throw new Error(`Failed to insert worker_v3_batch_items: ${itemError.message}`);
  }

  const { error: modelError } = await supabase
    .from('worker_v3_model_executions')
    .insert(modelRows);

  if (modelError) {
    throw new Error(`Failed to insert worker_v3_model_executions: ${modelError.message}`);
  }

  return {
    batches: insertedBatches?.length || 0,
    items: itemRows.length,
    modelExecutions: modelRows.length,
  };
}

async function main() {
  const execute = isExecuteMode();
  const shadowWrite = isShadowWriteMode();
  const targetDate = parseTargetDate();
  const supabase = createServiceClient();

  console.log(`Worker V3 daily scheduler (${schedulerModeLabel({ execute, shadowWrite })})`);
  console.log(`Target UTC schedule_date: ${targetDate}`);
  console.log(`Primary execution window: ${atUtc(targetDate, CONFIG.primaryWindowStartHourUtc).toISOString()} to ${atUtc(targetDate, CONFIG.primaryWindowEndHourUtc).toISOString()}`);

  const [brands, accounts, existing] = await Promise.all([
    getEligibleBrands(supabase),
    getAccounts(supabase),
    getExistingSchedules(supabase, targetDate),
  ]);

  if (accounts.length === 0) {
    console.log('\nNo eligible ChatGPT accounts with proxies. Cannot build a schedule.');
    return;
  }

  const scheduledPromptIds = existingPromptSet(existing);
  const promptsByBrand = [];
  let missingPromptCount = 0;

  for (const brand of brands) {
    const prompts = await getActivePromptsForBrand(supabase, brand);
    const missingPrompts = prompts.filter((prompt) => !scheduledPromptIds.has(prompt.prompt_id));

    missingPromptCount += missingPrompts.length;
    if (missingPrompts.length > 0) promptsByBrand.push(missingPrompts);

    console.log(
      `  - ${brand.name || brand.id}: ${prompts.length} active, ${missingPrompts.length} missing for ${targetDate}`
    );
  }

  const interleavedPrompts = interleaveQueues(promptsByBrand);
  const { batches, leftovers } = chunkExactlyFive(interleavedPrompts);
  const slots = buildTimeSlots(targetDate, batches.length);

  const plannedBatches = batches.map((batch, index) => {
    const account = accounts[index % accounts.length];
    return {
      batch: {
        item_kind: 'daily',
        schedule_date: targetDate,
        chatgpt_account_id: account.id,
        batch_number: index + 1,
        execution_time: slots[index].toISOString(),
        batch_size: CONFIG.promptsPerBatch,
        status: 'pending',
        is_retry: false,
        priority: CONFIG.priority.daily,
      },
      items: batch.map((prompt, itemIndex) => ({
        item_index: itemIndex + 1,
        item_kind: 'daily',
        schedule_date: targetDate,
        user_id: prompt.user_id,
        brand_id: prompt.brand_id,
        brand_name: prompt.brand_name,
        prompt_id: prompt.prompt_id,
        prompt_text: prompt.prompt_text,
        is_retry: false,
        status: 'pending',
      })),
    };
  });

  console.log(`\nAccounts: ${accounts.map((account) => account.email || account.id).join(', ')}`);
  console.log(`Existing legacy schedules for date: ${existing.legacySchedules.length}`);
  console.log(`Existing v3 scheduled items for date: ${existing.v3Items.length}${existing.v3ItemsTableMissing ? ' (table not created yet)' : ''}`);
  console.log(`Missing active prompts: ${missingPromptCount}`);
  console.log(`Mixed-brand 5-prompt browser runs planned: ${plannedBatches.length}`);
  console.log(`Leftover prompts not scheduled because they do not make a final 5-prompt browser run: ${leftovers.length}`);

  for (const planned of plannedBatches) {
    console.log(JSON.stringify(planned, null, 2));
  }

  if (leftovers.length > 0) {
    console.log('\nLeftover prompt ids needing a product decision:');
    console.log(leftovers.map((prompt) => prompt.prompt_id).join(', '));
  }

  if (!execute) {
    if (!shadowWrite) {
      console.log('\nDry-run only. No worker_v3_batches, worker_v3_batch_items, model rows, or cron entries were created.');
      return;
    }

    const result = await writeShadowPlan(supabase, plannedBatches);
    console.log('\nShadow write complete. No worker execution, cron entries, or legacy daily_schedules rows were created.');
    console.log(`Inserted: ${result.batches} batches, ${result.items} items, ${result.modelExecutions} model execution rows.`);
    return;
  }

  throw new Error(
    'Execute mode is intentionally disabled in worker-v3. Daily schedule writes will be enabled after dry-run review.'
  );
}

main().catch((error) => {
  console.error(`\nWorker V3 daily scheduler failed: ${error.message}`);
  process.exitCode = 1;
});
