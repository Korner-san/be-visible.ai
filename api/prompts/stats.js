/**
 * Vercel Serverless Function: /api/prompts/stats
 *
 * Returns per-prompt stats for the Prompts page:
 *   - visibilityScore      : visibility index (0-100), relative mention rate + position impact
 *   - avgPosition          : avg numbered-list position of brand in response (1 decimal)
 *   - citationShare        : brand domain citations / total citations % (same as CitationShareChart)
 *   - citations            : total citation URLs across all runs
 *   - lastRun              : most recent report_date this prompt ran
 *   - history              : visibility per day for chart
 *   - recentResults        : last 5 prompt_results rows
 *   - citationDomains      : per-domain stats (uniqueUrls, mentions, pctTotal, coverage)
 *   - contentTypeBreakdown : content type distribution (single-prompt only)
 *
 * Visibility Index formula (per prompt):
 *   mention_rate = brand_mentions / total_runs
 *   relative_mention_score = min(1, mention_rate / avg_entity_mention_rate)
 *     where avg_entity_mention_rate comes from per_prompt_entity_stats (SOV calculator)
 *     falls back to raw mention_rate if no entity stats available
 *   position_impact = avg of (avgN - K) / avgN across mentioned runs only
 *   visibilityScore = round((0.5 * relative_mention_score + 0.5 * position_impact) * 100)
 */

const { createClient } = require('@supabase/supabase-js');

const allowedOrigins = [
  process.env.ALLOWED_ORIGIN,
  'http://localhost:5173',
  'http://localhost:3000',
].filter(Boolean);

function setCorsHeaders(req, res) {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin) || !origin) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}


