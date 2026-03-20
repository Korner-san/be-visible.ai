/**
 * Vercel Serverless Function: /api/prompts/stats
 *
 * Returns per-prompt stats for the Prompts page:
 *   - visibilityScore      : % of runs where brand was mentioned
 *   - avgPosition          : avg numbered-list position of brand in response (1 decimal)
 *   - citationShare        : brand domain citations / total citations % (same as CitationShareChart)
 *   - citations            : total citation URLs across all runs
 *   - lastRun              : most recent report_date this prompt ran
 *   - history              : visibility per day for chart
 *   - recentResults        : last 5 prompt_results rows
 *   - citationDomains      : per-domain stats (uniqueUrls, mentions, pctTotal, coverage)
 *   - contentTypeBreakdown : content type distribution (single-prompt only)
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
  // Normalise domain: strip protocol + www, keep just hostname
  const brandDomain = (brand.domain || '')
    .replace(/^https?:\/\/(www\.)?/, '')
    .split('/')[0]
    .toLowerCase();

  // 2. Get completed reports within date range
  const { data: reports } = await supabase
    .from('daily_reports')
    .select('id, report_date')
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

  // 3. Fetch prompt_results (optionally filtered to one prompt)
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

    // brand_position is pre-computed by brand-analyzer.js (entity rank, not char index)
    const position = (mentioned && row.brand_position != null) ? row.brand_position : null;

    const reportDate = reportDateMap[row.daily_report_id] || '';

    const mentionCount = row.brand_mention_count || 0;
    // Per-run 40/30/30 visibility score
    const runM = mentioned ? 100 : 0;
    const runP = (mentioned && position != null) ? Math.max(0, 100 - (position - 1) * 10) : 0;
    const runC = citationCount > 0 ? (brandCitationCount / citationCount) * 100 : 0;
    const runScore = (runM * 0.4) + (runP * 0.3) + (runC * 0.3);

    grouped[pid].runs.push({ mentioned, citationCount, brandCitationCount, position, reportDate, mentionCount, score: runScore });

    if (grouped[pid].recentResults.length < 5) {
      grouped[pid].recentResults.push({
        id: row.id,
        promptText: row.prompt_text || '',
        response: responseText,
        mentioned,
        citationCount,
        citations: citations,
        date: reportDate,
      });
    }
  }

  // 5. Build per-prompt stats
  const stats = {};

  for (const [pid, data] of Object.entries(grouped)) {
    const { runs, recentResults } = data;
    const total = runs.length;
    const mentionedCount = runs.filter(r => r.mentioned).length;
    const mentionRate = total > 0 ? Math.round((mentionedCount / total) * 100) : 0;
    const totalCitations = runs.reduce((sum, r) => sum + r.citationCount, 0);
    const totalBrandCitations = runs.reduce((sum, r) => sum + r.brandCitationCount, 0);

    // Average position (1 decimal) — only runs where brand appeared in a numbered list
    const positionedRuns = runs.filter(r => r.position !== null);
    const avgPosition = positionedRuns.length > 0
      ? Math.round(positionedRuns.reduce((s, r) => s + r.position, 0) / positionedRuns.length * 10) / 10
      : null;

    // Citation share: brand domain URLs / total citation URLs (same basis as CitationShareChart)
    const citationShare = totalCitations > 0
      ? Math.round((totalBrandCitations / totalCitations) * 1000) / 10  // 1 decimal %
      : 0;

    // Daily history for chart (avg 40/30/30 score per date)
    const byDate = {};
    for (const run of runs) {
      if (!run.reportDate) continue;
      if (!byDate[run.reportDate]) byDate[run.reportDate] = [];
      byDate[run.reportDate].push(run.score);
    }
    const history = Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, scores]) => ({
        date: date.slice(5),
        visibility: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      }));

    // Trend: last 7 vs previous 7 (using 40/30/30 scores)
    const recent7 = runs.slice(0, 7);
    const prev7 = runs.slice(7, 14);
    const recentVis = recent7.length ? recent7.reduce((s, r) => s + r.score, 0) / recent7.length : 0;
    const prevVis = prev7.length ? prev7.reduce((s, r) => s + r.score, 0) / prev7.length : 0;
    const visibilityTrend = Math.round(recentVis - prevVis);

    // Citation domain breakdown (for Citation sources tab)
    const domainData = {};
    runs.forEach((run, runIdx) => {
      // We don't have per-run URL arrays here; collect from recentResults + approximate
    });
    // Build from all result citations directly
    const allResultsForPrompt = results.filter(r => r.brand_prompt_id === pid);
    const domainMap = {};
    let grandTotalMentions = 0;
    allResultsForPrompt.forEach((row, runIdx) => {
      const urls = Array.isArray(row.chatgpt_citations) ? row.chatgpt_citations : []; // chatgpt_citations stores citations for all providers
      const domainsInRun = new Set();
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

    // Visibility score = avg of per-run 40/30/30 scores
    const visibilityScore = total > 0
      ? Math.round(runs.reduce((s, r) => s + r.score, 0) / total)
      : 0;

    stats[pid] = {
      visibilityScore,
      visibilityTrend,
      avgPosition,
      mentionRate,
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
