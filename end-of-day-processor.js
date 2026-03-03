#!/usr/bin/env node
/**
 * End-of-Day Processor
 *
 * RUNS ONCE after all prompt batches complete for a daily report (or per-phase for onboarding).
 *
 * Responsibilities:
 * 1. Brand Analysis - Analyze ALL responses for brand mentions
 * 2. Citation Processing - Extract and classify ALL URLs with Tavily (Phase 2 only)
 * 3. Report Aggregation - Calculate final stats
 * 4. Visibility Score
 * 5. Share of Voice (Phase 2 only)
 * 6. Citation Share (Phase 2 only)
 * 7. Competitor Metrics (Phase 2 only)
 * 8. Finalization
 *
 * options.phase:
 *   1 = Phase 1 partial (first 6 prompts) — runs phases 1+3+4 only, keeps is_partial=true
 *   2 = Full (all 30 prompts, default) — runs all phases, sets is_partial=false
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const brandAnalyzer = require('./processors/brand-analyzer');
const citationProcessor = require('./process-daily-report-citations');
const reportAggregator = require('./processors/report-aggregator');
const visibilityScoreCalculator = require('./processors/visibility-score-calculator');
const citationShareCalculator = require('./processors/citation-share-calculator');
const shareOfVoiceCalculator = require('./processors/share-of-voice-calculator');
const competitorMetricsCalculator = require('./processors/competitor-metrics-calculator');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Process a daily report after all batches complete (or partial after Phase 1).
 * @param {string} dailyReportId - The daily report ID to process
 * @param {object} options
 * @param {number} options.phase - 1 = partial (6 prompts only), 2 = full (default)
 * @param {Array<string>} providers - Which providers to process (default: ['chatgpt'])
 */
async function processEndOfDay(dailyReportId, options = {}, providers = ['chatgpt']) {
  const phase = options.phase || 2;
  const isPartialRun = phase === 1;

  console.log('\n' + '='.repeat(70));
  console.log('🌙 END-OF-DAY PROCESSOR' + (isPartialRun ? ' [PHASE 1 — PARTIAL]' : ' [PHASE 2 — FULL]'));
  console.log('='.repeat(70));
  console.log('Daily Report ID: ' + dailyReportId);
  console.log('Phase: ' + phase + (isPartialRun ? ' (brand analysis + visibility score only)' : ' (full pipeline)'));
  console.log('Providers: ' + providers.join(', '));
  console.log('='.repeat(70) + '\n');

  const startTime = new Date();

  try {
    // Load the report
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

    // PHASE 1: BRAND ANALYSIS (always runs)
    console.log('\n🔍 PHASE 1: BRAND ANALYSIS');
    console.log('─'.repeat(70));
    const analysisResult = await brandAnalyzer.analyzeResults(dailyReportId, providers);
    console.log('✅ Phase 1 complete: analyzed=' + analysisResult.analyzed + ', mentioned=' + analysisResult.brandMentioned);

    // PHASE 2: CITATION PROCESSING (Phase 2 / full only)
    if (!isPartialRun) {
      console.log('\n🔗 PHASE 2: CITATION PROCESSING');
      console.log('─'.repeat(70));
      try {
        const citationResult = await citationProcessor.processDailyReportCitations(dailyReportId);
        console.log('✅ Phase 2 complete: citations=' + (citationResult.totalCitations || 0) + ', extracted=' + (citationResult.extracted || 0));
      } catch (citationError) {
        console.error('⚠️  Phase 2 failed (non-blocking):', citationError.message);
      }
    } else {
      console.log('\n⏭️  PHASE 2: CITATION PROCESSING — skipped (Phase 1 partial run)');
    }

    // PHASE 3: REPORT AGGREGATION (always runs)
    console.log('\n📊 PHASE 3: REPORT AGGREGATION');
    console.log('─'.repeat(70));
    const aggregateResult = await reportAggregator.updateAggregates(dailyReportId, providers);
    providers.forEach(provider => {
      if (aggregateResult[provider]) {
        const stats = aggregateResult[provider];
        console.log('✅ ' + provider + ': ' + stats.ok + '/' + stats.attempted + ' successful');
      }
    });

    // PHASE 4: VISIBILITY SCORE (always runs)
    console.log('\n📊 PHASE 4: VISIBILITY SCORE');
    console.log('─'.repeat(70));
    try {
      const scoreResult = await visibilityScoreCalculator.calculateVisibilityScore(dailyReportId);
      console.log('✅ Phase 4 complete: score=' + scoreResult.score.toFixed(1) + '/100');
    } catch (scoreError) {
      console.error('⚠️  Phase 4 failed (non-blocking):', scoreError.message);
    }

    // PHASE 5: SHARE OF VOICE (Phase 2 / full only)
    if (!isPartialRun) {
      console.log('\n📊 PHASE 5: SHARE OF VOICE');
      console.log('─'.repeat(70));
      try {
        const sovResult = await shareOfVoiceCalculator.calculateShareOfVoice(dailyReportId);
        console.log('✅ Phase 5 complete: entities=' + (sovResult.totalEntities || 0) + ', brandShare=' + (sovResult.brandShare || 0) + '%');
      } catch (sovError) {
        console.error('⚠️  Phase 5 failed (non-blocking):', sovError.message);
      }

      // PHASE 6: CITATION SHARE
      console.log('\n📊 PHASE 6: CITATION SHARE');
      console.log('─'.repeat(70));
      try {
        const citationShareResult = await citationShareCalculator.calculateCitationShare(dailyReportId);
        console.log('✅ Phase 6 complete: brandRank=#' + citationShareResult.brandRank + ', share=' + citationShareResult.brandShare + '%');
      } catch (citationShareError) {
        console.error('⚠️  Phase 6 failed (non-blocking):', citationShareError.message);
      }

      // PHASE 7: COMPETITOR METRICS
      console.log('\n📊 PHASE 7: COMPETITOR METRICS');
      console.log('─'.repeat(70));
      try {
        const compResult = await competitorMetricsCalculator.calculateCompetitorMetrics(dailyReportId);
        console.log('✅ Phase 7 complete: competitors=' + (compResult.competitorCount || 0));
      } catch (compError) {
        console.error('⚠️  Phase 7 failed (non-blocking):', compError.message);
      }
    } else {
      console.log('\n⏭️  PHASES 5-7: SOV/Citation Share/Competitor Metrics — skipped (Phase 1 partial run)');
    }

    // PHASE 8: FINALIZATION
    console.log('\n✅ PHASE 8: FINALIZATION');
    console.log('─'.repeat(70));

    if (!isPartialRun) {
      // Full run: mark as complete
      await supabase
        .from('daily_reports')
        .update({ status: 'completed', is_partial: false })
        .eq('id', dailyReportId);
      console.log('✅ Daily report marked as completed, is_partial=false');
    } else {
      // Partial run: keep status running, mark partial
      await supabase
        .from('daily_reports')
        .update({ is_partial: true })
        .eq('id', dailyReportId);
      console.log('✅ Daily report kept as running, is_partial=true (Phase 2 will complete it)');
    }

    const endTime = new Date();
    const totalTime = Math.round((endTime - startTime) / 1000);

    console.log('\n' + '='.repeat(70));
    console.log('🎉 END-OF-DAY PROCESSING COMPLETE (' + (isPartialRun ? 'PARTIAL' : 'FULL') + ')');
    console.log('='.repeat(70));
    console.log('Total time: ' + totalTime + 's');
    console.log('Brand mentions: ' + analysisResult.brandMentioned);
    console.log('='.repeat(70) + '\n');

    return { success: true, dailyReportId, analysisResult, aggregateResult, totalTime };

  } catch (error) {
    console.error('\n❌ END-OF-DAY PROCESSING FAILED');
    console.error('Error:', error.message);

    await supabase
      .from('daily_reports')
      .update({ status: 'failed' })
      .eq('id', dailyReportId);

    return { success: false, error: error.message };
  }
}

