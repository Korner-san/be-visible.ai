/**
 * Competitor Metrics Calculator
 *
 * Formula (same as brand): visibilityScore = (mentionRate × 0.4) + (positionScore × 0.3) + (citationShare × 0.3)
 *   mentionRate    = mentioned ? 100 : 0
 *   positionScore  = mentioned && entity_rank != null ? max(0, 100 - (entity_rank-1)×10) : 0
 *   citationShare  = totalCits > 0 ? (compCits / totalCits × 100) : 0
 *
 * entity_rank is read from competitor_mention_details[].entity_rank (set by brand-analyzer.js)
 * compCits counts citations matching the competitor's domain
 *
 * Stores result in daily_reports.competitor_metrics jsonb
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

function positionScore(pos) {
  if (pos == null) return 0;
  return Math.max(0, 100 - (pos - 1) * 10);
}

function computeVisScore(mentioned, entityRank, compCits, totalCits) {
  const m = mentioned ? 100 : 0;
  const p = mentioned ? positionScore(entityRank) : 0;
  const c = totalCits > 0 ? (compCits / totalCits) * 100 : 0;
  return (m * 0.4) + (p * 0.3) + (c * 0.3);
}

function avg(arr) {
  return arr.length ? parseFloat((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1)) : 0;
}

function stripDomain(url) {
  return (url || '').replace(/^https?:\/\/(www\.)?/, '').split('/')[0].toLowerCase();
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

    // 2. Load brand info + domain
    const { data: brand } = await supabase
      .from('brands')
      .select('id, name, domain')
      .eq('id', report.brand_id)
      .single();

    console.log('✅ Brand: ' + (brand ? brand.name : 'Unknown'));

    const brandDomain = stripDomain(brand?.domain || '');

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

    // Pre-build competitor domain map
    const compDomainMap = {};
    for (const comp of competitors) {
      compDomainMap[comp.id] = stripDomain(comp.competitor_domain || '');
    }

    // 4. Load all ok prompt results with position + competitor details + citations
    const { data: promptResults, error: prError } = await supabase
      .from('prompt_results')
      .select('id, provider, brand_mentioned, brand_position, competitor_mention_details, chatgpt_citations')
      .eq('daily_report_id', dailyReportId)
      .eq('provider_status', 'ok');

    if (prError) {
      throw new Error('Failed to fetch prompt results: ' + prError.message);
    }

    const allResults = promptResults || [];
    const totalResponses = allResults.length;

    console.log('✅ Found ' + totalResponses + ' ok results to scan (across all providers)');

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

    // 5. Accumulate per-run 40/30/30 scores for brand + each competitor
    const brandScores = [];
    const competitorScores = {};
    for (const comp of competitors) competitorScores[comp.id] = [];

    for (const pr of allResults) {
      const citations = Array.isArray(pr.chatgpt_citations) ? pr.chatgpt_citations : [];
      const totalCits = citations.length;

      // Brand
      const brandCits = brandDomain
        ? citations.filter(u => (u || '').toLowerCase().includes(brandDomain)).length
        : 0;
      brandScores.push(computeVisScore(pr.brand_mentioned, pr.brand_position, brandCits, totalCits));

      // Competitors
      const compDetails = Array.isArray(pr.competitor_mention_details) ? pr.competitor_mention_details : [];
      for (const comp of competitors) {
        const detail = compDetails.find(d =>
          d.name && d.name.toLowerCase() === comp.competitor_name.toLowerCase()
        );
        const mentioned = detail ? detail.count > 0 : false;
        const entityRank = detail?.entity_rank ?? null;
        const compDomain = compDomainMap[comp.id];
        const compCits = compDomain
          ? citations.filter(u => (u || '').toLowerCase().includes(compDomain)).length
          : 0;
        competitorScores[comp.id].push(computeVisScore(mentioned, entityRank, compCits, totalCits));
      }
    }

    // 5b. Per-provider breakdown using same 40/30/30
    const PROVIDERS = ['chatgpt', 'google_ai_overview', 'claude'];
    const byProvider = {};

    for (const provider of PROVIDERS) {
      const provResults = allResults.filter(pr => pr.provider === provider);
      if (provResults.length === 0) continue;

      const brandProvScores = [];
      const compProvScores = {};
      for (const comp of competitors) compProvScores[comp.id] = [];

      for (const pr of provResults) {
        const citations = Array.isArray(pr.chatgpt_citations) ? pr.chatgpt_citations : [];
        const totalCits = citations.length;

        const brandCits = brandDomain
          ? citations.filter(u => (u || '').toLowerCase().includes(brandDomain)).length : 0;
        brandProvScores.push(computeVisScore(pr.brand_mentioned, pr.brand_position, brandCits, totalCits));

        const compDetails = Array.isArray(pr.competitor_mention_details) ? pr.competitor_mention_details : [];
        for (const comp of competitors) {
          const detail = compDetails.find(d =>
            d.name && d.name.toLowerCase() === comp.competitor_name.toLowerCase()
          );
          const mentioned = detail ? detail.count > 0 : false;
          const entityRank = detail?.entity_rank ?? null;
          const compDomain = compDomainMap[comp.id];
          const compCits = compDomain
            ? citations.filter(u => (u || '').toLowerCase().includes(compDomain)).length : 0;
          compProvScores[comp.id].push(computeVisScore(mentioned, entityRank, compCits, totalCits));
        }
      }

      byProvider[provider] = {
        brand_visibility_score: avg(brandProvScores),
        brand_mention_count: provResults.filter(r => r.brand_mentioned).length,
        total_responses: provResults.length,
        competitors: competitors.map(comp => {
          const compDetails = (pr) => Array.isArray(pr.competitor_mention_details) ? pr.competitor_mention_details : [];
          const mentionCount = provResults.filter(r =>
            compDetails(r).some(d => d.name?.toLowerCase() === comp.competitor_name.toLowerCase() && d.count > 0)
          ).length;
          return {
            name: comp.competitor_name,
            competitor_id: comp.id,
            visibility_score: avg(compProvScores[comp.id]),
            mention_count: mentionCount,
            total_responses: provResults.length,
          };
        }),
      };
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

    // 8. Build final metrics
    const brandVisScore = avg(brandScores);
    const brandMentionCount = allResults.filter(r => r.brand_mentioned).length;
    const brandMentionRate = totalResponses > 0
      ? parseFloat(((brandMentionCount / totalResponses) * 100).toFixed(1)) : 0;
    const brandSovPct = brand ? (sovMap[brand.name.toLowerCase()] || null) : null;

    const competitorMetrics = competitors.map(comp => {
      const visScore = avg(competitorScores[comp.id]);
      const mentionCount = allResults.filter(r => {
        const cd = Array.isArray(r.competitor_mention_details) ? r.competitor_mention_details : [];
        return cd.some(d => d.name?.toLowerCase() === comp.competitor_name.toLowerCase() && d.count > 0);
      }).length;
      const mentionRate = totalResponses > 0
        ? parseFloat(((mentionCount / totalResponses) * 100).toFixed(1)) : 0;

      return {
        name: comp.competitor_name,
        competitor_id: comp.id,
        visibility_score: visScore,
        mention_rate: mentionRate,
        mention_count: mentionCount,
        total_responses: totalResponses,
        citation_share: citationShareMap[comp.id] || null,
        share_of_voice: sovMap[comp.competitor_name.toLowerCase()] || null
      };
    });

    const metricsData = {
      competitors: competitorMetrics,
      brand_visibility_score: brandVisScore,
      brand_mention_count: brandMentionCount,
      brand_mention_rate: brandMentionRate,
      brand_citation_share: brandCitationShare,
      brand_share_of_voice: brandSovPct,
      total_responses: totalResponses,
      by_provider: byProvider,
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
    console.log('Brand (' + (brand ? brand.name : '?') + '): vis=' + brandVisScore + ' (mention=' + brandMentionRate + '%)');
    competitorMetrics.forEach(cm => {
      console.log('  ' + cm.name + ': vis=' + cm.visibility_score + ' (mention=' + cm.mention_rate + '%)' +
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
