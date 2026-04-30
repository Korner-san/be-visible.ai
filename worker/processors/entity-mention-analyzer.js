/**
 * Entity Mention Analyzer — Phase 1b
 *
 * Runs after brand-analyzer in EOD. Uses GPT-4o-mini to analyze each prompt_result
 * and detect brand, competitor, and project mentions with reasoning.
 *
 * Stores result in prompt_results.entity_mention_analysis JSONB.
 * project-mentions-calculator reads from this field instead of raw text.
 */

const { createClient } = require('@supabase/supabase-js');
const https = require('https');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PROVIDER_RESPONSE_COL = {
  chatgpt: 'chatgpt_response',
  google_ai_overview: 'google_ai_overview_response',
  claude: 'claude_response',
  perplexity: 'perplexity_response',
};

function gpt(system, user, openaiKey) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    });

    const req = https.request(
      {
        hostname: 'api.openai.com',
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + openaiKey,
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode !== 200) {
              reject(new Error('OpenAI ' + res.statusCode + ': ' + data));
              return;
            }
            resolve(JSON.parse(parsed.choices[0].message.content));
          } catch (e) {
            reject(new Error('Parse error: ' + e.message));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function analyzeRow(row, brandName, competitorNames, projects, openaiKey) {
  const col = PROVIDER_RESPONSE_COL[row.provider];
  const responseText = col ? row[col] : null;
  if (!responseText || responseText.length < 20) return null;

  const hasProjects = projects.length > 0;
  const projectsList = hasProjects
    ? projects.map(p => '- "' + p.project_name + '"' + (p.city ? ' (' + p.city + ')' : '')).join('\n')
    : '';

  const system = `You analyze AI-generated text responses to detect named entity mentions.
Be liberal — a mention includes the name, a clear reference, or an unambiguous implication.
entity_rank = order of first appearance (1 = first mentioned), null if not mentioned.

Output JSON with this exact shape:
{
  "brand": { "mentioned": boolean, "entity_rank": number|null, "confidence": "high|medium|low", "reason": "brief" },
  "competitors": [{ "name": "...", "mentioned": boolean, "entity_rank": number|null, "confidence": "high|medium|low", "reason": "brief" }],
  "projects": [{ "project_name": "...", "city": "...", "mentioned": boolean, "entity_rank": number|null, "confidence": "high|medium|low", "reason": "brief" }]
}

Rules:
- Always output all competitors and projects in the arrays, even if not mentioned (mentioned=false).
- Keep reasons under 20 words.`;

  const user = 'Brand: "' + brandName + '"\n' +
    'Competitors: ' + (competitorNames.length > 0 ? competitorNames.map(c => '"' + c + '"').join(', ') : 'none') + '\n' +
    (hasProjects ? 'Projects to detect:\n' + projectsList + '\n' : '') +
    '\nResponse text (max 2000 chars):\n"' + responseText.slice(0, 2000) + '"';

  return gpt(system, user, openaiKey);
}

// Run fn over items with a concurrency limit
async function withConcurrency(items, fn, limit) {
  const results = new Array(items.length);
  let idx = 0;

  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function analyzeEntityMentions(dailyReportId) {
  console.log('\n' + '='.repeat(70));
  console.log('🧠  ENTITY MENTION ANALYZER');
  console.log('='.repeat(70));
  console.log('Daily Report ID: ' + dailyReportId);

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    console.log('⚠️  OPENAI_API_KEY not set — entity analysis skipped');
    return { success: true, skipped: true };
  }

  try {
    // Load report + brand
    const { data: report } = await supabase
      .from('daily_reports')
      .select('id, brand_id')
      .eq('id', dailyReportId)
      .single();
    if (!report) throw new Error('Report not found');

    const { data: brand } = await supabase
      .from('brands')
      .select('id, name, user_business_type')
      .eq('id', report.brand_id)
      .single();
    if (!brand) throw new Error('Brand not found');

    // Load competitors
    const { data: competitorRows } = await supabase
      .from('brand_competitors')
      .select('competitor_name')
      .eq('brand_id', brand.id)
      .eq('is_active', true);
    const competitorNames = (competitorRows || []).map(c => c.competitor_name);

    // Load projects (RE brands only)
    let projects = [];
    if (brand.user_business_type === 'real_estate_israel') {
      const { data: projs } = await supabase
        .from('real_estate_projects')
        .select('id, project_name, city')
        .eq('brand_id', brand.id)
        .eq('is_active', true);
      projects = projs || [];
    }

    // Load ok prompt_results that don't yet have entity_mention_analysis
    const { data: rows } = await supabase
      .from('prompt_results')
      .select('id, provider, chatgpt_response, claude_response, google_ai_overview_response, perplexity_response')
      .eq('daily_report_id', dailyReportId)
      .eq('provider_status', 'ok')
      .is('entity_mention_analysis', null);

    if (!rows || rows.length === 0) {
      console.log('ℹ️  No unprocessed rows to analyze');
      return { success: true, analyzed: 0 };
    }

    console.log('Analyzing ' + rows.length + ' responses for ' + brand.name + '...');
    if (projects.length > 0) console.log('Projects tracked: ' + projects.map(p => p.project_name).join(', '));

    let successCount = 0;
    let failCount = 0;

    await withConcurrency(rows, async (row) => {
      try {
        const analysis = await analyzeRow(row, brand.name, competitorNames, projects, openaiKey);
        if (analysis) {
          const { error } = await supabase
            .from('prompt_results')
            .update({ entity_mention_analysis: analysis })
            .eq('id', row.id);
          if (error) throw error;
          successCount++;
        }
      } catch (err) {
        failCount++;
        console.error('  ⚠️  Row ' + row.id + ' failed:', err.message);
      }
    }, 8);

    console.log('✅ Entity analysis complete: ' + successCount + ' processed, ' + failCount + ' failed');
    console.log('='.repeat(70) + '\n');

    return { success: true, analyzed: successCount, failed: failCount };

  } catch (err) {
    console.error('\n❌ ENTITY ANALYSIS FAILED:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { analyzeEntityMentions };
