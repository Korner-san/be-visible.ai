#!/usr/bin/env node
/**
 * Backfill Share of Voice
 *
 * One-time script to calculate share_of_voice_data for ALL existing
 * completed daily reports that don't have it yet.
 *
 * Usage:
 *   node backfill-share-of-voice.js              # All brands
 *   node backfill-share-of-voice.js <brand_id>   # Specific brand
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { calculateShareOfVoice } = require('./processors/share-of-voice-calculator');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function backfill(brandId) {
  console.log('\n' + '='.repeat(70));
  console.log('📊 BACKFILL SHARE OF VOICE');
  console.log('='.repeat(70));
  if (brandId) {
    console.log('Brand ID: ' + brandId);
  } else {
    console.log('Scope: ALL brands');
  }
  console.log('='.repeat(70) + '\n');

  // Find completed daily reports without share_of_voice_data
  let query = supabase
    .from('daily_reports')
    .select('id, brand_id, report_date')
    .eq('status', 'completed')
    .is('share_of_voice_data', null)
    .order('report_date', { ascending: true });

  if (brandId) {
    query = query.eq('brand_id', brandId);
  }

  const { data: reports, error } = await query;

  if (error) {
    console.error('❌ Error fetching reports:', error.message);
    process.exit(1);
  }

  if (!reports || reports.length === 0) {
    console.log('✅ No reports need backfilling. All up to date!');
    return;
  }

  console.log('📋 Found ' + reports.length + ' reports to backfill\n');

  let success = 0;
  let failed = 0;

  for (let i = 0; i < reports.length; i++) {
    const report = reports[i];
    console.log(`\n[${i + 1}/${reports.length}] Processing report ${report.id} (${report.report_date})`);

    try {
      const result = await calculateShareOfVoice(report.id);

      if (result.success) {
        success++;
        console.log(`   ✅ Done - ${result.totalEntities || 0} entities, brand share: ${result.brandShare || 0}%`);
      } else {
        failed++;
        console.log('   ⚠️  Skipped: ' + (result.message || result.error || 'Unknown'));
      }
    } catch (err) {
      failed++;
      console.error('   ❌ Error:', err.message);
    }

    // Small delay to avoid rate limiting GPT-4o-mini
    if (i < reports.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('📊 BACKFILL COMPLETE');
  console.log('='.repeat(70));
  console.log('Total reports: ' + reports.length);
  console.log('Success: ' + success);
  console.log('Failed/Skipped: ' + failed);
  console.log('='.repeat(70) + '\n');
}

// CLI
const brandId = process.argv[2];

backfill(brandId)
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
