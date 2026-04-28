#!/usr/bin/env node
/**
 * Phase 4: Daily Schedule Loader
 * 
 * Runs at 7:00 AM daily via cron
 * Reads today's schedule from Supabase
 * Dynamically updates Hetzner crontab with batch execution times
 * 
 * Usage: node load-daily-schedule.js
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const WORKER_DIR = '/root/be-visible.ai/worker';
const LOG_DIR = '/root/be-visible.ai/logs';

async function loadDailySchedule() {
  console.log('\n' + '='.repeat(70));
  console.log('📅 DAILY SCHEDULE LOADER');
  console.log('='.repeat(70));
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log('='.repeat(70) + '\n');
  
  try {
    // 1. Get target date from argument or use today
    const dateArg = process.argv.find(arg => arg.startsWith('--date='));
    const today = dateArg ? dateArg.split('=')[1] : new Date().toISOString().split('T')[0];

    console.log('📊 Fetching schedule from Supabase...');
    console.log(`   Date: ${today}`);
    
    const { data: schedules, error } = await supabase
      .from('daily_schedules')
      .select('*')
      .eq('schedule_date', today)
      .eq('status', 'pending')
      .neq('batch_type', 'onboarding')  // onboarding batches dispatched by queue-organizer, not crontab
      .order('execution_time', { ascending: true });
    
    if (error) {
      throw new Error(`Failed to fetch schedules: ${error.message}`);
    }
    
    if (!schedules || schedules.length === 0) {
      console.log('ℹ️  No pending schedules found for today');
      console.log('   Nothing to schedule. Exiting.');
      return;
    }
    
    console.log(`✅ Found ${schedules.length} pending batch(es):\n`);
    
    schedules.forEach((s, i) => {
      const execTime = new Date(s.execution_time);
      console.log(`   ${i + 1}. Batch ${s.batch_number}: ${s.batch_size} prompts at ${execTime.toLocaleTimeString()}`);
    });
    
    // 2. Read current crontab
    console.log('\n📋 Reading current crontab...');
    let currentCrontab = '';
    
    try {
      const { stdout } = await execAsync('crontab -l');
      currentCrontab = stdout;
      console.log('✅ Current crontab loaded');
    } catch (err) {
      // Crontab might be empty (no crontab for user)
      if (err.stderr && err.stderr.includes('no crontab')) {
        console.log('ℹ️  No existing crontab - will create new');
        currentCrontab = '';
      } else {
        throw err;
      }
    }
    
    // 3. Remove old auto-generated entries from previous days
    console.log('🔄 Cleaning old auto-generated entries...');
    const lines = currentCrontab.split('\n');
    const permanentLines = lines.filter(line => {
      // Remove ALL auto-generated entries (prevents duplicates if loader runs twice on same day)
      return !line.includes('# AUTO -');
    });
    
    let newCrontab = permanentLines.join('\n').trim();
    
    // 4. Generate new cron entries for today's batches
    console.log('\n📝 Generating cron entries for today...');
    const cronEntries = [];
    
    for (const schedule of schedules) {
      const execTime = new Date(schedule.execution_time);
      const hour = execTime.getUTCHours();
      const minute = execTime.getUTCMinutes();
      
      // Cron format: minute hour day month weekday command
      const cronTime = `${minute} ${hour} * * *`;
      const batchScript = schedule.batch_type === 'onboarding' ? 'execute-onboarding-batch.js' : 'execute-batch.js';
      const command = `cd ${WORKER_DIR} && node ${batchScript} ${schedule.id} >> ${LOG_DIR}/batch-${schedule.id}.log 2>&1`;
      const batchLabel = schedule.batch_type === 'onboarding' ? 'Onboarding' : 'Batch';
      const entry = `${cronTime} ${command} # AUTO - ${today} - ${batchLabel} ${schedule.batch_number}`;

      cronEntries.push(entry);

      console.log(`   ✅ ${hour}:${String(minute).padStart(2, '0')} - ${batchLabel} ${schedule.batch_number} (${schedule.batch_size} prompts)${schedule.batch_type === 'onboarding' ? ' [onboarding]' : ''}`);
    }
    
    // 5. Append new entries to crontab
    if (cronEntries.length > 0) {
      newCrontab += '\n\n# Daily Batch Schedule - Auto-generated on ' + today + '\n';
      newCrontab += cronEntries.join('\n');
      newCrontab += '\n';
    }
    
    // 6. Write updated crontab
    console.log('\n💾 Writing updated crontab...');
    const tempFile = '/tmp/crontab_temp';
    const fs = require('fs');
    fs.writeFileSync(tempFile, newCrontab);
    
    await execAsync(`crontab ${tempFile}`);
    fs.unlinkSync(tempFile);
    
    console.log('✅ Crontab updated successfully!');
    
    // 7. Verify crontab
    console.log('\n🔍 Verifying crontab...');
    const { stdout: verifyOutput } = await execAsync('crontab -l');
    const verifyLines = verifyOutput.split('\n').filter(l => l.includes('# AUTO -'));
    
    console.log(`✅ ${verifyLines.length} auto-generated entries in crontab`);
    
    // 8. Display summary
    console.log('\n' + '='.repeat(70));
    console.log('📊 SCHEDULE LOADING SUMMARY');
    console.log('='.repeat(70));
    console.log(`Date: ${today}`);
    console.log(`Total batches scheduled: ${schedules.length}`);
    console.log(`Cron entries added: ${cronEntries.length}`);
    console.log(`First execution: ${new Date(schedules[0].execution_time).toLocaleTimeString()}`);
    console.log(`Last execution: ${new Date(schedules[schedules.length - 1].execution_time).toLocaleTimeString()}`);
    console.log('='.repeat(70));
    
    console.log('\n✅ Daily schedule loaded successfully!');
    console.log('   Batches will execute automatically throughout the day.');
    console.log('   Monitor with: node check-status.js\n');
    
  } catch (error) {
    console.error('\n❌ Failed to load daily schedule:', error.message);
    
    // Log error to database for monitoring
    try {
      await supabase
        .from('system_logs')
        .insert({
          log_type: 'schedule_load_error',
          message: error.message,
          timestamp: new Date().toISOString()
        });
    } catch (logErr) {
      console.error('Failed to log error to database:', logErr);
    }
    
    process.exit(1);
  }
}

// Execute
loadDailySchedule();





