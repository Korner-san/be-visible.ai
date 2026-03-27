#!/usr/bin/env node
/**
 * Phase 4: Daily Summary Generator
 * 
 * Runs at 10:00 PM daily via cron (optional)
 * Generates end-of-day summary of execution
 * Can be used for monitoring and reporting
 * 
 * Usage: node generate-daily-summary.js
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function generateDailySummary() {
  console.log('\n' + '='.repeat(70));
  console.log('📈 DAILY EXECUTION SUMMARY');
  console.log('='.repeat(70));
  console.log(`Timestamp: ${new Date().toLocaleString()}`);
  console.log('='.repeat(70) + '\n');
  
  try {
    const today = new Date().toISOString().split('T')[0];
    
    // 1. Fetch today's schedules
    const { data: schedules, error: schedError } = await supabase
      .from('daily_schedules')
      .select(`
        *,
        users:user_id(email),
        brands:brand_id(name)
      `)
      .eq('schedule_date', today)
      .order('execution_time', { ascending: true });
    
    if (schedError) {
      throw new Error(`Failed to fetch schedules: ${schedError.message}`);
    }
    
    if (!schedules || schedules.length === 0) {
      console.log('ℹ️  No schedules found for today.\n');
      return;
    }
    
    // 2. Calculate statistics
    const total = schedules.length;
    const completed = schedules.filter(s => s.status === 'completed').length;
    const failed = schedules.filter(s => s.status === 'failed').length;
    const pending = schedules.filter(s => s.status === 'pending').length;
    
    const totalPrompts = schedules.reduce((sum, s) => sum + s.batch_size, 0);
    const completedPrompts = schedules
      .filter(s => s.status === 'completed')
      .reduce((sum, s) => sum + s.batch_size, 0);
    
    // 3. Fetch prompt results for citation count
    const scheduleIds = schedules.map(s => s.id);
    const promptIds = schedules.flatMap(s => s.prompt_ids);
    
    const { data: results, error: resultsError } = await supabase
      .from('prompt_results')
      .select('*')
      .in('brand_prompt_id', promptIds)
      .eq('provider', 'chatgpt');
    
    const totalCitations = results
      ? results.reduce((sum, r) => {
          const count = Array.isArray(r.chatgpt_citations) ? r.chatgpt_citations.length : 0;
          return sum + count;
        }, 0)
      : 0;
    
    const successfulResults = results
      ? results.filter(r => r.provider_status === 'ok').length
      : 0;
    
    // 4. Calculate execution times
    const executedBatches = schedules.filter(s => s.started_at && s.completed_at);
    const totalExecutionTime = executedBatches.reduce((sum, s) => {
      const duration = new Date(s.completed_at) - new Date(s.started_at);
      return sum + duration;
    }, 0);
    
    const avgExecutionTime = executedBatches.length > 0
      ? Math.round(totalExecutionTime / executedBatches.length / 1000)
      : 0;
    
    // 5. Display summary
    console.log('EXECUTION SUMMARY:');
    console.log('─'.repeat(70));
    console.log(`Date: ${today}`);
    console.log(`Total Batches: ${total}`);
    console.log(`  ✅ Completed: ${completed}`);
    console.log(`  ❌ Failed: ${failed}`);
    console.log(`  ⏳ Pending: ${pending}`);
    console.log(`\nTotal Prompts: ${totalPrompts}`);
    console.log(`  ✅ Processed: ${completedPrompts}`);
    console.log(`  📊 Results: ${successfulResults}/${completedPrompts} successful`);
    console.log(`  🔗 Citations: ${totalCitations} extracted`);
    console.log(`\nPerformance:`);
    console.log(`  Average batch time: ${avgExecutionTime}s`);
    
    const successRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    console.log(`  Success rate: ${successRate}%`);
    
    // 6. User breakdown
    console.log('\n' + '─'.repeat(70));
    console.log('USER BREAKDOWN:');
    console.log('─'.repeat(70));
    
    const userGroups = {};
    schedules.forEach(s => {
      const userEmail = s.users?.email || 'Unknown';
      if (!userGroups[userEmail]) {
        userGroups[userEmail] = {
          batches: 0,
          prompts: 0,
          completed: 0,
          failed: 0
        };
      }
      userGroups[userEmail].batches++;
      userGroups[userEmail].prompts += s.batch_size;
      if (s.status === 'completed') userGroups[userEmail].completed++;
      if (s.status === 'failed') userGroups[userEmail].failed++;
    });
    
    Object.entries(userGroups).forEach(([email, stats]) => {
      console.log(`\n${email}:`);
      console.log(`  Batches: ${stats.completed}/${stats.batches} completed`);
      console.log(`  Prompts: ${stats.prompts} total`);
      if (stats.failed > 0) {
        console.log(`  Failures: ${stats.failed} ⚠️`);
      }
    });
    
    // 7. Failure analysis
    const failures = schedules.filter(s => s.status === 'failed');
    if (failures.length > 0) {
      console.log('\n' + '─'.repeat(70));
      console.log('FAILURE ANALYSIS:');
      console.log('─'.repeat(70));
      
      failures.forEach((f, i) => {
        console.log(`\n${i + 1}. Batch ${f.batch_number}:`);
        console.log(`   Time: ${new Date(f.execution_time).toLocaleTimeString()}`);
        console.log(`   Error: ${f.error_message || 'Unknown error'}`);
      });
    }
    
    // 8. Save summary to database (optional table: daily_execution_summaries)
    // This can be implemented later if needed for dashboard display
    
    console.log('\n' + '='.repeat(70));
    
    if (pending > 0) {
      console.log('⚠️  WARNING: Some batches are still pending!');
      console.log(`   ${pending} batch(es) did not execute as scheduled.`);
      console.log('   Check cron logs and system status.');
    } else if (failed > 0) {
      console.log('⚠️  WARNING: Some batches failed!');
      console.log(`   ${failed} batch(es) encountered errors.`);
      console.log('   Review error messages above for debugging.');
    } else {
      console.log('✅ All batches completed successfully!');
      console.log(`   ${totalPrompts} prompts processed, ${totalCitations} citations extracted.`);
    }
    
    console.log('='.repeat(70) + '\n');
    
  } catch (error) {
    console.error('\n❌ Failed to generate daily summary:', error.message);
    process.exit(1);
  }
}

// Execute
generateDailySummary();

