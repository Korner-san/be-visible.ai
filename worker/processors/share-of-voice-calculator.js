/**
 * Share of Voice Calculator
 *
 * Extracts all company/software/tool entities mentioned in AI responses
 * and calculates share of voice (% of total mentions) for:
 * - The brand itself
 * - Known competitors
 * - Other discovered entities
 *
 * Uses GPT-4o-mini for entity extraction from response texts.
 *
 * Process:
 * 1. Load all prompt_results for the daily report (all providers)
 * 2. Run entity extraction once per provider (chatgpt, google_ai_overview, claude, perplexity)
 * 3. Run one combined extraction across all providers for the aggregate view
 * 4. Store per-provider results in daily_reports.share_of_voice_by_provider
 * 5. Store combined result in daily_reports.share_of_voice_data
 */

const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const openaiApiKey = process.env.OPENAI_API_KEY;
const openai = new OpenAI({ apiKey: openaiApiKey });

// Map provider name → response column in prompt_results
const PROVIDER_RESPONSE_COLUMNS = {
  chatgpt: 'chatgpt_response',
  google_ai_overview: 'google_ai_overview_response',
  claude: 'claude_response',
  perplexity: 'perplexity_response',
};

/**
 * Extract entities from response texts using GPT-4o-mini
 * @param {string[]} responseTexts - Array of AI response texts
 * @returns {Object[]} Array of { name, mentions } objects
 */