module.exports = async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const { brandId, days: daysParam, promptId, models: modelsParam, from: fromParam, to: toParam } = req.query;
  if (!brandId) return res.status(400).json({ success: false, error: 'Missing brandId' });

  const days = parseInt(daysParam) || 30;
  let cutoffStr, toStr;
  if (fromParam && toParam) {
    cutoffStr = fromParam;
    toStr = toParam;
  } else {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    cutoffStr = cutoffDate.toISOString().split('T')[0];
    toStr = new Date().toISOString().split('T')[0];
  }

  const ALL_MODELS = ['chatgpt', 'google_ai_overview', 'claude'];
  const selectedModels = modelsParam
    ? modelsParam.split(',').filter(m => ALL_MODELS.includes(m))
    : ALL_MODELS;
  if (selectedModels.length === 0) selectedModels.push(...ALL_MODELS);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // 1. Get brand name + domain
  const { data: brand } = await supabase
    .from('brands')
    .select('id, name, domain')
    .eq('id', brandId)
    .single();

  if (!brand) return res.status(404).json({ success: false, error: 'Brand not found' });

  const brandNameLower = brand.name.toLowerCase();
  const brandDomain = (brand.domain || '')
    .replace(/^https?:\/\/(www\.)?/, '')
    .split('/')[0]
    .toLowerCase();

  // 2. Get completed reports within date range
  const { data: reports } = await supabase
    .from('daily_reports')
    .select('id, report_date, share_of_voice_data, per_prompt_entity_stats')
    .eq('brand_id', brandId)
    .eq('status', 'completed')
    .gte('report_date', cutoffStr)
    .lte('report_date', toStr)
    .order('report_date', { ascending: false })
    .limit(90);

  if (!reports || reports.length === 0) {
    return res.status(200).json({ success: true, stats: {} });
  }

  const reportIds = reports.map(r => r.id);
  const reportDateMap = Object.fromEntries(reports.map(r => [r.id, r.report_date]));

  // avgN = average entities per response from most recent SOV data (used for position scoring)
  let avgN = 8;
  for (const r of reports) {
    const sov = r.share_of_voice_data;
    if (sov && sov.total_mentions > 0 && sov.total_responses > 0) {
      avgN = sov.total_mentions / sov.total_responses;
      break;
    }
  }

  // per-prompt entity stats: avg entity mention rate per prompt (for relative mention scoring)
  // Use most recent report that has this data
  const promptEntityStats = {};
  for (const r of reports) {
    if (r.per_prompt_entity_stats && Object.keys(r.per_prompt_entity_stats).length > 0) {
      Object.assign(promptEntityStats, r.per_prompt_entity_stats);
      break;
    }
  }

  // 3. Fetch prompt_results
  let resultsQuery = supabase
    .from('prompt_results')
    .select('id, brand_prompt_id, daily_report_id, provider, chatgpt_response, google_ai_overview_response, claude_response, chatgpt_citations, brand_mentioned, brand_position, brand_mention_count, prompt_text, created_at')
    .in('daily_report_id', reportIds)
    .in('provider', selectedModels)
    .eq('provider_status', 'ok')
    .order('created_at', { ascending: false });

  if (promptId) resultsQuery = resultsQuery.eq('brand_prompt_id', promptId);

  const { data: results } = await resultsQuery;

  if (!results || results.length === 0) {
    return res.status(200).json({ success: true, stats: {} });
  }

  // 4. Group by brand_prompt_id
  const grouped = {};

  for (const row of results) {
    const pid = row.brand_prompt_id;
    if (!pid) continue;

    if (!grouped[pid]) {
      grouped[pid] = { runs: [], recentResults: [] };
    }

    const responseText = row.provider === 'google_ai_overview' ? (row.google_ai_overview_response || '')
      : row.provider === 'claude' ? (row.claude_response || '')
      : (row.chatgpt_response || '');

    const mentioned = row.brand_mentioned != null
      ? row.brand_mentioned
      : responseText.toLowerCase().includes(brandNameLower);

    const citations = Array.isArray(row.chatgpt_citations) ? row.chatgpt_citations : [];
    const citationCount = citations.length;
    const brandCitationCount = brandDomain
      ? citations.filter(url => (url || '').toLowerCase().includes(brandDomain)).length
      : 0;

    const position = (mentioned && row.brand_position != null) ? row.brand_position : null;
    const reportDate = reportDateMap[row.daily_report_id] || '';
    const mentionCount = row.brand_mention_count || 0;

    grouped[pid].runs.push({ mentioned, citationCount, brandCitationCount, position, reportDate, mentionCount });

    if (grouped[pid].recentResults.length < 15) {
      grouped[pid].recentResults.push({
        id: row.id,
        promptText: row.prompt_text || '',
        response: responseText,
        mentioned,
        citationCount,
        citations,
        date: reportDate,
        provider: row.provider,
        position,
      });
    }
  }

  // 5. Build per-prompt stats
  const stats = {};

  for (const [pid, data] of Object.entries(grouped)) {
    const { runs, recentResults } = data;
    const total = runs.length;
    const mentionedCount = runs.filter(r => r.mentioned).length;
    const mentionRate = total > 0 ? mentionedCount / total : 0;

    // Relative mention score: compare brand mention rate vs avg entity mention rate for this prompt
    const entityStats = promptEntityStats[pid];
    const avgEntityMentionRate = entityStats?.avg_entity_mention_rate;
    const relativeMentionScore = avgEntityMentionRate && avgEntityMentionRate > 0
      ? Math.min(1, mentionRate / avgEntityMentionRate)
      : mentionRate;

    // Position impact: avg position score on mentioned runs only
    const mentionedWithPos = runs.filter(r => r.mentioned && r.position != null);
    const positionImpact = mentionedWithPos.length > 0
      ? mentionedWithPos.reduce((s, r) => s + Math.max(0, (avgN - r.position) / avgN), 0) / mentionedWithPos.length
      : 0;

    const visibilityScore = Math.round((0.5 * relativeMentionScore + 0.5 * positionImpact) * 100);

    const mentionRatePct = Math.round(mentionRate * 100);

    const totalCitations = runs.reduce((sum, r) => sum + r.citationCount, 0);
    const totalBrandCitations = runs.reduce((sum, r) => sum + r.brandCitationCount, 0);

    // Average position (only runs where brand appeared in a numbered list)
    const positionedRuns = runs.filter(r => r.position !== null);
    const avgPosition = positionedRuns.length > 0
      ? Math.round(positionedRuns.reduce((s, r) => s + r.position, 0) / positionedRuns.length * 10) / 10
      : null;

    const citationShare = totalCitations > 0
      ? Math.round((totalBrandCitations / totalCitations) * 1000) / 10
      : 0;

    // Daily history — use new formula per day
    const byDate = {};
    for (const run of runs) {
      if (!run.reportDate) continue;
      if (!byDate[run.reportDate]) {
        byDate[run.reportDate] = { mentioned: 0, total: 0, positions: [], brandCits: 0, totalCits: 0 };
      }
      const d = byDate[run.reportDate];
      d.total++;
      if (run.mentioned) d.mentioned++;
      if (run.position != null) d.positions.push(run.position);
      d.brandCits += run.brandCitationCount;
      d.totalCits += run.citationCount;
    }

    const history = Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, d]) => {
        const dayMentionRate = d.total > 0 ? d.mentioned / d.total : 0;
        const dayRelMentionScore = avgEntityMentionRate && avgEntityMentionRate > 0
          ? Math.min(1, dayMentionRate / avgEntityMentionRate)
          : dayMentionRate;
        // position scores for mentioned runs (d.positions already only has positions from mentioned runs)
        const dayPosImpact = d.positions.length > 0
          ? d.positions.reduce((acc, K) => acc + Math.max(0, (avgN - K) / avgN), 0) / d.positions.length
          : 0;
        return {
          date: date.slice(5),
          visibility: Math.round((0.5 * dayRelMentionScore + 0.5 * dayPosImpact) * 100),
          mentionRate: Math.round(dayMentionRate * 100),
          avgPosition: d.positions.length > 0
            ? Math.round(d.positions.reduce((a, b) => a + b, 0) / d.positions.length * 10) / 10
            : null,
          citationShare: d.totalCits > 0
            ? Math.round((d.brandCits / d.totalCits) * 1000) / 10
            : 0,
        };
      });

    // Trend: compare recent half vs older half of history
    const halfIdx = Math.ceil(history.length / 2);
    const recentHistory = history.slice(halfIdx);
    const olderHistory = history.slice(0, halfIdx);
    const recentVis = recentHistory.length
      ? recentHistory.reduce((s, h) => s + h.visibility, 0) / recentHistory.length
      : 0;
    const olderVis = olderHistory.length
      ? olderHistory.reduce((s, h) => s + h.visibility, 0) / olderHistory.length
      : 0;
    const visibilityTrend = Math.round(recentVis - olderVis);

    // Citation domain breakdown
    const allResultsForPrompt = results.filter(r => r.brand_prompt_id === pid);
    const domainMap = {};
    let grandTotalMentions = 0;
    allResultsForPrompt.forEach((row, runIdx) => {
      const urls = Array.isArray(row.chatgpt_citations) ? row.chatgpt_citations : [];
      urls.forEach(url => {
        const domain = (url || '').replace(/^https?:\/\/(www\.)?/, '').split('/')[0].toLowerCase();
        if (!domain) return;
        if (!domainMap[domain]) domainMap[domain] = { urlSet: new Set(), mentions: 0, runSet: new Set() };
        domainMap[domain].urlSet.add(url);
        domainMap[domain].mentions++;
        domainMap[domain].runSet.add(runIdx);
        grandTotalMentions++;
      });
    });
    const totalRuns = allResultsForPrompt.length;
    const citationDomains = Object.entries(domainMap)
      .map(([domain, d]) => ({
        domain,
        uniqueUrls: d.urlSet.size,
        mentions: d.mentions,
        pctTotal: grandTotalMentions > 0 ? Math.round((d.mentions / grandTotalMentions) * 1000) / 10 : 0,
        coverage: totalRuns > 0 ? Math.round((d.runSet.size / totalRuns) * 100) : 0,
        urls: [...d.urlSet],
      }))
      .sort((a, b) => b.mentions - a.mentions)
      .slice(0, 15);

    stats[pid] = {
      visibilityScore,
      visibilityTrend,
      avgPosition,
      mentionRate: mentionRatePct,
      citationShare,
      citations: totalCitations,
      lastRun: runs[0]?.reportDate || '',
      history,
      recentResults,
      citationDomains,
      contentTypeBreakdown: null,
    };
  }

  // 6. Content type breakdown (single-prompt only)
  if (promptId && stats[promptId]) {
    const promptResultIds = results.map(r => r.id);
    if (promptResultIds.length > 0) {
      const { data: typeRows } = await supabase
        .from('url_citations')
        .select('url_inventory(url_content_facts(content_structure_category))')
        .in('prompt_result_id', promptResultIds);

      if (typeRows && typeRows.length > 0) {
        const typeCounts = {};
        let totalUrlCount = 0;
        for (const row of typeRows) {
          const facts = row.url_inventory?.url_content_facts;
          const cat = (Array.isArray(facts) ? facts[0]?.content_structure_category : facts?.content_structure_category) || 'UNCLASSIFIED';
          typeCounts[cat] = (typeCounts[cat] || 0) + 1;
          totalUrlCount++;
        }
        stats[promptId].contentTypeBreakdown = Object.entries(typeCounts)
          .map(([category, count]) => ({
            category,
            urls: count,
            percentage: totalUrlCount > 0 ? Math.round((count / totalUrlCount) * 100) : 0,
          }))
          .sort((a, b) => b.urls - a.urls);
      }
    }
  }

  return res.status(200).json({ success: true, stats });
};
