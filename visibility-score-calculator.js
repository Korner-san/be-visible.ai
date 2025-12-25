/**
 * Visibility Score Calculator
 *
 * Calculates a 0-100 visibility score for each daily report based on:
 * - Mention Rate (40%): How many responses mentioned the brand
 * - Competitive Position (30%): How early the brand appears vs competitors
 * - Mention Dominance (30%): Brand mentions vs total mentions
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Calculate visibility score for a daily report
 */
async function calculateVisibilityScore(dailyReportId) {
  console.log('\n' + '='.repeat(70));
  console.log('📊 VISIBILITY SCORE CALCULATOR');
  console.log('='.repeat(70));
  console.log('Daily Report ID: ' + dailyReportId);
  console.log('='.repeat(70) + '\n');

  try {
    // 1. Load all prompt results for this report
    console.log('📊 Loading prompt results...');
    const { data: results, error: resultsError } = await supabase
      .from('prompt_results')
      .select('id, brand_mentioned, brand_position, brand_mention_count, competitor_mention_details, provider_status')
      .eq('daily_report_id', dailyReportId)
      .in('provider_status', ['ok']);

    if (resultsError) {
      throw new Error('Failed to fetch results: ' + resultsError.message);
    }

    if (!results || results.length === 0) {
      console.log('⚠️  No results found for this report');
      await updateDailyReportScore(dailyReportId, 0, {
        totalResponses: 0,
        mentionedResponses: 0,
        message: 'No responses to analyze'
      });
      return { score: 0, details: 'No responses' };
    }

    console.log('✅ Found ' + results.length + ' results');

    // 2. Calculate metrics
    const totalResponses = results.length;
    const mentionedResponses = results.filter(r => r.brand_mentioned).length;
    const mentionRate = mentionedResponses / totalResponses;

    console.log('   Total responses: ' + totalResponses);
    console.log('   Brand mentioned: ' + mentionedResponses);
    console.log('   Mention rate: ' + (mentionRate * 100).toFixed(1) + '%');

    // 3. Calculate position score (how early brand appears vs competitors)
    let positionScore = 0;
    let positionsAnalyzed = 0;

    results.forEach(result => {
      if (!result.brand_mentioned || result.brand_position === null) return;

      const brandPos = result.brand_position;
      const competitorDetails = result.competitor_mention_details || [];

      if (competitorDetails.length === 0) {
        // Brand mentioned, no competitors = perfect position
        positionScore += 1;
        positionsAnalyzed++;
        return;
      }

      // Find earliest competitor position
      const competitorPositions = competitorDetails
        .map(c => c.position)
        .filter(p => p !== null && p !== -1);

      if (competitorPositions.length === 0) {
        positionScore += 1;
        positionsAnalyzed++;
        return;
      }

      const earliestCompetitor = Math.min(...competitorPositions);

      // Score: 1.0 if brand is first, decreases as brand position increases
      if (brandPos < earliestCompetitor) {
        positionScore += 1.0; // Brand appears first
      } else if (brandPos === earliestCompetitor) {
        positionScore += 0.7; // Tied for first
      } else {
        // Calculate relative position (max 0.5 even if much later)
        const relativePos = 1 / (1 + (brandPos - earliestCompetitor) / 100);
        positionScore += Math.max(0.3, relativePos * 0.5);
      }

      positionsAnalyzed++;
    });

    const avgPositionScore = positionsAnalyzed > 0 ? positionScore / positionsAnalyzed : 0;
    console.log('   Position score: ' + (avgPositionScore * 100).toFixed(1) + '%');

    // 4. Calculate mention dominance (brand mentions vs total mentions)
    const totalBrandMentions = results.reduce((sum, r) => sum + (r.brand_mention_count || 0), 0);

    let totalCompetitorMentions = 0;
    results.forEach(result => {
      const competitorDetails = result.competitor_mention_details || [];
      competitorDetails.forEach(comp => {
        totalCompetitorMentions += comp.count || 0;
      });
    });

    const totalMentions = totalBrandMentions + totalCompetitorMentions;
    const mentionDominance = totalMentions > 0 ? totalBrandMentions / totalMentions : 0;

    console.log('   Brand mentions: ' + totalBrandMentions);
    console.log('   Competitor mentions: ' + totalCompetitorMentions);
    console.log('   Mention dominance: ' + (mentionDominance * 100).toFixed(1) + '%');

    // 5. Calculate final score (0-100)
    const finalScore = (
      (mentionRate * 40) +           // 40% weight on mention rate
      (avgPositionScore * 30) +      // 30% weight on position
      (mentionDominance * 30)        // 30% weight on dominance
    );

    console.log('\n📊 FINAL VISIBILITY SCORE: ' + finalScore.toFixed(1) + '/100');

    // 6. Save score to daily_reports
    await updateDailyReportScore(dailyReportId, finalScore, {
      totalResponses,
      mentionedResponses,
      mentionRate: mentionRate * 100,
      positionScore: avgPositionScore * 100,
      mentionDominance: mentionDominance * 100,
      totalBrandMentions,
      totalCompetitorMentions
    });

    console.log('='.repeat(70) + '\n');

    return {
      score: finalScore,
      details: {
        totalResponses,
        mentionedResponses,
        mentionRate,
        avgPositionScore,
        mentionDominance
      }
    };

  } catch (error) {
    console.error('\n❌ Visibility score calculation failed:', error.message);
    throw error;
  }
}

/**
 * Update daily report with visibility score
 */
async function updateDailyReportScore(dailyReportId, score, details) {
  const { error } = await supabase
    .from('daily_reports')
    .update({
      visibility_score: score.toFixed(2)
    })
    .eq('id', dailyReportId);

  if (error) {
    console.error('   ❌ Failed to update visibility score:', error.message);
  } else {
    console.log('   ✅ Visibility score saved: ' + score.toFixed(1) + '/100');
  }
}

module.exports = {
  calculateVisibilityScore
};
