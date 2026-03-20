/**
 * Visibility Score Calculator
 *
 * Formula: visibilityScore = (mentionRate × 0.4) + (positionScore × 0.3) + (citationShare × 0.3)
 *
 * Per run:
 *   mentionRate_run    = brand_mentioned ? 100 : 0
 *   positionScore_run  = brand_mentioned && brand_position ? max(0, 100 - (brand_position-1)×10) : 0
 *   citationShare_run  = total_citations > 0 ? (brand_citations / total_citations × 100) : 0
 *
 * Combined daily score = average across all providers' runs
 * Per-provider scores stored separately in visibility_score_by_provider
 *
 * Saves to:
 *   daily_reports.visibility_score              (combined, 0–100)
 *   daily_reports.visibility_score_by_provider  ({ chatgpt: X, google_ai_overview: Y, claude: Z })
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function positionScore(position) {
  if (position == null) return 0;
  return Math.max(0, 100 - (position - 1) * 10);
}

function runScore(mentioned, position, brandCits, totalCits) {
  const m = mentioned ? 100 : 0;
  const p = mentioned ? positionScore(position) : 0;
  const c = totalCits > 0 ? (brandCits / totalCits) * 100 : 0;
  return (m * 0.4) + (p * 0.3) + (c * 0.3);
}

async function calculateVisibilityScore(dailyReportId) {
  console.log('\n' + '='.repeat(70));
  console.log('📊 VISIBILITY SCORE CALCULATOR');
  console.log('='.repeat(70));
  console.log('Daily Report ID: ' + dailyReportId);

  // 1. Load brand domain
  const { data: report } = await supabase
    .from('daily_reports')
    .select('brand_id')
    .eq('id', dailyReportId)
    .single();

  if (!report) throw new Error('Daily report not found: ' + dailyReportId);

  const { data: brand } = await supabase
    .from('brands')
    .select('domain')
    .eq('id', report.brand_id)
    .single();

  const brandDomain = (brand?.domain || '')
    .replace(/^https?:\/\/(www\.)?/, '')
    .split('/')[0]
    .toLowerCase();

  console.log('Brand domain: ' + (brandDomain || '(none)'));

  // 2. Load all ok prompt_results
  const { data: results, error } = await supabase
    .from('prompt_results')
    .select('provider, brand_mentioned, brand_position, chatgpt_citations')
    .eq('daily_report_id', dailyReportId)
    .eq('provider_status', 'ok');

  if (error) throw new Error('Failed to fetch prompt_results: ' + error.message);
  if (!results || results.length === 0) {
    console.log('⚠️  No ok results found — storing score=0');
    await supabase.from('daily_reports').update({
      visibility_score: 0,
      visibility_score_by_provider: {}
    }).eq('id', dailyReportId);
    return { score: 0, byProvider: {} };
  }

  console.log('✅ ' + results.length + ' results loaded');

  // 3. Compute per-provider and combined scores
  const PROVIDERS = ['chatgpt', 'google_ai_overview', 'claude'];
  const byProvider = {};
  const allScores = [];

  for (const provider of PROVIDERS) {
    const provResults = results.filter(r => r.provider === provider);
    if (provResults.length === 0) continue;

    const scores = provResults.map(r => {
      const citations = Array.isArray(r.chatgpt_citations) ? r.chatgpt_citations : [];
      const totalCits = citations.length;
      const brandCits = brandDomain
        ? citations.filter(u => (u || '').toLowerCase().includes(brandDomain)).length
        : 0;
      return runScore(r.brand_mentioned, r.brand_position, brandCits, totalCits);
    });

    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    byProvider[provider] = parseFloat(avg.toFixed(1));
    allScores.push(...scores);

    console.log(
      provider + ': ' + scores.length + ' runs, avg=' + byProvider[provider].toFixed(1) +
      ' (mention=' + provResults.filter(r => r.brand_mentioned).length + '/' + provResults.length + ')'
    );
  }

  const combined = allScores.length > 0
    ? parseFloat((allScores.reduce((a, b) => a + b, 0) / allScores.length).toFixed(1))
    : 0;

  console.log('Combined score: ' + combined);

  // 4. Save
  const { error: saveErr } = await supabase
    .from('daily_reports')
    .update({
      visibility_score: combined,
      visibility_score_by_provider: byProvider
    })
    .eq('id', dailyReportId);

  if (saveErr) throw new Error('Failed to save visibility score: ' + saveErr.message);

  console.log('✅ Visibility score saved');
  console.log('='.repeat(70) + '\n');

  return { score: combined, byProvider };
}

module.exports = { calculateVisibilityScore };
