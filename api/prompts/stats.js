/**
 * Vercel Serverless Function: /api/prompts/stats
 *
 * Returns per-prompt stats for the Prompts page:
 *   - visibilityScore  : % of runs where brand was mentioned
 *   - citationCount    : total citations across all runs
 *   - citationShare    : % of runs that had at least one citation
 *   - lastRun          : most recent report_date this prompt ran
 *   - history          : last 30 days visibility per day (for chart)
 *   - recentResults    : last 5 prompt_results rows (for Sample history tab)
 *
 * Query: GET /api/prompts/stats?brandId=xxx
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

  const { brandId, days: daysParam, promptId } = req.query;
  if (!brandId) return res.status(400).json({ success: false, error: 'Missing brandId' });

  const days = parseInt(daysParam) || 30;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoffStr = cutoffDate.toISOString().split('T')[0]; // YYYY-MM-DD

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // 1. Get brand name (needed to detect mentions in response text)
  const { data: brand } = await supabase
    .from('brands')
    .select('id, name')
    .eq('id', brandId)
    .single();

  if (!brand) return res.status(404).json({ success: false, error: 'Brand not found' });

  const brandNameLower = brand.name.toLowerCase();

  // 2. Get completed reports for this brand within the date range
  let reportsQuery = supabase
    .from('daily_reports')
    .select('id, report_date')
    .eq('brand_id', brandId)
    .eq('status', 'completed')
    .gte('report_date', cutoffStr)
    .order('report_date', { ascending: false })
    .limit(90);

  const { data: reports } = await reportsQuery;

  if (!reports || reports.length === 0) {
    return res.status(200).json({ success: true, stats: {} });
  }

  const reportIds = reports.map(r => r.id);
  const reportDateMap = Object.fromEntries(reports.map(r => [r.id, r.report_date]));

  // 3. Fetch all prompt_results for these reports (optionally filtered to one prompt)
  let resultsQuery = supabase
    .from('prompt_results')
    .select('id, brand_prompt_id, daily_report_id, chatgpt_response, chatgpt_citations, brand_mentioned, prompt_text, created_at')
    .in('daily_report_id', reportIds)
    .not('chatgpt_response', 'is', null)
    .order('created_at', { ascending: false });

  if (promptId) resultsQuery = resultsQuery.eq('brand_prompt_id', promptId);

  const { data: results } = await resultsQuery;

  if (!results || results.length === 0) {
    return res.status(200).json({ success: true, stats: {} });
  }

  // 4. Group by brand_prompt_id and compute stats
  const grouped = {};

  for (const row of results) {
    const pid = row.brand_prompt_id;
    if (!pid) continue;

    if (!grouped[pid]) {
      grouped[pid] = { runs: [], recentResults: [] };
    }

    // Determine if brand was mentioned
    // Prefer stored brand_mentioned field; fall back to text search
    const mentioned = row.brand_mentioned != null
      ? row.brand_mentioned
      : (row.chatgpt_response || '').toLowerCase().includes(brandNameLower);

    const citationCount = Array.isArray(row.chatgpt_citations) ? row.chatgpt_citations.length : 0;
    const reportDate = reportDateMap[row.daily_report_id] || '';

    grouped[pid].runs.push({ mentioned, citationCount, reportDate, dailyReportId: row.daily_report_id });

    // Keep last 5 for sample history tab
    if (grouped[pid].recentResults.length < 5) {
      grouped[pid].recentResults.push({
        id: row.id,
        promptText: row.prompt_text || '',
        response: row.chatgpt_response || '',
        mentioned,
        citationCount,
        citations: row.chatgpt_citations || [],
        date: reportDate,
      });
    }
  }

  // 5. Build per-prompt stats object
  const stats = {};

  for (const [promptId, data] of Object.entries(grouped)) {
    const { runs, recentResults } = data;
    const total = runs.length;
    const mentionedCount = runs.filter(r => r.mentioned).length;
    const totalCitations = runs.reduce((sum, r) => sum + r.citationCount, 0);
    const runsWithCitations = runs.filter(r => r.citationCount > 0).length;

    // Build daily history for chart (last 30 days)
    // Group by date, take the latest run per date
    const byDate = {};
    for (const run of runs) {
      if (run.reportDate && !byDate[run.reportDate]) {
        byDate[run.reportDate] = run.mentioned ? 100 : 0;
      }
    }
    const history = Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, visibility]) => ({
        date: date.slice(5), // "MM-DD"
        visibility,
      }));

    // Trend: compare last 7 days vs previous 7 days
    const recent7 = runs.slice(0, 7);
    const prev7 = runs.slice(7, 14);
    const recentVis = recent7.length ? (recent7.filter(r => r.mentioned).length / recent7.length) * 100 : 0;
    const prevVis = prev7.length ? (prev7.filter(r => r.mentioned).length / prev7.length) * 100 : 0;
    const visibilityTrend = Math.round(recentVis - prevVis);

    stats[promptId] = {
      visibilityScore: total > 0 ? Math.round((mentionedCount / total) * 100) : 0,
      visibilityTrend,
      citationShare: total > 0 ? Math.round((runsWithCitations / total) * 100) : 0,
      citations: totalCitations,
      lastRun: runs[0]?.reportDate || '',
      history,
      recentResults,
      contentTypeBreakdown: null, // filled below for single-prompt queries
    };
  }

  // 6. For single-prompt queries, add content type breakdown from url_citations → url_content_facts
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
