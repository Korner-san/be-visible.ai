/**
 * Visibility Index Calculator
 *
 * Runs AFTER share-of-voice-calculator.js has saved share_of_voice_data.
 * Reads the enriched SOV entity data (which includes position_score_sum and total_responses)
 * and calculates a percentile-based Visibility Index for the brand.
 *
 * Formula per entity:
 *   mention_rate   = entity.mentions / total_responses          (0–1)
 *   position_impact = entity.position_score_sum / total_responses (0–1)
 *   raw_score       = 0.5 × mention_rate + 0.5 × position_impact (0–1)
 *
 * Visibility Index = percentile rank among all discovered entities
 *   percentile = (entities with lower raw_score / (N - 1)) × 100
 *   → 100 = brand has the highest raw score of all entities
 *   → 0   = brand has the lowest raw score
 *
 * Saves:
 *   daily_reports.visibility_score              → brand's Visibility Index (0–100)
 *   daily_reports.share_of_voice_data           → enriched with visibility fields per entity
 *     Each entity gains: mention_rate, position_impact, raw_score, visibility_index
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function calculateVisibilityIndex(dailyReportId) {
  console.log('\n' + '='.repeat(70));
  console.log('🏆 VISIBILITY INDEX CALCULATOR');
  console.log('='.repeat(70));
  console.log('Daily Report ID: ' + dailyReportId);

  // 1. Load combined SOV data
  const { data: report, error: reportError } = await supabase
    .from('daily_reports')
    .select('brand_id, share_of_voice_data')
    .eq('id', dailyReportId)
    .single();

  if (reportError || !report) {
    throw new Error('Daily report not found: ' + (reportError?.message || 'No data'));
  }

  const sovData = report.share_of_voice_data;

  if (!sovData || !sovData.entities || sovData.entities.length === 0) {
    console.log('⚠️  No SOV data found — visibility index cannot be calculated');
    return { success: false, reason: 'no_sov_data' };
  }

  const { entities, total_responses, total_mentions } = sovData;

  if (!total_responses || total_responses === 0) {
    console.log('⚠️  total_responses is 0 — SOV data may be from old format without position tracking');
    return { success: false, reason: 'no_total_responses' };
  }

  console.log('✅ SOV data loaded: ' + entities.length + ' entities, ' + total_responses + ' responses');

  // 2. Calculate raw scores for each entity
  const scoredEntities = entities.map(e => {
    const mentionRate = e.mentions / total_responses;           // 0–1
    const positionImpact = (e.position_score_sum || 0) / total_responses; // 0–1
    const rawScore = 0.5 * mentionRate + 0.5 * positionImpact; // 0–1

    return {
      ...e,
      mention_rate: parseFloat((mentionRate * 100).toFixed(2)),       // stored as %
      position_impact: parseFloat((positionImpact * 100).toFixed(2)), // stored as %
      raw_score: parseFloat((rawScore * 100).toFixed(4))              // stored as %
    };
  });

  // 3. Calculate percentile rank for each entity
  const N = scoredEntities.length;
  const withIndex = scoredEntities.map(entity => {
    const lowerCount = scoredEntities.filter(e => e.raw_score < entity.raw_score).length;
    // If only 1 entity, it gets 100 by default
    const percentile = N > 1 ? parseFloat(((lowerCount / (N - 1)) * 100).toFixed(2)) : 100;
    return { ...entity, visibility_index: percentile };
  });

  // 4. Log all entity scores
  withIndex.forEach(e => {
    console.log(
      '  [' + e.type + '] ' + e.name +
      ' — mention_rate=' + e.mention_rate + '%' +
      ', pos_impact=' + e.position_impact + '%' +
      ', raw=' + e.raw_score + '%' +
      ', index=' + e.visibility_index
    );
  });

  // 5. Find brand entity
  const brandEntity = withIndex.find(e => e.type === 'brand');

  if (!brandEntity) {
    console.log('⚠️  Brand entity not found in SOV data');
    return { success: false, reason: 'brand_not_in_sov' };
  }

  const brandIndex = brandEntity.visibility_index;
  console.log('\n🏆 Brand Visibility Index: ' + brandIndex + ' / 100');
  console.log('   (percentile rank among ' + N + ' discovered entities)');

  // 6. Build enriched SOV data (keep all existing fields, add visibility fields to each entity)
  const enrichedSovData = {
    ...sovData,
    entities: withIndex.map(e => ({
      name: e.name,
      mentions: e.mentions,
      type: e.type,
      position_score_sum: e.position_score_sum || 0,
      mention_rate: e.mention_rate,
      position_impact: e.position_impact,
      raw_score: e.raw_score,
      visibility_index: e.visibility_index
    }))
  };

  // 7. Save visibility score + enriched SOV data
  const { error: saveErr } = await supabase
    .from('daily_reports')
    .update({
      visibility_score: brandIndex,
      share_of_voice_data: enrichedSovData
    })
    .eq('id', dailyReportId);

  if (saveErr) {
    throw new Error('Failed to save visibility index: ' + saveErr.message);
  }

  console.log('✅ Visibility index saved: ' + brandIndex + '/100');
  console.log('✅ SOV data enriched with visibility fields');
  console.log('='.repeat(70) + '\n');

  return {
    success: true,
    brandIndex,
    entityCount: N,
    brandMentionRate: brandEntity.mention_rate,
    brandPositionImpact: brandEntity.position_impact
  };
}

module.exports = { calculateVisibilityIndex };
