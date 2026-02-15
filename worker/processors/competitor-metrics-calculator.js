/**
 * Competitor Metrics Calculator
 *
 * For each daily report, scans all AI responses for competitor mentions
 * and calculates per-competitor:
 * - visibility_score: % of responses mentioning the competitor (0-100)
 * - mention_rate: same as visibility_score (% mentioned)
 * - mention_count: number of responses mentioning the competitor
 * - Also pulls citation_share from citation_share_stats if available
 * - Also pulls share_of_voice from share_of_voice_data if available
 *
 * Stores result in daily_reports.competitor_metrics jsonb
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Check if a competitor name appears in the response text (case-insensitive)
 */
function isCompetitorMentioned(responseText, competitorName) {
  if (!responseText || !competitorName) return false;
  const lower = responseText.toLowerCase();
  const compLower = competitorName.toLowerCase();

  // Direct match
  if (lower.includes(compLower)) return true;

  // Common variants
  const variants = [];
  if (compLower === 'gitlab ci') {
    variants.push('gitlab ci/cd', 'gitlab-ci', 'gitlab ci');
  } else if (compLower === 'travis ci') {
    variants.push('travis-ci', 'travisci');
  } else if (compLower === 'circleci') {
    variants.push('circle ci', 'circle-ci');
  } else if (compLower === 'jenkins') {
    variants.push('jenkins ci', 'jenkins pipeline');
  }

  return variants.some(v => lower.includes(v));
}

/**
 * Calculate competitor metrics for a daily report
 */
