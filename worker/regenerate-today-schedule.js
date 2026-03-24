#!/usr/bin/env node
/**
 * One-off: Regenerate today's schedule for Incredibuild
 * Deletes broken today batches and creates fresh ones covering all 10 active prompts.
 * Then reloads the crontab via load-daily-schedule.js.
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { spawnSync } = require('child_process');
const path = require('path');

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const BRAND_ID = 'b1a37d48-375f-477a-b838-38486e5e1c2d';
const USER_ID_TIMEZONE = 'Asia/Jerusalem';
const ACCOUNT_IDS = [
  '8c836336-d878-4351-a533-05a93e050a64', // ididitforkik1000
  '5f0bfc06-b820-45c4-8439-149c89d7786a', // bluecjamie1
];

async function main() {
  console.log('='.repeat(60));
  console.log('REGENERATE TODAY SCHEDULE FOR INCREDIBUILD');
  console.log('='.repeat(60));

  // 1. Get today's date in UTC (schedule_date)
  const today = new Date().toISOString().split('T')[0];
  console.log('Today:', today);

  // 2. Delete ALL of today's Incredibuild pending schedule rows
  const { data: deleted, error: delErr } = await sb
    .from('daily_schedules')
    .delete()
    .eq('brand_id', BRAND_ID)
    .eq('schedule_date', today)
    .eq('status', 'pending')
    .select('id, batch_number');

  if (delErr) throw new Error('Delete failed: ' + delErr.message);
  console.log('Deleted', (deleted || []).length, 'old schedule rows:', (deleted || []).map(r => 'batch ' + r.batch_number).join(', '));

  // 3. Get all active prompt IDs for Incredibuild
  const { data: prompts, error: pErr } = await sb
    .from('brand_prompts')
    .select('id')
    .eq('brand_id', BRAND_ID)
    .eq('status', 'active');

  if (pErr) throw new Error('Prompts fetch failed: ' + pErr.message);
  const promptIds = (prompts || []).map(p => p.id);
  console.log('Active prompts to schedule:', promptIds.length);

  if (promptIds.length === 0) {
    console.log('No active prompts — nothing to schedule.');
    return;
  }

  // 3b. Get owner_user_id for Incredibuild
  const { data: brand, error: bErr } = await sb
    .from('brands')
    .select('owner_user_id')
    .eq('id', BRAND_ID)
    .single();
  if (bErr) throw new Error('Brand fetch failed: ' + bErr.message);
  const userId = brand.owner_user_id;
  console.log('Owner user_id:', userId);

  // 4. Build batches: split prompts into groups of 2, alternating accounts
  const nowUtc = new Date();
  // Start 15 minutes from now, spaced 20 minutes apart
  const startOffset = 15; // minutes from now
  const spacing = 20;     // minutes between batches

  const batches = [];
  let i = 0;
  let batchNum = 1;
  while (i < promptIds.length) {
    const batchPrompts = promptIds.slice(i, i + 2);
    const execTime = new Date(nowUtc.getTime() + (startOffset + (batchNum - 1) * spacing) * 60 * 1000);
    batches.push({
      schedule_date: today,
      brand_id: BRAND_ID,
      chatgpt_account_id: ACCOUNT_IDS[(batchNum - 1) % ACCOUNT_IDS.length],
      batch_number: batchNum,
      execution_time: execTime.toISOString(),
      prompt_ids: batchPrompts,
      batch_size: batchPrompts.length,
      status: 'pending',
      user_id: userId,
    });
    i += 2;
    batchNum++;
  }

  console.log('\nBatches to create:');
  batches.forEach(b => {
    console.log(`  Batch ${b.batch_number}: ${b.batch_size} prompts at ${b.execution_time} → account ${b.chatgpt_account_id.substring(0,8)}`);
  });

  // 5. Insert new schedule rows
  const { data: inserted, error: insErr } = await sb.from('daily_schedules').insert(batches).select('id');
  if (insErr) throw new Error('Insert failed: ' + insErr.message);
  console.log('\n✅ Inserted', batches.length, 'new schedule rows');

  // 5b. Create 3 BME rows (pending) per schedule
  if (inserted && inserted.length > 0) {
    const bmeRows = inserted.flatMap(s => [
      { schedule_id: s.id, model: 'chatgpt',            status: 'pending' },
      { schedule_id: s.id, model: 'google_ai_overview', status: 'pending' },
      { schedule_id: s.id, model: 'claude',             status: 'pending' },
    ]);
    const { error: bmeErr } = await sb.from('batch_model_executions').insert(bmeRows);
    if (bmeErr) console.warn('BME rows creation failed:', bmeErr.message);
    else console.log('✅ Created', bmeRows.length, 'model execution tracking rows');
  }

  // 6. Reload crontab via load-daily-schedule.js
  console.log('\n🔄 Reloading crontab...');
  const result = spawnSync('node', [path.join(__dirname, 'load-daily-schedule.js')], {
    stdio: 'inherit',
    cwd: __dirname,
  });
  if (result.status !== 0) {
    console.error('load-daily-schedule exited with', result.status);
  } else {
    console.log('✅ Crontab reloaded');
  }

  console.log('\n' + '='.repeat(60));
  console.log('DONE — all', promptIds.length, 'prompts scheduled for today');
  console.log('='.repeat(60));
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
