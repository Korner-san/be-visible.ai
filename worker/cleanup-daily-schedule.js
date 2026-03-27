#!/usr/bin/env node
/**
 * Phase 4: Daily Schedule Cleanup
 * 
 * Runs at 11:59 PM daily via cron
 * Removes auto-generated cron entries from today
 * Prepares system for next day's schedule
 * 
 * Usage: node cleanup-daily-schedule.js
 */

require('dotenv').config();
const { exec } = require('child_process');
const { promisify } = require('util');

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
        console.log('ℹ️  No crontab found - nothing to clean');
        return;
      } else {
        throw err;
      }
    }
    
    // 2. Count auto-generated entries for today
    const lines = currentCrontab.split('\n');
    const todayAutoLines = lines.filter(line => 
      line.includes('# AUTO -') && line.includes(today)
    );
    
    console.log(`\n🔍 Found ${todayAutoLines.length} auto-generated entries for ${today}`);
    
    if (todayAutoLines.length === 0) {
      console.log('ℹ️  No entries to clean - exiting');
      return;
    }
    
    // 3. Remove today's auto-generated entries
    console.log('🔄 Removing today\'s auto-generated entries...');
    const cleanedLines = lines.filter(line => {
      // Keep permanent lines and remove today's AUTO lines
      return !(line.includes('# AUTO -') && line.includes(today));
    });
    
    // Also remove the daily schedule comment header if present
    const finalLines = cleanedLines.filter(line => {
      return !line.includes(`# Daily Batch Schedule - Auto-generated on ${today}`);
    });
    
    const newCrontab = finalLines.join('\n').trim() + '\n';
    
    // 4. Write cleaned crontab
    console.log('💾 Writing cleaned crontab...');
    const fs = require('fs');
    const tempFile = '/tmp/crontab_cleanup';
    fs.writeFileSync(tempFile, newCrontab);
    
    await execAsync(`crontab ${tempFile}`);
    fs.unlinkSync(tempFile);
    
    console.log('✅ Crontab cleaned successfully!');
    
    // 5. Verify cleanup
    console.log('\n🔍 Verifying cleanup...');
    const { stdout: verifyOutput } = await execAsync('crontab -l');
    const remainingAutoLines = verifyOutput.split('\n').filter(l => 
      l.includes('# AUTO -')
    );
    
    console.log(`✅ Remaining auto-generated entries: ${remainingAutoLines.length}`);
    
    // 6. Display summary
    console.log('\n' + '='.repeat(70));
    console.log('📊 CLEANUP SUMMARY');
    console.log('='.repeat(70));
    console.log(`Date: ${today}`);
    console.log(`Entries removed: ${todayAutoLines.length}`);
    console.log(`Remaining auto entries: ${remainingAutoLines.length}`);
    console.log('='.repeat(70));
    
    console.log('\n✅ Daily cleanup completed successfully!');
    console.log('   System ready for tomorrow\'s schedule.\n');
    
  } catch (error) {
    console.error('\n❌ Failed to cleanup daily schedule:', error.message);
    console.error('   This is not critical - old entries will be removed tomorrow.');
    process.exit(1);
  }
}

// Execute
cleanupDailySchedule();

