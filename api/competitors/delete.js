/**
 * Vercel Serverless Function: /api/competitors/delete
 *
 * Permanently removes a competitor:
 * 1. Deletes the brand_competitors row
 * 2. Strips the competitor from competitor_metrics JSONB on all past daily_reports
 *
 * Body: { competitorId, brandId }
 * Returns: { success, reportsUpdated }
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
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

module.exports = async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const { competitorId, brandId } = req.body || {};
  if (!competitorId || !brandId) {
    return res.status(400).json({ success: false, error: 'Missing competitorId or brandId' });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    // 1. Delete from brand_competitors
    const { error: deleteError } = await supabase
      .from('brand_competitors')
      .delete()
      .eq('id', competitorId)
      .eq('brand_id', brandId);

    if (deleteError) {
      console.error('[delete-competitor] Delete error:', deleteError.message);
      return res.status(500).json({ success: false, error: deleteError.message });
    }

    console.log('[delete-competitor] Deleted competitor:', competitorId);

    // 2. Strip from competitor_metrics JSONB on all past reports
    const { data: reports, error: reportsError } = await supabase
      .from('daily_reports')
      .select('id, competitor_metrics')
      .eq('brand_id', brandId)
      .not('competitor_metrics', 'is', null);

    if (reportsError) {
      console.error('[delete-competitor] Could not fetch reports:', reportsError.message);
      return res.status(200).json({ success: true, reportsUpdated: 0, warning: 'Could not clean past reports' });
    }

    const reportsToUpdate = (reports || []).filter(r => {
      const metrics = r.competitor_metrics;
      return metrics && Array.isArray(metrics.competitors) &&
        metrics.competitors.some(c => c.competitor_id === competitorId);
    });

    let reportsUpdated = 0;
    for (const report of reportsToUpdate) {
      const updated = {
        ...report.competitor_metrics,
        competitors: report.competitor_metrics.competitors.filter(
          c => c.competitor_id !== competitorId
        ),
      };
      const { error: updateError } = await supabase
        .from('daily_reports')
        .update({ competitor_metrics: updated })
        .eq('id', report.id);

      if (!updateError) reportsUpdated++;
      else console.warn('[delete-competitor] Failed to update report', report.id, updateError.message);
    }

    console.log('[delete-competitor] Stripped from', reportsUpdated, 'past reports');
    return res.status(200).json({ success: true, reportsUpdated });

  } catch (err) {
    console.error('[delete-competitor] Unexpected error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
};
