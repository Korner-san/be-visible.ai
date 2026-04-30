/**
 * Project Mentions Calculator
 *
 * Runs as Phase 7b in end-of-day-processor.js for brands with user_business_type='real_estate_israel'.
 * Mirrors competitor-metrics-calculator.js exactly — zero API calls, pure string matching.
 *
 * For each project in real_estate_projects:
 *   - Scans chatgpt_response / claude_response / google_ai_overview_response in all ok prompt_results
 *   - Computes mention_count, mention_rate (%), and per-provider breakdown
 *
 * Stores result in daily_reports.project_mention_data JSONB.
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const PROVIDER_RESPONSE_COL = {
  chatgpt:            'chatgpt_response',
  google_ai_overview: 'google_ai_overview_response',
  claude:             'claude_response',
  perplexity:         'perplexity_response',
};

function mentionsProject(text, projectName) {
  if (!text || !projectName) return false;
  return text.toLowerCase().includes(projectName.toLowerCase());
}

async function calculateProjectMentions(dailyReportId) {
  console.log('\n' + '='.repeat(70));
  console.log('🏗️  PROJECT MENTIONS CALCULATOR');
  console.log('='.repeat(70));
  console.log('Daily Report ID: ' + dailyReportId);

  try {
    // 1. Load report + brand
    const { data: report, error: reportErr } = await supabase
      .from('daily_reports')
      .select('id, brand_id, report_date')
      .eq('id', dailyReportId)
      .single();

    if (reportErr || !report) throw new Error('Report not found: ' + (reportErr?.message || 'no data'));

    const { data: brand } = await supabase
      .from('brands')
      .select('id, name, user_business_type')
      .eq('id', report.brand_id)
      .single();

    if (!brand || brand.user_business_type !== 'real_estate_israel') {
      console.log('ℹ️  Not a real_estate_israel brand — skipping');
      return { success: true, skipped: true };
    }

    // 2. Load projects
    const { data: projects, error: projErr } = await supabase
      .from('real_estate_projects')
      .select('id, project_name, city')
      .eq('brand_id', report.brand_id)
      .eq('is_active', true);

    if (projErr) throw new Error('Failed to load projects: ' + projErr.message);

    if (!projects || projects.length === 0) {
      console.log('ℹ️  No active projects found for this brand');
      return { success: true, projectCount: 0 };
    }

    console.log('✅ Projects: ' + projects.map(p => p.project_name).join(', '));

    // 3. Load all ok prompt_results (include entity_mention_analysis for reasoning-based detection)
    const { data: promptResults, error: prErr } = await supabase
      .from('prompt_results')
      .select('id, provider, chatgpt_response, claude_response, google_ai_overview_response, perplexity_response, entity_mention_analysis')
      .eq('daily_report_id', dailyReportId)
      .eq('provider_status', 'ok');

    if (prErr) throw new Error('Failed to load prompt results: ' + prErr.message);

    const allResults = promptResults || [];
    const totalResponses = allResults.length;

    // How many rows have entity_mention_analysis
    const entityRows = allResults.filter(pr => pr.entity_mention_analysis && pr.entity_mention_analysis.projects);
    const analysisMethod = entityRows.length >= allResults.length * 0.5 ? 'gpt_reasoning' : 'fallback_text_match';

    console.log('✅ Scanning ' + totalResponses + ' ok responses (' + entityRows.length + ' with entity analysis, method: ' + analysisMethod + ')');

    if (totalResponses === 0) {
      const emptyData = {
        projects: projects.map(p => ({
          project_id: p.id,
          project_name: p.project_name,
          city: p.city || null,
          mention_count: 0,
          mention_rate: 0,
          by_provider: {},
        })),
        total_responses: 0,
        analysis_method: analysisMethod,
        calculated_at: new Date().toISOString(),
      };
      await supabase.from('daily_reports').update({ project_mention_data: emptyData }).eq('id', dailyReportId);
      return { success: true, projectCount: projects.length };
    }

    const PROVIDERS = ['chatgpt', 'google_ai_overview', 'claude'];

    // Check if a row mentions a project — prefer entity_mention_analysis, fall back to string match
    function rowMentionsProject(pr, projectName) {
      const ema = pr.entity_mention_analysis;
      if (ema && Array.isArray(ema.projects)) {
        // Match by exact name or partial match
        const ep = ema.projects.find(p =>
          p.project_name && (
            p.project_name.toLowerCase() === projectName.toLowerCase() ||
            p.project_name.toLowerCase().includes(projectName.toLowerCase()) ||
            projectName.toLowerCase().includes(p.project_name.toLowerCase())
          )
        );
        if (ep) return ep.mentioned === true;
      }
      // Fallback: string matching
      const col = PROVIDER_RESPONSE_COL[pr.provider];
      const text = col ? pr[col] : null;
      return mentionsProject(text, projectName);
    }

    // 4. For each project, count mentions across all responses + per-provider
    const projectStats = projects.map(project => {
      const name = project.project_name;

      let totalMentions = 0;
      for (const pr of allResults) {
        if (rowMentionsProject(pr, name)) totalMentions++;
      }

      // Per-provider breakdown
      const byProvider = {};
      for (const provider of PROVIDERS) {
        const provResults = allResults.filter(pr => pr.provider === provider);
        if (provResults.length === 0) continue;
        const mentionCount = provResults.filter(pr => rowMentionsProject(pr, name)).length;
        byProvider[provider] = {
          mention_count: mentionCount,
          mention_rate: parseFloat(((mentionCount / provResults.length) * 100).toFixed(1)),
          total_responses: provResults.length,
        };
      }

      return {
        project_id: project.id,
        project_name: name,
        city: project.city || null,
        mention_count: totalMentions,
        mention_rate: parseFloat(((totalMentions / totalResponses) * 100).toFixed(1)),
        by_provider: byProvider,
      };
    });

    // 5. Save
    const mentionData = {
      projects: projectStats,
      total_responses: totalResponses,
      analysis_method: analysisMethod,
      calculated_at: new Date().toISOString(),
    };

    const { error: updateErr } = await supabase
      .from('daily_reports')
      .update({ project_mention_data: mentionData })
      .eq('id', dailyReportId);

    if (updateErr) throw new Error('Failed to save project_mention_data: ' + updateErr.message);

    // 6. Summary
    console.log('\n📊 PROJECT MENTIONS SUMMARY');
    projectStats.forEach(ps => {
      console.log('  ' + ps.project_name + ': ' + ps.mention_count + 'x (' + ps.mention_rate + '%)');
    });
    console.log('='.repeat(70) + '\n');

    return { success: true, projectCount: projects.length };

  } catch (err) {
    console.error('\n❌ PROJECT MENTIONS CALCULATION FAILED');
    console.error('Error:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { calculateProjectMentions };
