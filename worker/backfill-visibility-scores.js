/**
 * Backfill Visibility Scores — last 7 days
 *
 * For each completed daily_report in the last 7 days (all brands):
 *   1. Re-run brand analysis (brand-analyzer) — updates brand_position + competitor entity_rank
 *   2. Re-run visibility score calculator — writes daily_reports.visibility_score + visibility_score_by_provider
 *   3. Re-run competitor metrics calculator — writes daily_reports.competitor_metrics with 40/30/30 formula
 *
 * Usage:
 *   cd /root/be-visible.ai/worker
 *   node backfill-visibility-scores.js
 *
 * Safe to re-run. All writes are upserts/updates.
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { analyzeResults } = require('./brand-analyzer');
const { calculateVisibilityScore } = require('./processors/visibility-score-calculator');
const { calculateCompetitorMetrics } = require('./processors/competitor-metrics-calculator');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('🔁 BACKFILL VISIBILITY SCORES — LAST 7 DAYS');
  console.log('='.repeat(70));

  // Compute cutoff: 7 days ago
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  const cutoffStr = cutoff.toISOString().split('T')[0];
  console.log('Cutoff date: ' + cutoffStr);

  // Load all completed reports in the last 7 days
  const { data: reports, error } = await supabase
    .from('daily_reports')
    .select('id, brand_id, report_date')
    .eq('status', 'completed')
    .gte('report_date', cutoffStr)
    .order('report_date', { ascending: true });

  if (error) {
    console.error('❌ Failed to fetch reports:', error.message);
    process.exit(1);
  }

  if (!reports || reports.length === 0) {
    console.log('⚠️  No completed reports found in the last 7 days.');
    process.exit(0);
  }

  console.log(`✅ Found ${reports.length} reports to backfill\n`);

  let success = 0;
  let failed = 0;

  for (const report of reports) {
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`📅 Report: ${report.report_date} | ID: ${report.id}`);
    console.log(`${'─'.repeat(70)}`);

    try {
      // Phase 1: Re-run brand analysis (updates brand_position + competitor entity_rank)
      console.log('\n[1/3] Re-running brand analysis...');
      await analyzeResults(report.id);

      // Phase 2: Re-run visibility score (40/30/30 using updated brand_position)
      console.log('\n[2/3] Re-running visibility score calculator...');
      await calculateVisibilityScore(report.id);

      // Phase 3: Re-run competitor metrics (40/30/30 using updated entity_rank)
      console.log('\n[3/3] Re-running competitor metrics calculator...');
      await calculateCompetitorMetrics(report.id);

      console.log(`\n✅ Report ${report.report_date} backfilled successfully`);
      success++;
    } catch (err) {
      console.error(`\n❌ Report ${report.report_date} FAILED:`, err.message);
      failed++;
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('📊 BACKFILL COMPLETE');
  console.log('='.repeat(70));
  console.log(`Total: ${reports.length} | Success: ${success} | Failed: ${failed}`);
  console.log('='.repeat(70) + '\n');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
