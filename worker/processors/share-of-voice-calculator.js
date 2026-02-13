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
 * 1. Load all prompt_results with chatgpt_response for the daily report
 * 2. Batch response texts and send to GPT-4o-mini for entity extraction
 * 3. Categorize entities as brand / competitor / other
 * 4. Store result in daily_reports.share_of_voice_data
 */

const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const openaiApiKey = process.env.OPENAI_API_KEY;
const openai = new OpenAI({ apiKey: openaiApiKey });

/**
 * Extract entities from response texts using GPT-4o-mini
 * @param {string[]} responseTexts - Array of AI response texts
 * @returns {Object[]} Array of { name, count } objects
 */
async function extractEntitiesWithGPT(responseTexts) {
  const combinedText = responseTexts
    .map((text, i) => `--- Response ${i + 1} ---\n${text}`)
    .join('\n\n');

  // Truncate to ~12K chars to stay well within token limits for GPT-4o-mini
  const truncated = combinedText.length > 12000
    ? combinedText.substring(0, 12000) + '\n[... truncated]'
    : combinedText;

  const response = await openai.chat.completions.create({
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

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('Empty GPT response for entity extraction');
  }

  const parsed = JSON.parse(content);
  return parsed.entities || [];
}

/**
 * Categorize entities as brand, competitor, or other
 * @param {Object[]} entities - Array of { name, mentions }
 * @param {string} brandName - The brand name
 * @param {string[]} competitorNames - Array of competitor names
 * @returns {Object[]} Categorized entities with type field
 */
function categorizeEntities(entities, brandName, competitorNames) {
  const brandLower = brandName.toLowerCase();
  const competitorMap = {};
  competitorNames.forEach(name => {
    competitorMap[name.toLowerCase()] = name;
  });

  return entities.map(entity => {
    const nameLower = entity.name.toLowerCase();

    // Check if it's the brand
    if (nameLower === brandLower || nameLower.includes(brandLower) || brandLower.includes(nameLower)) {
      return { ...entity, name: brandName, type: 'brand' };
    }

    // Check if it's a known competitor
    for (const [compLower, compOriginal] of Object.entries(competitorMap)) {
      if (nameLower === compLower || nameLower.includes(compLower) || compLower.includes(nameLower)) {
        return { ...entity, name: compOriginal, type: 'competitor' };
      }
    }

    // Otherwise it's a discovered "other" entity
    return { ...entity, type: 'other' };
  });
}

/**
 * Merge duplicate entities after categorization (e.g. brand matched twice)
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
 * Calculate share of voice for a daily report
 * @param {string} dailyReportId - The daily report ID
 * @returns {Object} Result with success status and summary
 */
async function calculateShareOfVoice(dailyReportId) {
  console.log('\n' + '='.repeat(70));
  console.log('📊 SHARE OF VOICE CALCULATOR');
  console.log('='.repeat(70));
  console.log('Daily Report ID: ' + dailyReportId);
  console.log('='.repeat(70) + '\n');

  try {
    // 1. Get daily report info
    console.log('📋 Loading daily report info...');
    const { data: report, error: reportError } = await supabase
      .from('daily_reports')
      .select('id, brand_id, report_date')
      .eq('id', dailyReportId)
      .single();

    if (reportError || !report) {
      throw new Error('Failed to fetch daily report: ' + (reportError?.message || 'Not found'));
    }

    console.log('✅ Report loaded');
    console.log('   Brand ID: ' + report.brand_id);
    console.log('   Report Date: ' + report.report_date);

    // 2. Get brand name
    console.log('\n🏢 Loading brand info...');
    const { data: brand, error: brandError } = await supabase
      .from('brands')
      .select('id, name, onboarding_answers')
      .eq('id', report.brand_id)
      .single();

    if (brandError || !brand) {
      throw new Error('Failed to fetch brand: ' + (brandError?.message || 'Not found'));
    }

    console.log('✅ Brand: ' + brand.name);

    // 3. Get competitor names
    console.log('\n🎯 Loading competitors...');
    const { data: competitors, error: competitorsError } = await supabase
      .from('brand_competitors')
      .select('competitor_name')
      .eq('brand_id', report.brand_id)
      .eq('is_active', true);

    if (competitorsError) {
      console.log('⚠️  Error loading competitors:', competitorsError.message);
    }

    const competitorNames = (competitors || []).map(c => c.competitor_name);
    console.log('✅ Found ' + competitorNames.length + ' competitors: ' + competitorNames.join(', '));

    // 4. Load all prompt results with responses
    console.log('\n📝 Loading prompt results...');
    const { data: promptResults, error: promptError } = await supabase
      .from('prompt_results')
      .select('id, chatgpt_response')
      .eq('daily_report_id', dailyReportId)
      .not('chatgpt_response', 'is', null);

    if (promptError) {
      throw new Error('Failed to fetch prompt results: ' + promptError.message);
    }

    const responseTexts = (promptResults || [])
      .map(pr => pr.chatgpt_response)
      .filter(text => text && text.trim().length > 0);

    console.log('✅ Found ' + responseTexts.length + ' responses with text');

    if (responseTexts.length === 0) {
      console.log('⚠️  No response texts to analyze');
      return { success: true, message: 'No responses to analyze', totalMentions: 0 };
    }

    // 5. Extract entities using GPT-4o-mini
    console.log('\n🤖 Extracting entities with GPT-4o-mini...');
    const rawEntities = await extractEntitiesWithGPT(responseTexts);
    console.log('✅ Extracted ' + rawEntities.length + ' raw entities');

    if (rawEntities.length === 0) {
      console.log('⚠️  No entities found in responses');
      const emptyData = {
        entities: [],
        total_mentions: 0,
        calculated_at: new Date().toISOString()
      };

      await supabase
        .from('daily_reports')
        .update({ share_of_voice_data: emptyData })
        .eq('id', dailyReportId);

      return { success: true, message: 'No entities found', totalMentions: 0 };
    }

    // 6. Categorize entities
    console.log('\n🏷️  Categorizing entities...');
    const categorized = categorizeEntities(rawEntities, brand.name, competitorNames);
    const merged = mergeEntities(categorized);

    const totalMentions = merged.reduce((sum, e) => sum + e.mentions, 0);

    console.log('✅ Categorized ' + merged.length + ' entities:');
    merged.forEach(e => {
      const pct = totalMentions > 0 ? ((e.mentions / totalMentions) * 100).toFixed(1) : '0.0';
      console.log('   [' + e.type + '] ' + e.name + ': ' + e.mentions + ' mentions (' + pct + '%)');
    });

    // 7. Build and save share of voice data
    const shareOfVoiceData = {
      entities: merged.map(e => ({
        name: e.name,
        mentions: e.mentions,
        type: e.type
      })),
      total_mentions: totalMentions,
      calculated_at: new Date().toISOString()
    };

    console.log('\n💾 Saving share of voice data...');
    const { error: updateError } = await supabase
      .from('daily_reports')
      .update({ share_of_voice_data: shareOfVoiceData })
      .eq('id', dailyReportId);

    if (updateError) {
      throw new Error('Failed to save share of voice data: ' + updateError.message);
    }

    console.log('✅ Share of voice data saved');

    // 8. Summary
    const brandEntity = merged.find(e => e.type === 'brand');
    const brandMentions = brandEntity ? brandEntity.mentions : 0;
    const brandShare = totalMentions > 0 ? ((brandMentions / totalMentions) * 100).toFixed(1) : '0.0';

    console.log('\n' + '='.repeat(70));
    console.log('📊 SHARE OF VOICE SUMMARY');
    console.log('='.repeat(70));
    console.log('Total entities: ' + merged.length);
    console.log('Total mentions: ' + totalMentions);
    console.log('Brand share: ' + brandShare + '%');
    console.log('='.repeat(70) + '\n');

    return {
      success: true,
      totalEntities: merged.length,
      totalMentions,
      brandShare: parseFloat(brandShare),
      entities: merged.length
    };

  } catch (error) {
    console.error('\n❌ SHARE OF VOICE CALCULATION FAILED');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  calculateShareOfVoice
};