async function extractEntitiesWithGPT(responseTexts, retries = 3) {
  if (retries < 3) {
    const delay = (3 - retries) * 2000;
    console.log('   ⏳ Rate limit hit, retrying in ' + delay + 'ms (' + retries + ' retries left)...');
    await new Promise(r => setTimeout(r, delay));
  }
  const combinedText = responseTexts
    .map((text, i) => `--- Response ${i + 1} ---\n${text}`)
    .join('\n\n');

  // Truncate to ~12K chars to stay well within token limits for GPT-4o-mini
  const truncated = combinedText.length > 12000
    ? combinedText.substring(0, 12000) + '\n[... truncated]'
    : combinedText;

  let response;
  try {
    response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You are an entity extraction expert. Extract all company names, software tools, platforms, and product names mentioned in the provided AI responses. Count how many separate responses mention each entity (not total occurrences within a single response — count each response that mentions the entity once). Always respond with valid JSON.`
      },
      {
        role: 'user',
        content: `Extract all company/software/tool/platform entities from these AI responses. For each entity, count in how many separate responses it appears (each "--- Response N ---" block counts as one response).

Return JSON format:
{
  "entities": [
    {"name": "EntityName", "mentions": 5},
    {"name": "AnotherEntity", "mentions": 3}
  ]
}

Rules:
- Normalize names (e.g., "GitHub Actions" not "github actions" or "Github actions")
- Merge obvious variants (e.g., "GitLab CI" and "GitLab CI/CD" = "GitLab CI")
- Only include companies, software tools, platforms, and products
- Do NOT include generic terms like "AI", "cloud", "CI/CD" as entities
- Count = number of distinct responses mentioning the entity, not total occurrences

Responses:
${truncated}`
      }
    ],
    temperature: 0.1,
    max_tokens: 2000,
    response_format: { type: 'json_object' }
  });
  } catch (err) {
    if (err?.status === 429 && retries > 0) {
      return extractEntitiesWithGPT(responseTexts, retries - 1);
    }
    throw err;
  }

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('Empty GPT response for entity extraction');
  }

  const parsed = JSON.parse(content);
  return parsed.entities || [];
}

/**
 * Categorize entities as brand, competitor, or other
 */
function categorizeEntities(entities, brandName, competitorNames) {
  const brandLower = brandName.toLowerCase();
  const competitorMap = {};
  competitorNames.forEach(name => {
    competitorMap[name.toLowerCase()] = name;
  });

  return entities.map(entity => {
    const nameLower = entity.name.toLowerCase();

    if (nameLower === brandLower || nameLower.includes(brandLower) || brandLower.includes(nameLower)) {
      return { ...entity, name: brandName, type: 'brand' };
    }

    for (const [compLower, compOriginal] of Object.entries(competitorMap)) {
      if (nameLower === compLower || nameLower.includes(compLower) || compLower.includes(nameLower)) {
        return { ...entity, name: compOriginal, type: 'competitor' };
      }
    }

    return { ...entity, type: 'other' };
  });
}

/**
 * Merge duplicate entities after categorization
 */
function mergeEntities(entities) {
  const merged = {};
  for (const entity of entities) {
    const key = entity.name.toLowerCase();
    if (merged[key]) {
      merged[key].mentions += entity.mentions;
    } else {
      merged[key] = { ...entity };
    }
  }
  return Object.values(merged).sort((a, b) => b.mentions - a.mentions);
}

/**
 * Run extraction for a set of response texts and return cleaned SoV data.
 * Returns null if no texts provided.
 */
async function buildSovData(responseTexts, brandName, competitorNames, label) {
  if (!responseTexts || responseTexts.length === 0) {
    console.log('   ⚠️  No responses for ' + label + ', skipping');
    return null;
  }

  console.log('   🤖 Extracting entities for ' + label + ' (' + responseTexts.length + ' responses)...');
  const rawEntities = await extractEntitiesWithGPT(responseTexts);

  if (rawEntities.length === 0) {
    console.log('   ⚠️  No entities found for ' + label);
    return { entities: [], total_mentions: 0, calculated_at: new Date().toISOString() };
  }

  const categorized = categorizeEntities(rawEntities, brandName, competitorNames);
  const merged = mergeEntities(categorized);
  const totalMentions = merged.reduce((sum, e) => sum + e.mentions, 0);

  merged.forEach(e => {
    const pct = totalMentions > 0 ? ((e.mentions / totalMentions) * 100).toFixed(1) : '0.0';
    console.log('     [' + e.type + '] ' + e.name + ': ' + e.mentions + ' (' + pct + '%)');
  });

  return {
    entities: merged.map(e => ({ name: e.name, mentions: e.mentions, type: e.type })),
    total_mentions: totalMentions,
    calculated_at: new Date().toISOString()
  };
}

/**
 * Calculate share of voice for a daily report
 */
async function calculateShareOfVoice(dailyReportId) {
  console.log('\n' + '='.repeat(70));
  console.log('📊 SHARE OF VOICE CALCULATOR');
  console.log('='.repeat(70));
  console.log('Daily Report ID: ' + dailyReportId);
  console.log('='.repeat(70) + '\n');

  try {
    // 1. Get daily report info
    const { data: report, error: reportError } = await supabase
      .from('daily_reports')
      .select('id, brand_id, report_date')
      .eq('id', dailyReportId)
      .single();

    if (reportError || !report) {
      throw new Error('Failed to fetch daily report: ' + (reportError?.message || 'Not found'));
    }
    console.log('✅ Report: ' + report.report_date + ' | Brand: ' + report.brand_id);

    // 2. Get brand name
    const { data: brand, error: brandError } = await supabase
      .from('brands')
      .select('id, name')
      .eq('id', report.brand_id)
      .single();

    if (brandError || !brand) {
      throw new Error('Failed to fetch brand: ' + (brandError?.message || 'Not found'));
    }
    console.log('✅ Brand: ' + brand.name);

    // 3. Get competitor names
    const { data: competitors } = await supabase
      .from('brand_competitors')
      .select('competitor_name')
      .eq('brand_id', report.brand_id)
      .eq('is_active', true);

    const competitorNames = (competitors || []).map(c => c.competitor_name);
    console.log('✅ Competitors: ' + competitorNames.join(', '));

    // 4. Load all prompt results with all provider response columns
    console.log('\n📝 Loading prompt results (all providers)...');
    const { data: promptResults, error: promptError } = await supabase
      .from('prompt_results')
      .select('id, provider, chatgpt_response, google_ai_overview_response, claude_response, perplexity_response')
      .eq('daily_report_id', dailyReportId);

    if (promptError) {
      throw new Error('Failed to fetch prompt results: ' + promptError.message);
    }

    console.log('✅ Loaded ' + (promptResults || []).length + ' results');

    // 5. Group response texts by provider
    const byProvider = {};
    const allTexts = [];

    for (const result of (promptResults || [])) {
      const provider = result.provider;
      const responseCol = PROVIDER_RESPONSE_COLUMNS[provider];
      const text = responseCol ? result[responseCol] : null;

      if (!text || !text.trim()) continue;

      if (!byProvider[provider]) byProvider[provider] = [];
      byProvider[provider].push(text.trim());
      allTexts.push(text.trim());
    }

    const activeProviders = Object.keys(byProvider);
    console.log('Active providers: ' + activeProviders.map(p => p + '(' + byProvider[p].length + ')').join(', '));

    if (allTexts.length === 0) {
      console.log('⚠️  No response texts found across any provider');
      return { success: true, message: 'No responses to analyze', totalMentions: 0 };
    }

    // 6. Run entity extraction per provider
    console.log('\n🔍 Per-provider entity extraction:');
    const shareOfVoiceByProvider = {};

    for (const provider of activeProviders) {
      console.log('\n  Provider: ' + provider);
      const sovData = await buildSovData(byProvider[provider], brand.name, competitorNames, provider);
      if (sovData) {
        shareOfVoiceByProvider[provider] = sovData;
      }
    }

    // 7. Run combined extraction (all providers) for the aggregate view
    console.log('\n🔍 Combined extraction (all providers):');
    const combinedSov = await buildSovData(allTexts, brand.name, competitorNames, 'ALL');

    if (!combinedSov) {
      return { success: true, message: 'No entities found', totalMentions: 0 };
    }

    // 8. Save both to daily_reports
    console.log('\n💾 Saving SoV data...');
    const { error: updateError } = await supabase
      .from('daily_reports')
      .update({
        share_of_voice_data: combinedSov,
        share_of_voice_by_provider: shareOfVoiceByProvider
      })
      .eq('id', dailyReportId);

    if (updateError) {
      throw new Error('Failed to save SoV data: ' + updateError.message);
    }

    console.log('✅ Saved share_of_voice_data (combined) and share_of_voice_by_provider');

    // 9. Summary
    const brandEntity = combinedSov.entities.find(e => e.type === 'brand');
    const brandShare = combinedSov.total_mentions > 0
      ? ((brandEntity?.mentions || 0) / combinedSov.total_mentions * 100).toFixed(1)
      : '0.0';

    console.log('\n' + '='.repeat(70));
    console.log('📊 SUMMARY');
    console.log('  Combined: ' + combinedSov.entities.length + ' entities, ' + combinedSov.total_mentions + ' mentions, brand=' + brandShare + '%');
    activeProviders.forEach(p => {
      const d = shareOfVoiceByProvider[p];
      if (d) console.log('  ' + p + ': ' + d.entities.length + ' entities, ' + d.total_mentions + ' mentions');
    });
    console.log('='.repeat(70) + '\n');

    return {
      success: true,
      totalEntities: combinedSov.entities.length,
      totalMentions: combinedSov.total_mentions,
      brandShare: parseFloat(brandShare),
      providers: activeProviders
    };

  } catch (error) {
    console.error('\n❌ SHARE OF VOICE CALCULATION FAILED');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    return { success: false, error: error.message };
  }
}

module.exports = {
  calculateShareOfVoice
};
