#!/usr/bin/env node
/**
 * Retry Failed Batches Scheduler
 *
 * Runs at 20:00 UTC daily via cron.
 * Finds all failed non-retry batches from the last 24 hours and
 * reschedules them evenly across the 4-hour retry window (20:00–24:00 UTC).
 * Inserts retry rows into daily_schedules and loads them into crontab.
 *
 * Prerequisite SQL:
 *   ALTER TABLE daily_schedules ADD COLUMN IF NOT EXISTS is_retry BOOLEAN DEFAULT false;
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');

const execAsync = promisify(exec);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const WORKER_DIR = '/root/be-visible.ai/worker';
const LOG_DIR = '/root/be-visible.ai/logs';
const RETRY_START_HOUR = 20;  // 8 PM UTC
const RETRY_END_HOUR   = 24;  // midnight UTC
const RETRY_WINDOW_MIN = (RETRY_END_HOUR - RETRY_START_HOUR) * 60; // 240 min
const MIN_SPACING_MIN  = 10;

async function scheduleRetryBatches() {
  console.log('\n' + '='.repeat(70));
  console.log('🔄 RETRY BATCH SCHEDULER');
  console.log('='.repeat(70));
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log('='.repeat(70) + '\n');

  try {
    // 1. Find failed non-retry batches from the last 24 hours whose time has already passed
    const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const now       = new Date().toISOString();
    const todayUtc  = new Date().toISOString().split('T')[0];

    const { data: failedBatches, error } = await supabase
      .from('daily_schedules')
      .select('id, brand_id, chatgpt_account_id, batch_number, prompt_ids, batch_size, user_id, schedule_date')
      .eq('status', 'failed')
      .eq('is_retry', false)
      .gt('execution_time', cutoff24h)
      .lt('execution_time', now);

    if (error) throw new Error('Failed to query failed batches: ' + error.message);

    if (!failedBatches || failedBatches.length === 0) {
      console.log('✅ No failed batches to retry today');
      return;
    }

    console.log(`📋 Found ${failedBatches.length} failed batch(es) to retry:\n`);
    failedBatches.forEach(b => {
      console.log(`   - Brand ${b.brand_id?.substring(0, 8)} | Batch ${b.batch_number} | ${b.batch_size} prompts | Date ${b.schedule_date}`);
    });

    // 1b. Filter out batches that already have a retry record (prevents duplicate key errors
    //     when the scheduler runs on consecutive days for the same still-failing batch).
    const { data: existingRetries } = await supabase
      .from('daily_schedules')
      .select('user_id, batch_number, schedule_date')
      .eq('is_retry', true)
      .in('schedule_date', [...new Set(failedBatches.map(b => b.schedule_date))]);

    const retryKey = (b) => `${b.user_id}|${b.batch_number}|${b.schedule_date}`;
    const existingKeys = new Set((existingRetries || []).map(retryKey));
    const newBatches = failedBatches.filter(b => !existingKeys.has(retryKey(b)));

    if (newBatches.length === 0) {
      console.log('✅ All failed batches already have a retry record scheduled — nothing to do');
      return;
    }
    if (newBatches.length < failedBatches.length) {
      console.log(`ℹ️  ${failedBatches.length - newBatches.length} batch(es) already retried — scheduling ${newBatches.length} new retry(ies)\n`);
    }

    // 2. Generate evenly-spaced retry times within the 20:00–24:00 UTC window
    const maxSlots = Math.floor(RETRY_WINDOW_MIN / MIN_SPACING_MIN); // 24 max
    if (newBatches.length > maxSlots) {
      console.warn(`⚠️  ${newBatches.length} retries but only ${maxSlots} slots — some will share times`);
    }
    // Spread evenly; floor spacing at MIN_SPACING_MIN
    const spacing = Math.max(MIN_SPACING_MIN, Math.floor(RETRY_WINDOW_MIN / newBatches.length));

    const retryTimes = newBatches.map((_, i) => {
      const totalMinute = RETRY_START_HOUR * 60 + i * spacing;
      const h = Math.min(Math.floor(totalMinute / 60), 23); // cap at 23:xx
      const m = totalMinute % 60;
      return {
        hour: h,
        minute: m,
        iso: `${todayUtc}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`
      };
    });

    // 3. Insert retry records into daily_schedules
    const retryRecords = newBatches.map((batch, i) => ({
      schedule_date: batch.schedule_date,
      user_id: batch.user_id,
      brand_id: batch.brand_id,
      chatgpt_account_id: batch.chatgpt_account_id,
      batch_number: batch.batch_number,
      execution_time: retryTimes[i].iso,
      prompt_ids: batch.prompt_ids,
      batch_size: batch.batch_size,
      status: 'pending',
      is_retry: true,
    }));

    const { data: inserted, error: insertError } = await supabase
      .from('daily_schedules')
      .insert(retryRecords)
      .select('id, batch_number, execution_time, brand_id');

    if (insertError) throw new Error('Failed to insert retry records: ' + insertError.message);

    console.log(`\n✅ Inserted ${inserted.length} retry batch(es):`);
    inserted.forEach((row, i) => {
      const t = new Date(row.execution_time);
      console.log(`   - Retry ${i + 1}: ${String(t.getUTCHours()).padStart(2,'0')}:${String(t.getUTCMinutes()).padStart(2,'0')} UTC | Batch ${row.batch_number} | Brand ${row.brand_id?.substring(0,8)}`);
    });

    // 4. Create BME rows (pending) so Table D shows the retries from the start
    if (inserted.length > 0) {
      const bmeRows = inserted.flatMap(s => [
        { schedule_id: s.id, model: 'chatgpt',            status: 'pending' },
        { schedule_id: s.id, model: 'google_ai_overview', status: 'pending' },
        { schedule_id: s.id, model: 'claude',             status: 'pending' },
      ]);
      const { error: bmeError } = await supabase.from('batch_model_executions').insert(bmeRows);
      if (bmeError) console.warn('[BME] Failed to create retry BME rows:', bmeError.message);
      else console.log(`✅ Created ${bmeRows.length} BME tracking rows`);
    }

    // 5. Load retry entries into crontab
    console.log('\n📝 Adding retry entries to crontab...');

    let currentCrontab = '';
    try {
      const { stdout } = await execAsync('crontab -l');
      currentCrontab = stdout;
    } catch (err) {
      if (!err.stderr?.includes('no crontab')) throw err;
    }

    // Keep all existing lines (both permanent and AUTO) — only append new retry entries
    const trimmed = currentCrontab.trimEnd();

    const retryCronEntries = inserted.map((row, i) => {
      const t = new Date(row.execution_time);
      const h = t.getUTCHours();
      const m = t.getUTCMinutes();
      return `${m} ${h} * * * cd ${WORKER_DIR} && node execute-batch.js ${row.id} >> ${LOG_DIR}/batch-${row.id}.log 2>&1 # AUTO - ${todayUtc} - Retry ${i + 1}`;
    });

    const newCrontab = trimmed + '\n\n# Retry Batches - Auto-generated on ' + todayUtc + '\n' + retryCronEntries.join('\n') + '\n';

    const tempFile = '/tmp/crontab_retry_temp';
    fs.writeFileSync(tempFile, newCrontab);
    await execAsync(`crontab ${tempFile}`);
    fs.unlinkSync(tempFile);

    console.log(`✅ Added ${retryCronEntries.length} retry cron entries`);
    retryCronEntries.forEach(e => console.log('   ' + e));

    console.log('\n' + '='.repeat(70));
    console.log(`✅ Retry scheduling complete — ${inserted.length} batch(es) queued for 20:00–24:00 UTC`);
    console.log('='.repeat(70) + '\n');

  } catch (err) {
    console.error('\n❌ Retry scheduler failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

scheduleRetryBatches();
