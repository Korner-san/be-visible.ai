/**
 * Share of Voice Calculator
 *
 * Extracts all company/software/tool entities mentioned in AI responses
 * and calculates share of voice (% of total mentions) for:
 * - The brand itself
 * - Known competitors
 * - Other discovered entities
 *
 * Also captures per-response entity ranks to enable Visibility Index calculation,
 * and per-prompt entity stats to enable relative mention rate scoring.
 *
 * Uses GPT-4o-mini for entity extraction from response texts.
 *
 * Process:
 * 1. Load all prompt_results for the daily report (all providers)
 * 2. Run entity extraction once per provider (chatgpt, google_ai_overview, claude, perplexity)
 * 3. Build combined view by mathematically merging per-provider results
 * 4. Store per-provider results in daily_reports.share_of_voice_by_provider
 * 5. Store combined result in daily_reports.share_of_voice_data
 *    (each entity includes: mentions, type, position_score_sum)
 *    (top-level includes: total_responses for use by visibility-index-calculator)
 * 6. Store per_prompt_entity_stats: avg entity mention rate per prompt
 *    (used by scoring to relativize brand mention rate vs other entities)
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
 * Extract entities per response with their rank using GPT-4o-mini.
 * Returns per-response data: [{response_index, entities: [{name, rank}]}]
 */