async function calculateCompetitorMetrics(dailyReportId) {
  console.log('\n' + '='.repeat(70));
  console.log('📊 COMPETITOR METRICS CALCULATOR');
  console.log('='.repeat(70));
  console.log('Daily Report ID: ' + dailyReportId);
  console.log('='.repeat(70) + '\n');

  try {
    // 1. Load daily report
    const { data: report, error: reportError } = await supabase
      .from('daily_reports')
      .select('id, brand_id, report_date, share_of_voice_data')
      .eq('id', dailyReportId)
      .single();

    if (reportError || !report) {
      throw new Error('Failed to fetch daily report: ' + (reportError?.message || 'Not found'));
    }

    console.log('✅ Report: ' + report.report_date);

    // 2. Load brand info
    const { data: brand } = await supabase
      .from('brands')
      .select('id, name')
      .eq('id', report.brand_id)
      .single();

    console.log('✅ Brand: ' + (brand ? brand.name : 'Unknown'));

    // 3. Load competitors
    const { data: competitors, error: compError } = await supabase
      .from('brand_competitors')
      .select('id, competitor_name, competitor_domain')
      .eq('brand_id', report.brand_id)
      .eq('is_active', true);

    if (compError || !competitors || competitors.length === 0) {
      console.log('⚠️  No active competitors found');
      return { success: true, message: 'No competitors', competitorCount: 0 };
    }

    console.log('✅ Competitors: ' + competitors.map(c => c.competitor_name).join(', '));

    // 4. Load all prompt results with responses
    const { data: promptResults, error: prError } = await supabase
      .from('prompt_results')
      .select('id, chatgpt_response, brand_mentioned')
      .eq('daily_report_id', dailyReportId)
      .not('chatgpt_response', 'is', null);

    if (prError) {
      throw new Error('Failed to fetch prompt results: ' + prError.message);
    }

    const responses = (promptResults || []).filter(pr => pr.chatgpt_response && pr.chatgpt_response.trim().length > 0);
    const totalResponses = responses.length;

    console.log('✅ Found ' + totalResponses + ' responses to scan');

    if (totalResponses === 0) {
      const emptyMetrics = {
        competitors: competitors.map(c => ({
          name: c.competitor_name,
          competitor_id: c.id,
          visibility_score: 0,
          mention_rate: 0,
          mention_count: 0,
          total_responses: 0,
          citation_share: null,
          share_of_voice: null
        })),
        brand_visibility_score: 0,
        brand_mention_count: 0,
        total_responses: 0,
        calculated_at: new Date().toISOString()
      };

      await supabase
        .from('daily_reports')
        .update({ competitor_metrics: emptyMetrics })
        .eq('id', dailyReportId);

      return { success: true, message: 'No responses', competitorCount: competitors.length };
    }

    // 5. Scan each response for each competitor
    const competitorMentions = {};
    for (const comp of competitors) {
      competitorMentions[comp.id] = { mentioned: 0, total: totalResponses };
    }

    let brandMentionCount = 0;

    for (const pr of responses) {
      if (pr.brand_mentioned) brandMentionCount++;

      for (const comp of competitors) {
        if (isCompetitorMentioned(pr.chatgpt_response, comp.competitor_name)) {
          competitorMentions[comp.id].mentioned++;
        }
      }
    }

    // 6. Get citation share data if available
    const citationShareMap = {};
    const { data: citationStats } = await supabase
      .from('citation_share_stats')
      .select('competitor_id, citation_share')
      .eq('daily_report_id', dailyReportId)
      .eq('domain_type', 'competitor');

    if (citationStats) {
      for (const cs of citationStats) {
        if (cs.competitor_id) {
          citationShareMap[cs.competitor_id] = parseFloat(cs.citation_share) || 0;
        }
      }
    }

    // Get brand citation share
    const { data: brandCitationStats } = await supabase
      .from('citation_share_stats')
      .select('citation_share')
      .eq('daily_report_id', dailyReportId)
      .eq('domain_type', 'brand')
      .limit(1);

    const brandCitationShare = brandCitationStats && brandCitationStats[0]
      ? parseFloat(brandCitationStats[0].citation_share) || 0
      : null;

    // 7. Get share of voice data if available
    const sovData = report.share_of_voice_data;
    const sovMap = {};
    if (sovData && sovData.entities && sovData.total_mentions > 0) {
      for (const entity of sovData.entities) {
        sovMap[entity.name.toLowerCase()] = parseFloat(((entity.mentions / sovData.total_mentions) * 100).toFixed(1));
      }
    }

    // 8. Build metrics
    const brandVisScore = totalResponses > 0
      ? parseFloat(((brandMentionCount / totalResponses) * 100).toFixed(1))
      : 0;

    const brandSovPct = brand
      ? (sovMap[brand.name.toLowerCase()] || null)
      : null;

    const competitorMetrics = competitors.map(comp => {
      const mentions = competitorMentions[comp.id];
      const visScore = mentions.total > 0
        ? parseFloat(((mentions.mentioned / mentions.total) * 100).toFixed(1))
        : 0;

      const compSov = sovMap[comp.competitor_name.toLowerCase()] || null;
      const compCitation = citationShareMap[comp.id] || null;

      return {
        name: comp.competitor_name,
        competitor_id: comp.id,
        visibility_score: visScore,
        mention_rate: visScore,
        mention_count: mentions.mentioned,
        total_responses: mentions.total,
        citation_share: compCitation,
        share_of_voice: compSov
      };
    });

    const metricsData = {
      competitors: competitorMetrics,
      brand_visibility_score: brandVisScore,
      brand_mention_count: brandMentionCount,
      brand_mention_rate: brandVisScore,
      brand_citation_share: brandCitationShare,
      brand_share_of_voice: brandSovPct,
      total_responses: totalResponses,
      calculated_at: new Date().toISOString()
    };

    // 9. Save
    console.log('\n💾 Saving competitor metrics...');
    const { error: updateError } = await supabase
      .from('daily_reports')
      .update({ competitor_metrics: metricsData })
      .eq('id', dailyReportId);

    if (updateError) {
      throw new Error('Failed to save competitor metrics: ' + updateError.message);
    }

    // 10. Summary
    console.log('\n' + '='.repeat(70));
    console.log('📊 COMPETITOR METRICS SUMMARY');
    console.log('='.repeat(70));
    console.log('Brand (' + (brand ? brand.name : '?') + '): vis=' + brandVisScore + '%, mentions=' + brandMentionCount + '/' + totalResponses);
    competitorMetrics.forEach(cm => {
      console.log('  ' + cm.name + ': vis=' + cm.visibility_score + '%, mentions=' + cm.mention_count + '/' + cm.total_responses +
        (cm.citation_share !== null ? ', citation=' + cm.citation_share + '%' : '') +
        (cm.share_of_voice !== null ? ', sov=' + cm.share_of_voice + '%' : ''));
    });
    console.log('='.repeat(70) + '\n');

    return {
      success: true,
      competitorCount: competitorMetrics.length,
      brandVisibilityScore: brandVisScore,
      totalResponses
    };

  } catch (error) {
    console.error('\n❌ COMPETITOR METRICS CALCULATION FAILED');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  calculateCompetitorMetrics
};
