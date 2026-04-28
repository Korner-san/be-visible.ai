const { CONFIG } = require('./config');

async function createPendingBmeRows(supabase, scheduleIds, execute = false) {
  const ids = Array.isArray(scheduleIds) ? scheduleIds.filter(Boolean) : [scheduleIds].filter(Boolean);
  if (ids.length === 0) return { inserted: 0 };

  const rows = ids.flatMap((scheduleId) =>
    CONFIG.providers.map((model) => ({
      schedule_id: scheduleId,
      model,
      status: 'pending',
    }))
  );

  if (!execute) {
    return { inserted: 0, planned: rows.length, dryRun: true };
  }

  const { error } = await supabase.from('batch_model_executions').insert(rows);
  if (error) throw new Error(`Failed to create BME rows: ${error.message}`);

  return { inserted: rows.length };
}

async function upsertBme(supabase, scheduleId, model, data, execute = false) {
  const row = { schedule_id: scheduleId, model, ...data };
  if (!execute) return { dryRun: true, row };

  const { data: saved, error } = await supabase
    .from('batch_model_executions')
    .upsert(row, { onConflict: 'schedule_id,model' })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to upsert BME ${model}: ${error.message}`);
  return saved;
}

module.exports = {
  createPendingBmeRows,
  upsertBme,
};