async function extractEntitiesWithGPT(responseTexts) {
  const combinedText = responseTexts
    .map((text, i) => `--- Response ${i + 1} ---\n${text}`)
    .join('\n\n');

  const truncated = combinedText.length > 12000
    ? combinedText.substring(0, 12000) + '\n[... truncated]'
    : combinedText;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You are an entity extraction expert. For each AI response, extract all company names, software tools, platforms, and product names mentioned. List them in order of prominence (rank 1 = first mentioned / most prominent). Normalize names consistently. Always respond with valid JSON.`
      },
      {
        role: 'user',
        content: `For each response block below, list all company/software/tool/platform entities in order of prominence (rank 1 = first mentioned or most prominent).

Return JSON format:
{
  "responses": [
    {
      "response_index": 1,
      "entities": [
        {"name": "EntityName", "rank": 1},
        {"name": "AnotherEntity", "rank": 2}
      ]
    },
    {
      "response_index": 2,
      "entities": [...]
    }
  ]
}

Rules:
- Normalize names (e.g., "GitHub Actions" not "github actions" or "Github actions")
- Merge obvious variants within the same response (e.g., "GitLab CI" and "GitLab CI/CD" = "GitLab CI")
- Only include companies, software tools, platforms, and products
- Do NOT include generic terms like "AI", "cloud", "CI/CD", "search engine"
- rank = position of the entity by prominence in that response (1 = first/most prominent)
- Include ALL responses from the input, even if a response mentions no entities (use empty entities array)

Responses:
${truncated}`
      }
    ],
    temperature: 0.1,
    max_tokens: 3000,
    response_format: { type: 'json_object' }
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('Empty GPT response for entity extraction');

  const parsed = JSON.parse(content);
  return parsed.responses || [];
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
 * Merge duplicate entities after categorization.
 */
function mergeEntities(entities) {
  const merged = {};
  for (const entity of entities) {
    const key = entity.name.toLowerCase();
    if (merged[key]) {
      merged[key].mentions += entity.mentions;
      merged[key].position_score_sum = (merged[key].position_score_sum || 0) + (entity.position_score_sum || 0);
    } else {
      merged[key] = { ...entity };
    }
  }
  return Object.values(merged).sort((a, b) => b.mentions - a.mentions);
}

const CHUNK_SIZE = 5;

/**
 * Run extraction for a set of response items and return cleaned SoV data + per-prompt stats.
 *
 * @param {Array<{text: string, promptId: string|null}>} responseItems
 * @param {string} brandName
 * @param {string[]} competitorNames
 * @param {string} label - for logging
 * @returns {object|null} sovData with per_prompt_stats
 */
async function buildSovData(responseItems, brandName, competitorNames, label) {
  if (!responseItems || responseItems.length === 0) {
    console.log('   ⚠️  No responses for ' + label + ', skipping');
    return null;
  }

  const totalResponses = responseItems.length;

  const chunks = [];
  for (let i = 0; i < responseItems.length; i += CHUNK_SIZE) {
    chunks.push(responseItems.slice(i, i + CHUNK_SIZE));
  }
  console.log('   🤖 Extracting entities for ' + label + ' (' + totalResponses + ' responses, ' + chunks.length + ' chunks)...');

  const entityMap = {};
  // perPromptMap: promptId → { entityKeys: Set<string>, numRuns: number, totalMentions: number }
  const perPromptMap = {};

  for (let ci = 0; ci < chunks.length; ci++) {
    const chunk = chunks[ci];
    const chunkTexts = chunk.map(item => item.text);
    const perResponseData = await extractEntitiesWithGPT(chunkTexts);
    console.log('     chunk ' + (ci + 1) + '/' + chunks.length + ': ' + perResponseData.length + ' responses processed');

    for (const responseData of perResponseData) {
      const localIdx = responseData.response_index - 1; // 0-indexed within chunk
      const globalIdx = ci * CHUNK_SIZE + localIdx;
      const promptId = responseItems[globalIdx]?.promptId || null;

      const entities = responseData.entities || [];
      const N = entities.length;

      // Per-prompt tracking
      if (promptId) {
        if (!perPromptMap[promptId]) {
          perPromptMap[promptId] = { entityKeys: new Set(), numRuns: 0, totalMentions: 0 };
        }
        perPromptMap[promptId].numRuns++;
        perPromptMap[promptId].totalMentions += N;
        for (const entity of entities) {
          perPromptMap[promptId].entityKeys.add(entity.name.toLowerCase());
        }
      }

      // Global entity map
      for (const entity of entities) {
        const K = entity.rank;
        const posScore = N > 1 ? (N - K) / N : (N === 1 ? 1.0 : 0);
        const key = entity.name.toLowerCase();
        if (!entityMap[key]) {
          entityMap[key] = { name: entity.name, mentions: 0, position_score_sum: 0 };
        }
        entityMap[key].mentions += 1;
        entityMap[key].position_score_sum += posScore;
      }
    }
  }

  // Build per-prompt stats
  const perPromptStats = {};
  for (const [promptId, data] of Object.entries(perPromptMap)) {
    const uniqueEntities = data.entityKeys.size;
    const avgEntityMentionRate = uniqueEntities > 0 && data.numRuns > 0
      ? parseFloat((data.totalMentions / (uniqueEntities * data.numRuns)).toFixed(4))
      : 0;
    perPromptStats[promptId] = {
      num_runs: data.numRuns,
      unique_entities: uniqueEntities,
      total_entity_mentions: data.totalMentions,
      avg_entity_mention_rate: avgEntityMentionRate,
      entity_names: [...data.entityKeys], // needed for true cross-provider union
    };
  }

  const rawEntities = Object.values(entityMap);

  if (rawEntities.length === 0) {
    console.log('   ⚠️  No entities found for ' + label);
    return {
      entities: [],
      total_mentions: 0,
      total_responses: totalResponses,
      calculated_at: new Date().toISOString(),
      per_prompt_stats: Object.keys(perPromptStats).length > 0 ? perPromptStats : null,
    };
  }

  const categorized = categorizeEntities(rawEntities, brandName, competitorNames);
  const merged = mergeEntities(categorized);
  const totalMentions = merged.reduce((sum, e) => sum + e.mentions, 0);

  merged.forEach(e => {
    const pct = totalMentions > 0 ? ((e.mentions / totalMentions) * 100).toFixed(1) : '0.0';
    const posImpact = totalResponses > 0 ? (e.position_score_sum / totalResponses * 100).toFixed(1) : '0.0';
    console.log('     [' + e.type + '] ' + e.name + ': ' + e.mentions + ' mentions (' + pct + '%), pos_impact=' + posImpact + '%');
  });

  return {
    entities: merged.map(e => ({
      name: e.name,
      mentions: e.mentions,
      type: e.type,
      position_score_sum: parseFloat((e.position_score_sum || 0).toFixed(4)),
    })),
    total_mentions: totalMentions,
    total_responses: totalResponses,
    calculated_at: new Date().toISOString(),
    per_prompt_stats: Object.keys(perPromptStats).length > 0 ? perPromptStats : null,
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

    // 4. Load all prompt results — include brand_prompt_id for per-prompt entity stats
    console.log('\n📝 Loading prompt results (all providers)...');
    const { data: promptResults, error: promptError } = await supabase
      .from('prompt_results')
      .select('id, brand_prompt_id, provider, chatgpt_response, google_ai_overview_response, claude_response, perplexity_response')
      .eq('daily_report_id', dailyReportId);

    if (promptError) {
      throw new Error('Failed to fetch prompt results: ' + promptError.message);
    }

    console.log('✅ Loaded ' + (promptResults || []).length + ' results');

    // 5. Group response items by provider — keep promptId alongside text
    const byProvider = {};

    for (const result of (promptResults || [])) {
      const provider = result.provider;
      const responseCol = PROVIDER_RESPONSE_COLUMNS[provider];
      const text = responseCol ? result[responseCol] : null;

      if (!text || !text.trim()) continue;

      if (!byProvider[provider]) byProvider[provider] = [];
      byProvider[provider].push({ text: text.trim(), promptId: result.brand_prompt_id || null });
    }

    const activeProviders = Object.keys(byProvider);
    console.log('Active providers: ' + activeProviders.map(p => p + '(' + byProvider[p].length + ')').join(', '));

    if (activeProviders.length === 0) {
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

    // 7. Build combined SoV by merging per-provider results
    console.log('\n🔢 Building combined SoV by merging per-provider results...');
    const mergedMap = {};
    let totalResponsesSum = 0;

    for (const provSov of Object.values(shareOfVoiceByProvider)) {
      totalResponsesSum += provSov.total_responses || 0;
      for (const entity of provSov.entities) {
        const key = entity.name.toLowerCase();
        if (mergedMap[key]) {
          mergedMap[key].mentions += entity.mentions;
          mergedMap[key].position_score_sum = (mergedMap[key].position_score_sum || 0) + (entity.position_score_sum || 0);
        } else {
          mergedMap[key] = { ...entity };
        }
      }
    }

    const mergedEntities = Object.values(mergedMap).sort((a, b) => b.mentions - a.mentions);
    const mergedTotal = mergedEntities.reduce((sum, e) => sum + e.mentions, 0);

    const combinedSov = mergedTotal > 0
      ? {
          entities: mergedEntities,
          total_mentions: mergedTotal,
          total_responses: totalResponsesSum,
          calculated_at: new Date().toISOString(),
        }
      : null;

    if (!combinedSov) {
      return { success: true, message: 'No entities found', totalMentions: 0 };
    }

    mergedEntities.forEach(e => {
      const pct = ((e.mentions / mergedTotal) * 100).toFixed(1);
      const posImpact = totalResponsesSum > 0 ? ((e.position_score_sum || 0) / totalResponsesSum * 100).toFixed(1) : '0.0';
      console.log('  [' + e.type + '] ' + e.name + ': ' + e.mentions + ' (' + pct + '%), pos_impact=' + posImpact + '%');
    });

    // 7b. Merge per-prompt entity stats across providers
    // Use true union of entity names across providers (not average) to avoid always getting rate=1.0
    console.log('\n📊 Merging per-prompt entity stats...');
    const mergedPerPromptMap = {};
    for (const provSov of Object.values(shareOfVoiceByProvider)) {
      if (!provSov.per_prompt_stats) continue;
      for (const [promptId, stats] of Object.entries(provSov.per_prompt_stats)) {
        if (!mergedPerPromptMap[promptId]) {
          mergedPerPromptMap[promptId] = { totalMentions: 0, totalRuns: 0, entityNamesSet: new Set() };
        }
        mergedPerPromptMap[promptId].totalMentions += stats.total_entity_mentions || 0;
        mergedPerPromptMap[promptId].totalRuns += stats.num_runs || 0;
        for (const name of (stats.entity_names || [])) {
          mergedPerPromptMap[promptId].entityNamesSet.add(name);
        }
      }
    }

    const perPromptEntityStats = {};
    for (const [promptId, data] of Object.entries(mergedPerPromptMap)) {
      const trueUniqueEntities = data.entityNamesSet.size;
      const avgEntityMentionRate = trueUniqueEntities > 0 && data.totalRuns > 0
        ? parseFloat((data.totalMentions / (trueUniqueEntities * data.totalRuns)).toFixed(4))
        : 0;
      perPromptEntityStats[promptId] = {
        num_runs: data.totalRuns,
        avg_entity_mention_rate: avgEntityMentionRate,
      };
      console.log('  Prompt ' + promptId.slice(0, 8) + ': ' + trueUniqueEntities + ' unique entities, ' + data.totalRuns + ' runs, avg_mention_rate=' + avgEntityMentionRate);
    }
    console.log('  Per-prompt stats computed for ' + Object.keys(perPromptEntityStats).length + ' prompts');

    // 8. Save SoV data + per-prompt entity stats
    console.log('\n💾 Saving SoV data...');
    const { error: updateError } = await supabase
      .from('daily_reports')
      .update({
        share_of_voice_data: combinedSov,
        share_of_voice_by_provider: shareOfVoiceByProvider,
        per_prompt_entity_stats: Object.keys(perPromptEntityStats).length > 0 ? perPromptEntityStats : null,
      })
      .eq('id', dailyReportId);

    if (updateError) {
      throw new Error('Failed to save SoV data: ' + updateError.message);
    }

    console.log('✅ Saved share_of_voice_data, share_of_voice_by_provider, per_prompt_entity_stats');

    // 9. Summary
    const brandEntity = combinedSov.entities.find(e => e.type === 'brand');
    const brandShare = combinedSov.total_mentions > 0
      ? ((brandEntity?.mentions || 0) / combinedSov.total_mentions * 100).toFixed(1)
      : '0.0';

    console.log('\n' + '='.repeat(70));
    console.log('📊 SUMMARY');
    console.log('  Combined: ' + combinedSov.entities.length + ' entities, ' + combinedSov.total_mentions + ' mentions, brand=' + brandShare + '%');
    console.log('  Total responses analyzed: ' + totalResponsesSum);
    activeProviders.forEach(p => {
      const d = shareOfVoiceByProvider[p];
      if (d) console.log('  ' + p + ': ' + d.entities.length + ' entities, ' + d.total_mentions + ' mentions, ' + d.total_responses + ' responses');
    });
    console.log('='.repeat(70) + '\n');

    return {
      success: true,
      totalEntities: combinedSov.entities.length,
      totalMentions: combinedSov.total_mentions,
      totalResponses: totalResponsesSum,
      brandShare: parseFloat(brandShare),
      providers: activeProviders,
    };

  } catch (error) {
    console.error('\n❌ SHARE OF VOICE CALCULATION FAILED');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    return { success: false, error: error.message };
  }
}

module.exports = {
  calculateShareOfVoice,
};
