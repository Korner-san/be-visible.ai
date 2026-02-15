#!/usr/bin/env node
/**
 * Backfill Competitor Metrics
 *
 * Calculates competitor_metrics for recent daily reports.
 * Also re-runs citation share to pick up competitor domains.
 *
 * Usage:
 *   node backfill-competitor-metrics.js <brand_id> [days]
 *   node backfill-competitor-metrics.js b1a37d48-375f-477a-b838-38486e5e1c2d 14
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { calculateCompetitorMetrics } = require('./processors/competitor-metrics-calculator');
const { calculateCitationShare } = require('./processors/citation-share-calculator');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function backfill(brandId, days) {
  console.log('\n' + '='.repeat(70));
  console.log('📊 BACKFILL COMPETITOR METRICS');
  console.log('='.repeat(70));
  console.log('Brand ID: ' + brandId);
  console.log('Days: ' + days);
  console.log('='.repeat(70) + '\n');

  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - days);

  const { data: reports, error } = await supabase
    .from('daily_reports')
    .select('id, report_date')
    .eq('brand_id', brandId)
    .eq('status', 'completed')
    .gte('report_date', fromDate.toISOString().split('T')[0])
    .order('report_date', { ascending: true });

  if (error) {
    console.error('Error fetching reports:', error.message);
    process.exit(1);
  }

  if (!reports || reports.length === 0) {
    console.log('No reports found in the last ' + days + ' days.');
    return;
  }

  console.log('Found ' + reports.length + ' reports to process\n');

  let success = 0;
  let failed = 0;

  for (let i = 0; i < reports.length; i++) {
    const report = reports[i];
    console.log(`\n[${i + 1}/${reports.length}] Processing ${report.report_date} (${report.id})`);

    // Step 1: Re-run citation share (to pick up competitor domains)
    try {
      console.log('  Re-running citation share...');
      await calculateCitationShare(report.id);
    } catch (err) {
      console.log('  ⚠️  Citation share failed: ' + err.message);
    }

    // Step 2: Calculate competitor metrics
    try {
      const result = await calculateCompetitorMetrics(report.id);
      if (result.success) {
        success++;
        console.log(`  ✅ Done - ${result.competitorCount} competitors, brand vis=${result.brandVisibilityScore}%`);
      } else {
        failed++;
        console.log('  ⚠️  Skipped: ' + (result.message || result.error));
      }
    } catch (err) {
      failed++;
      console.error('  ❌ Error: ' + err.message);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('📊 BACKFILL COMPLETE');
  console.log('='.repeat(70));
  console.log('Total: ' + reports.length);
  console.log('Success: ' + success);
  console.log('Failed: ' + failed);
  console.log('='.repeat(70) + '\n');
}

const brandId = process.argv[2];
const days = parseInt(process.argv[3] || '14', 10);

if (!brandId) {
  console.error('Usage: node backfill-competitor-metrics.js <brand_id> [days]');
  process.exit(1);
}

backfill(brandId, days)
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
