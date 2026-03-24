#!/usr/bin/env node
/**
 * backfill-competitor-by-provider.js
 *
 * For all daily_reports that have competitor_metrics but no by_provider field,
 * synthesize by_provider.chatgpt from the existing combined data.
 *
 * Historical reports were ChatGPT-only, so combined data === chatgpt data.
 *
 * Usage:
 *   node backfill-competitor-by-provider.js
 *   node backfill-competitor-by-provider.js --dry-run   (preview without writing)
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('📊 BACKFILL competitor_metrics.by_provider (chatgpt)');
  if (DRY_RUN) console.log('⚠️  DRY RUN — no writes');
  console.log('='.repeat(70) + '\n');

  // Fetch all completed reports with competitor_metrics but no by_provider
  // We use .not('competitor_metrics', 'is', null) then filter client-side
  let offset = 0;
  const PAGE = 200;
  let totalFound = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;

  while (true) {
    const { data: reports, error } = await supabase
      .from('daily_reports')
      .select('id, report_date, brand_id, competitor_metrics')
      .eq('status', 'completed')
      .not('competitor_metrics', 'is', null)
      .order('report_date', { ascending: true })
      .range(offset, offset + PAGE - 1);

    if (error) {
      console.error('Failed to fetch reports:', error.message);
      process.exit(1);
    }

    if (!reports || reports.length === 0) break;

    for (const report of reports) {
      const cm = report.competitor_metrics;

      // Skip if by_provider already exists
      if (cm && cm.by_provider) {
        totalSkipped++;
        continue;
      }

      totalFound++;

      if (!cm || !cm.competitors) {
        console.log(`  ⚠️  ${report.report_date} (${report.id.substring(0, 8)}) — no competitors array, skipping`);
        continue;
      }

      // Build by_provider.chatgpt from combined data
      // Historical reports were 100% ChatGPT — combined === chatgpt
      const chatgptSlice = {
        brand_visibility_score: cm.brand_visibility_score ?? 0,
        brand_mention_count: cm.brand_mention_count ?? 0,
        total_responses: cm.total_responses ?? 0,
        competitors: (cm.competitors || []).map(c => ({
          name: c.name,
          competitor_id: c.competitor_id,
          visibility_score: c.visibility_score ?? 0,
          mention_rate: c.mention_rate ?? c.visibility_score ?? 0,
          mention_count: c.mention_count ?? 0,
          total_responses: c.total_responses ?? cm.total_responses ?? 0,
        })),
      };

      const updatedMetrics = {
        ...cm,
        by_provider: {
          chatgpt: chatgptSlice,
        },
      };

      if (DRY_RUN) {
        console.log(`  🔍 ${report.report_date} (${report.id.substring(0, 8)}) — would add by_provider.chatgpt (${chatgptSlice.total_responses} responses, ${chatgptSlice.competitors.length} competitors)`);
        totalUpdated++;
        continue;
      }

      const { error: updateError } = await supabase
        .from('daily_reports')
        .update({ competitor_metrics: updatedMetrics })
        .eq('id', report.id);

      if (updateError) {
        console.error(`  ❌ ${report.report_date} — update failed: ${updateError.message}`);
      } else {
        console.log(`  ✅ ${report.report_date} (${report.id.substring(0, 8)}) — by_provider.chatgpt added (${chatgptSlice.total_responses} responses)`);
        totalUpdated++;
      }
    }

    offset += PAGE;
    if (reports.length < PAGE) break;
  }

  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));
  console.log(`Already had by_provider (skipped): ${totalSkipped}`);
  console.log(`Missing by_provider (found):       ${totalFound}`);
  console.log(`${DRY_RUN ? 'Would update' : 'Updated'}:                    ${totalUpdated}`);
  console.log('='.repeat(70) + '\n');
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
