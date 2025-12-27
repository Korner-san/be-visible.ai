#!/usr/bin/env node
/**
 * End-of-Day Processor
 *
 * RUNS ONCE after all prompt batches complete for a daily report
 *
 * Responsibilities:
 * 1. Brand Analysis - Analyze ALL responses for brand mentions
 * 2. Citation Processing - Extract and classify ALL URLs with Tavily
 * 3. Report Aggregation - Calculate final stats
 *
 * This should ONLY run when:
 * - All batches for the day are complete (status='completed')
 * - NOT run per batch!
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const brandAnalyzer = require('./processors/brand-analyzer');
const citationProcessor = require('./process-daily-report-citations');
const reportAggregator = require('./processors/report-aggregator');
const visibilityScoreCalculator = require('./processors/visibility-score-calculator');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Process a daily report after all batches complete
 * @param {string} dailyReportId - The daily report ID to process
 * @param {Array<string>} providers - Which providers to process (default: ['chatgpt'])
 */
async function processEndOfDay(dailyReportId, providers = ['chatgpt']) {
  console.log('\n' + '='.repeat(70));
  console.log('🌙 END-OF-DAY PROCESSOR');
  console.log('='.repeat(70));
  console.log('Daily Report ID: ' + dailyReportId);
  console.log('Providers: ' + providers.join(', '));
  console.log('='.repeat(70) + '\n');

  const startTime = new Date();

  try {
    // Verify this is a complete daily report
    const { data: report, error: reportError } = await supabase
      .from('daily_reports')
      .select('id, brand_id, report_date, status')
      .eq('id', dailyReportId)
      .single();

    if (reportError || !report) {
      throw new Error('Daily report not found: ' + (reportError?.message || 'No data'));
    }

    console.log('✅ Daily report loaded');
    console.log('   Brand ID: ' + report.brand_id);
    console.log('   Report Date: ' + report.report_date);
    console.log('   Status: ' + report.status);

    // Check if all batches are complete for this report
    const allBatchesComplete = await checkAllBatchesComplete(report.brand_id, report.report_date);

    if (!allBatchesComplete) {
      console.log('⚠️  WARNING: Not all batches complete yet. Proceeding anyway...');
    }

    // PHASE 1: BRAND ANALYSIS (Analyze ALL responses for brand mentions)
    console.log('\n🔍 PHASE 1: BRAND ANALYSIS');
    console.log('─'.repeat(70));
    console.log('Analyzing ALL prompt responses for brand mentions...');

    const analysisResult = await brandAnalyzer.analyzeResults(dailyReportId, providers);

    console.log('✅ Phase 1 complete:');
    console.log('   Total analyzed: ' + analysisResult.analyzed);
    console.log('   Brand mentioned: ' + analysisResult.brandMentioned);
    console.log('   No mention: ' + analysisResult.noMention);

    // PHASE 2: CITATION PROCESSING (Extract and classify ALL URLs)
    console.log('\n🔗 PHASE 2: CITATION PROCESSING');
    console.log('─'.repeat(70));
    console.log('Processing ALL citations with Tavily...');

    try {
      const citationResult = await citationProcessor.processDailyReportCitations(dailyReportId);

      console.log('✅ Phase 2 complete:');
      console.log('   Total citations: ' + (citationResult.totalCitations || 0));
      console.log('   New URLs: ' + (citationResult.newUrls || 0));
      console.log('   Extracted: ' + (citationResult.extracted || 0));
      console.log('   Classified: ' + (citationResult.classified || 0));
    } catch (citationError) {
      console.error('⚠️  Phase 2 failed (non-blocking):', citationError.message);
      console.log('   Citations will need to be processed later');
    }

    // PHASE 3: REPORT AGGREGATION (Calculate final stats)
    console.log('\n📊 PHASE 3: REPORT AGGREGATION');
    console.log('─'.repeat(70));
    console.log('Calculating final statistics...');

    const aggregateResult = await reportAggregator.updateAggregates(dailyReportId, providers);

    console.log('✅ Phase 3 complete:');
    providers.forEach(provider => {
      if (aggregateResult[provider]) {
        const stats = aggregateResult[provider];
        console.log(`   ${provider}: ${stats.ok}/${stats.attempted} successful (${stats.status})`);
      }
    });

    // PHASE 4: VISIBILITY SCORE CALCULATION
    console.log('\n📊 PHASE 4: VISIBILITY SCORE');
    console.log('─'.repeat(70));
    console.log('Calculating visibility score...');

    try {
      const scoreResult = await visibilityScoreCalculator.calculateVisibilityScore(dailyReportId);

      console.log('✅ Phase 4 complete:');
      console.log('   Visibility Score: ' + scoreResult.score.toFixed(1) + '/100');
      if (scoreResult.details) {
        console.log('   Total responses: ' + scoreResult.details.totalResponses);
        console.log('   Mentioned: ' + scoreResult.details.mentionedResponses);
      }
    } catch (scoreError) {
      console.error('⚠️  Phase 4 failed (non-blocking):', scoreError.message);
      console.log('   Visibility score will need to be calculated later');
    }

    // PHASE 5: MARK REPORT AS COMPLETE
    console.log('\n✅ PHASE 5: FINALIZATION');
    console.log('─'.repeat(70));

    const { error: updateError } = await supabase
      .from('daily_reports')
      .update({
        status: 'completed'
        // processed_at column doesn't exist in schema
      })
      .eq('id', dailyReportId);

    if (updateError) {
      console.error('⚠️  Failed to update report status:', updateError.message);
    } else {
      console.log('✅ Daily report marked as complete');
    }

    const endTime = new Date();
    const totalTime = Math.round((endTime - startTime) / 1000);

    console.log('\n' + '='.repeat(70));
    console.log('🎉 END-OF-DAY PROCESSING COMPLETE');
    console.log('='.repeat(70));
    console.log('Total time: ' + totalTime + 's');
    console.log('Brand mentions: ' + analysisResult.brandMentioned);
    console.log('Status: complete');
    console.log('='.repeat(70) + '\n');

    return {
      success: true,
      dailyReportId,
      analysisResult,
      aggregateResult,
      totalTime
    };

  } catch (error) {
    console.error('\n❌ END-OF-DAY PROCESSING FAILED');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);

    // Mark report as failed
    await supabase
      .from('daily_reports')
      .update({
        status: 'failed',
        error_message: error.message
      })
      .eq('id', dailyReportId);

    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Check if all batches are in a final state (no more processing needed)
 * Returns true if all batches are either 'completed' or 'failed' (not pending/running)
 */
async function checkAllBatchesComplete(brandId, reportDate) {
  const { data: schedules, error } = await supabase
    .from('daily_schedules')
    .select('status')
    .eq('brand_id', brandId)
    .eq('schedule_date', reportDate);

  if (error) {
    console.error('Warning: Could not check batch completion:', error.message);
    return false;
  }

  if (!schedules || schedules.length === 0) {
    return false;
  }

  // All schedules must be in a final state (completed OR failed)
  // NOT pending or running
  const allDone = schedules.every(s => s.status === 'completed' || s.status === 'failed');

  const completed = schedules.filter(s => s.status === 'completed').length;
  const failed = schedules.filter(s => s.status === 'failed').length;
  const pending = schedules.filter(s => s.status === 'pending' || s.status === 'running').length;

  console.log(`📊 Batch status: ${completed} completed, ${failed} failed, ${pending} pending/running (${schedules.length} total)`);

  return allDone;
}

/**
 * Auto-detect and process any daily reports that are ready
 * (All batches complete but report not yet processed)
 */
async function autoProcessPendingReports() {
  console.log('🔍 Scanning for daily reports ready for end-of-day processing...\n');

  // Find reports where all batches are complete but report is still 'running'
  const { data: reports, error } = await supabase
    .from('daily_reports')
    .select('id, brand_id, report_date')
    .eq('status', 'running')
    .order('report_date', { ascending: false })
    .limit(10);

  if (error) {
    console.error('❌ Error fetching reports:', error.message);
    return;
  }

  if (!reports || reports.length === 0) {
    console.log('No reports ready for processing.\n');
    return;
  }

  console.log(`Found ${reports.length} report(s) in 'running' status. Checking batches...\n`);

  for (const report of reports) {
    const allComplete = await checkAllBatchesComplete(report.brand_id, report.report_date);

    if (allComplete) {
      console.log(`\n✅ Report ${report.id} is ready - all batches complete!`);
      console.log('   Processing now...\n');

      // Determine providers based on what data exists
      const { data: results } = await supabase
        .from('prompt_results')
        .select('provider')
        .eq('daily_report_id', report.id)
        .limit(100);

      const providers = [...new Set((results || []).map(r => r.provider))];

      await processEndOfDay(report.id, providers.length > 0 ? providers : ['chatgpt']);
    } else {
      console.log(`⏳ Report ${report.id} - batches still running, skipping`);
    }
  }
}

// CLI Interface
if (require.main === module) {
  const dailyReportId = process.argv[2];

  if (dailyReportId && dailyReportId !== '--auto') {
    // Process specific daily report
    processEndOfDay(dailyReportId)
      .then(result => {
        process.exit(result.success ? 0 : 1);
      })
      .catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
      });
  } else if (dailyReportId === '--auto') {
    // Auto-detect and process pending reports
    autoProcessPendingReports()
      .then(() => {
        console.log('\n✅ Auto-processing complete\n');
        process.exit(0);
      })
      .catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
      });
  } else {
    console.error('Usage:');
    console.error('  node end-of-day-processor.js <daily_report_id>');
    console.error('  node end-of-day-processor.js --auto');
    process.exit(1);
  }
}

module.exports = {
  processEndOfDay,
  autoProcessPendingReports
};
