#!/usr/bin/env node
/**
 * Daily Schedule Cleanup
 *
 * Runs at 7:59 UTC daily via cron.
 * Removes AUTO cron entries from PREVIOUS days only — today's entries are preserved
 * so morning/afternoon batches (which run 00:00–20:00 UTC) are not killed.
 *
 * Usage: node cleanup-daily-schedule.js
 */

require('dotenv').config();
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');

const execAsync = promisify(exec);

async function cleanupDailySchedule() {
  console.log('\n' + '='.repeat(70));
  console.log('🧹 DAILY SCHEDULE CLEANUP');
  console.log('='.repeat(70));
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log('='.repeat(70) + '\n');

  try {
    const today = new Date().toISOString().split('T')[0];

    // 1. Read current crontab
    console.log('📋 Reading current crontab...');
    let currentCrontab = '';
    try {
      const { stdout } = await execAsync('crontab -l');
      currentCrontab = stdout;
      console.log('✅ Current crontab loaded');
    } catch (err) {
      if (err.stderr && err.stderr.includes('no crontab')) {
        console.log('ℹ️  No crontab — nothing to clean');
        return;
      }
      throw err;
    }

    const lines = currentCrontab.split('\n');

    // Count old entries: AUTO command lines OR date-section headers not from today
    const oldAutoLines = lines.filter(line =>
      (line.includes('# AUTO -') || line.includes('# Daily Batch Schedule - Auto-generated on')) &&
      !line.includes(today)
    );
    console.log(`\n🔍 Found ${oldAutoLines.length} old entries to remove (preserving today's ${today} entries)`);

    if (oldAutoLines.length === 0) {
      console.log('ℹ️  No old entries to clean — exiting');
      return;
    }

    // 2. Remove old AUTO entries and old date-header comment lines.
    //    Keep ALL today's entries untouched so running batches are not broken.
    const cleanedLines = lines.filter(line => {
      // Old AUTO cron commands: remove any # AUTO - line not dated today
      if (line.includes('# AUTO -')) return line.includes(today);
      // Old section headers (e.g. "# Daily Batch Schedule - Auto-generated on 2025-11-17")
      if (line.includes('# Daily Batch Schedule - Auto-generated on')) return line.includes(today);
      return true; // keep all permanent lines
    });

    const newCrontab = cleanedLines.join('\n').trimEnd() + '\n';

    // 3. Write cleaned crontab
    console.log('💾 Writing cleaned crontab...');
    const tempFile = '/tmp/crontab_cleanup';
    fs.writeFileSync(tempFile, newCrontab);
    await execAsync(`crontab ${tempFile}`);
    fs.unlinkSync(tempFile);
    console.log('✅ Crontab cleaned successfully!');

    // 4. Verify
    const { stdout: verifyOutput } = await execAsync('crontab -l');
    const remainingAuto = verifyOutput.split('\n').filter(l => l.includes('# AUTO -'));
    const todayAuto = remainingAuto.filter(l => l.includes(today));

    console.log('\n' + '='.repeat(70));
    console.log('📊 CLEANUP SUMMARY');
    console.log('='.repeat(70));
    console.log(`Date: ${today}`);
    console.log(`Old entries removed: ${oldAutoLines.length}`);
    console.log(`Today's entries preserved: ${todayAuto.length}`);
    console.log('='.repeat(70));
    console.log('\n✅ Daily cleanup completed successfully!\n');

  } catch (error) {
    console.error('\n❌ Failed to cleanup daily schedule:', error.message);
    process.exit(1);
  }
}

cleanupDailySchedule();