/**
 * Check if all batches are in a final state (no more processing needed)
 */
async function checkAllBatchesComplete(brandId, reportDate) {
  const { data: schedules, error } = await supabase
    .from('daily_schedules')
    .select('status')
    .eq('brand_id', brandId)
    .eq('schedule_date', reportDate);

  if (error || !schedules || schedules.length === 0) return false;

  const allDone = schedules.every(s => s.status === 'completed' || s.status === 'failed');
  const completed = schedules.filter(s => s.status === 'completed').length;
  const failed = schedules.filter(s => s.status === 'failed').length;
  const pending = schedules.filter(s => s.status === 'pending' || s.status === 'running').length;
  console.log('📊 Batch status: ' + completed + ' completed, ' + failed + ' failed, ' + pending + ' pending/running');
  return allDone;
}

/**
 * Auto-detect and process any daily reports that are ready
 */
async function autoProcessPendingReports() {
  console.log('🔍 Scanning for daily reports ready for end-of-day processing...\n');

  const { data: reports, error } = await supabase
    .from('daily_reports')
    .select('id, brand_id, report_date')
    .eq('status', 'running')
    .eq('is_partial', false)
    .order('report_date', { ascending: false })
    .limit(10);

  if (error || !reports || reports.length === 0) {
    console.log('No reports ready for processing.\n');
    return;
  }

  for (const report of reports) {
    const allComplete = await checkAllBatchesComplete(report.brand_id, report.report_date);
    if (allComplete) {
      console.log('✅ Report', report.id, 'ready — processing now...');
      const { data: results } = await supabase
        .from('prompt_results')
        .select('provider')
        .eq('daily_report_id', report.id)
        .limit(100);
      const providers = [...new Set((results || []).map(r => r.provider))];
      await processEndOfDay(report.id, { phase: 2 }, providers.length > 0 ? providers : ['chatgpt']);
    } else {
      console.log('⏳ Report', report.id, '- batches still running, skipping');
    }
  }
}

// CLI Interface
if (require.main === module) {
  const dailyReportId = process.argv[2];
  const phaseArg = process.argv[3]; // optional: --phase=1

  if (dailyReportId && dailyReportId !== '--auto') {
    const phase = phaseArg === '--phase=1' ? 1 : 2;
    processEndOfDay(dailyReportId, { phase })
      .then(result => process.exit(result.success ? 0 : 1))
      .catch(error => { console.error('Fatal error:', error); process.exit(1); });
  } else if (dailyReportId === '--auto') {
    autoProcessPendingReports()
      .then(() => { console.log('\n✅ Auto-processing complete\n'); process.exit(0); })
      .catch(error => { console.error('Fatal error:', error); process.exit(1); });
  } else {
    console.error('Usage:');
    console.error('  node end-of-day-processor.js <daily_report_id>');
    console.error('  node end-of-day-processor.js <daily_report_id> --phase=1');
    console.error('  node end-of-day-processor.js --auto');
    process.exit(1);
  }
}

module.exports = { processEndOfDay, autoProcessPendingReports };
