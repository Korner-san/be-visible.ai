#!/usr/bin/env node
/**
 * One-off: Regenerate March 19 schedule for Incredibuild.
 * Deletes all pending March 19 Incredibuild batches, creates 5 fresh ones
 * starting at 16:30 UTC (18:30 Israel time), spaced 20 min apart.
 * Also creates batch_model_executions rows (3 per batch) for Table D tracking.
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { spawnSync } = require('child_process');
const path = require('path');

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const BRAND_ID    = 'b1a37d48-375f-477a-b838-38486e5e1c2d';
const ACCOUNT_IDS = [
  '8c836336-d878-4351-a533-05a93e050a64', // ididitforkik1000
  '5f0bfc06-b820-45c4-8439-149c89d7786a', // bluecjamie1
];

async function main() {
  console.log('='.repeat(60));
  console.log('REGENERATE MARCH 19 SCHEDULE FOR INCREDIBUILD');
  console.log('='.repeat(60));

  const today = '2026-03-19';
  console.log('Schedule date:', today);

  // 1. Delete all pending March 19 Incredibuild schedule rows (already past or future)
  const { data: deleted, error: delErr } = await sb
    .from('daily_schedules')
    .delete()
    .eq('brand_id', BRAND_ID)
    .eq('schedule_date', today)
    .eq('status', 'pending')
    .select('id, batch_number');

  if (delErr) throw new Error('Delete failed: ' + delErr.message);
  console.log('Deleted', (deleted || []).length, 'old pending schedule rows:', (deleted || []).map(r => 'batch ' + r.batch_number).join(', '));

  // 2. Get owner_user_id
  const { data: brand, error: bErr } = await sb.from('brands').select('owner_user_id').eq('id', BRAND_ID).single();
  if (bErr) throw new Error('Brand fetch failed: ' + bErr.message);
  const userId = brand.owner_user_id;
  console.log('Owner user_id:', userId);

  // 3. Get all 10 active prompt IDs
  const { data: prompts, error: pErr } = await sb.from('brand_prompts').select('id').eq('brand_id', BRAND_ID).eq('status', 'active');
  if (pErr) throw new Error('Prompts fetch failed: ' + pErr.message);
  const promptIds = (prompts || []).map(p => p.id);
  console.log('Active prompts:', promptIds.length);

  if (promptIds.length === 0) { console.log('No active prompts.'); return; }

  // 4. Build batches starting at 16:30 UTC (18:30 Israel/UTC+2), 20 min spacing
  //    Target times: 16:30, 16:50, 17:10, 17:30, 17:50 UTC
  const baseTime = new Date('2026-03-19T16:30:00.000Z');
  const spacing  = 20; // minutes

  const batches = [];
  let i = 0, batchNum = 1;
  while (i < promptIds.length) {
    const batchPrompts = promptIds.slice(i, i + 2);
    const execTime = new Date(baseTime.getTime() + (batchNum - 1) * spacing * 60 * 1000);
    batches.push({
      schedule_date:       today,
      brand_id:            BRAND_ID,
      user_id:             userId,
      chatgpt_account_id:  ACCOUNT_IDS[(batchNum - 1) % ACCOUNT_IDS.length],
      batch_number:        batchNum,
      execution_time:      execTime.toISOString(),
      prompt_ids:          batchPrompts,
      batch_size:          batchPrompts.length,
      status:              'pending',
    });
    i += 2;
    batchNum++;
  }

  console.log('\nBatches to create:');
  batches.forEach(b => console.log(`  Batch ${b.batch_number}: ${b.batch_size} prompts at ${b.execution_time} (UTC) → account ${b.chatgpt_account_id.substring(0,8)}`));

  // 5. Insert schedule rows
  const { data: inserted, error: insErr } = await sb.from('daily_schedules').insert(batches).select('id');
  if (insErr) throw new Error('Insert failed: ' + insErr.message);
  console.log('\n✅ Inserted', batches.length, 'new schedule rows');

  // 6. Create 3 BME rows per schedule (for Table D model tracking)
  const bmeRows = inserted.flatMap(s => [
    { schedule_id: s.id, model: 'chatgpt',            status: 'pending' },
    { schedule_id: s.id, model: 'google_ai_overview', status: 'pending' },
    { schedule_id: s.id, model: 'claude',             status: 'pending' },
  ]);
  const { error: bmeErr } = await sb.from('batch_model_executions').insert(bmeRows);
  if (bmeErr) console.warn('BME rows creation failed:', bmeErr.message);
  else console.log('✅ Created', bmeRows.length, 'model execution tracking rows');

  // 7. Reload crontab
  console.log('\n🔄 Reloading crontab...');
  const result = spawnSync('node', [path.join(__dirname, 'load-daily-schedule.js')], { stdio: 'inherit', cwd: __dirname });
  if (result.status !== 0) console.error('load-daily-schedule exited with', result.status);
  else console.log('✅ Crontab reloaded');

  console.log('\n' + '='.repeat(60));
  console.log('DONE — all', promptIds.length, 'prompts scheduled for March 19');
  console.log('Batch 1 fires at 16:30 UTC = 18:30 Israel time');
  console.log('='.repeat(60));
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
