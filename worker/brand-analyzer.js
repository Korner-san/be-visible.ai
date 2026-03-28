/**
 * Brand Analyzer Processor
 *
 * RESPONSIBILITY: Analyze brand mentions and sentiment in prompt responses
 *
 * DOES:
 * - Read prompt_results from database (after executor saves raw data)
 * - Analyze brand mentions (find all occurrences)
 * - Compute brand entity rank via GPT-4o-mini (position among other entities in the response)
 * - Calculate sentiment around brand mentions
 * - Find competitor mentions
 * - Update prompt_results with analysis
 *
 * DOES NOT:
 * - Execute prompts (executor's job)
 * - Fetch URL content (citation-fetcher's job)
 * - Classify content (content-classifier's job)
 */

const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Use GPT-4o-mini to extract all company/brand/product entities from a response
 * in the order they first appear, then return brand rank + competitor ranks.
 *
 * Returns { brandRank: number|null, competitorRanks: { name: rank|null } }
 */
async function getAllEntityRanksFromGPT(responseText, brandName, competitorNames = []) {
  try {
    const truncated = responseText.length > 6000
      ? responseText.substring(0, 6000) + '\n[... truncated]'
      : responseText;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You extract company, brand, product, and organization names from text. Always respond with valid JSON only.'
        },
        {
          role: 'user',
          content: `List all company, brand, product, and organization names mentioned in the text below, in the exact order they FIRST appear. Do not include generic terms like "AI", "cloud", or categories. Only named entities.

Return JSON: { "entities": ["Name1", "Name2", "Name3"] }

Text:
${truncated}`
        }
      ],
      temperature: 0,
      max_tokens: 500,
      response_format: { type: 'json_object' }
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) return { brandRank: null, competitorRanks: {} };

    const parsed = JSON.parse(content);
    const entities = parsed.entities || [];

    if (entities.length === 0) return { brandRank: null, competitorRanks: {} };

    const findRank = (name) => {
      const lower = name.toLowerCase();
      for (let i = 0; i < entities.length; i++) {
        const e = (entities[i] || '').toLowerCase();
        if (e === lower || e.includes(lower) || lower.includes(e)) return i + 1;
      }
      return null;
    };

    const brandRank = findRank(brandName);
    const competitorRanks = {};
    for (const comp of competitorNames) {
      competitorRanks[comp] = findRank(comp);
    }

    return { brandRank, competitorRanks };

  } catch (err) {
    console.error('   ⚠️  GPT entity rank failed (non-blocking):', err.message);
    return { brandRank: null, competitorRanks: {} };
  }
}

/**
 * Analyze brand mentions for all results in a daily report
 * Works for all providers: chatgpt, perplexity, google_ai_overview, claude
 */
async function analyzeResults(dailyReportId, providers = ['chatgpt', 'perplexity', 'google_ai_overview', 'claude']) {
  console.log('\n' + '='.repeat(70));
  console.log('🔍 BRAND ANALYZER');
  console.log('='.repeat(70));
  console.log('Daily Report ID: ' + dailyReportId);
  console.log('Providers: ' + providers.join(', '));
  console.log('='.repeat(70) + '\n');

  try {
    // 1. Load brand data
    console.log('📊 Loading brand data...');
    const { data: dailyReport, error: reportError } = await supabase
      .from('daily_reports')
      .select('brand_id')
      .eq('id', dailyReportId)
      .single();

    if (reportError || !dailyReport) {
      throw new Error('Daily report not found: ' + (reportError?.message || 'No data'));
    }

    const { data: brand, error: brandError } = await supabase
      .from('brands')
      .select('name, onboarding_answers')
      .eq('id', dailyReport.brand_id)
      .single();

    if (brandError || !brand) {
      throw new Error('Brand not found: ' + (brandError?.message || 'No data'));
    }

    const brandName = brand.name;
    const competitors = brand.onboarding_answers?.competitors || [];

    console.log('✅ Brand: ' + brandName);
    console.log('✅ Competitors: ' + (competitors.length > 0 ? competitors.join(', ') : 'None'));

    // 2. Load all prompt_results for this report
    console.log('\n🔍 Loading prompt results...');
    const { data: results, error: resultsError } = await supabase
      .from('prompt_results')
      .select('id, chatgpt_response, perplexity_response, google_ai_overview_response, claude_response, provider')
      .eq('daily_report_id', dailyReportId)
      .in('provider', providers)
      .in('provider_status', ['ok']);

    if (resultsError) {
      throw new Error('Failed to fetch results: ' + resultsError.message);
    }

    if (!results || results.length === 0) {
      console.log('⚠️  No successful results found to analyze');
      return { analyzed: 0, brandMentioned: 0, noMention: 0 };
    }

    console.log('✅ Found ' + results.length + ' results to analyze');

    // 3. Analyze each result (brand mention detection — fast, no GPT)
    const analysisMap = {};
    let brandMentioned = 0;
    let noMention = 0;

    for (const result of results) {
      let responseText = '';
      if (result.provider === 'chatgpt') responseText = result.chatgpt_response;
      if (result.provider === 'perplexity') responseText = result.perplexity_response;
      if (result.provider === 'google_ai_overview') responseText = result.google_ai_overview_response;
      if (result.provider === 'claude') responseText = result.claude_response;

      if (!responseText) continue;

      const analysis = analyzeBrandMention(responseText, brandName, competitors);
      analysisMap[result.id] = { analysis, responseText };

      if (analysis.mentioned) brandMentioned++;
      else noMention++;
    }

    // 4. Fire all GPT entity-rank calls in parallel (brand + competitors in one call)
    // Include results where brand OR any competitor is mentioned
    const resultsNeedingRanks = results.filter(r => {
      const entry = analysisMap[r.id];
      if (!entry) return false;
      return entry.analysis.mentioned || entry.analysis.competitorMentions.length > 0;
    });
    console.log(`\n🤖 Computing entity ranks in parallel for ${resultsNeedingRanks.length} results (brand or competitor mentioned)...`);

    const entityRankMap = {};
    const competitorRankMap = {};
    await Promise.all(resultsNeedingRanks.map(async result => {
      const { responseText } = analysisMap[result.id];
      const { brandRank, competitorRanks } = await getAllEntityRanksFromGPT(responseText, brandName, competitors);
      entityRankMap[result.id] = brandRank;
      competitorRankMap[result.id] = competitorRanks;
      console.log('   ' + result.id.substring(0, 8) + ': brand=#' + (brandRank ?? 'null') +
        ', competitors=' + JSON.stringify(competitorRanks));
    }));

    // 5a. Mark no-response rows as brand_mentioned = null (no attempt, excluded from mention rate)
    const noResponseIds = results.filter(r => !analysisMap[r.id]).map(r => r.id);
    if (noResponseIds.length > 0) {
      await supabase
        .from('prompt_results')
        .update({ brand_mentioned: null })
        .in('id', noResponseIds);
      console.log('   ℹ️  Marked ' + noResponseIds.length + ' no-response rows as brand_mentioned=null');
    }

    // 5b. Save analyzed results to DB
    let analyzed = 0;
    for (const result of results) {
      const entry = analysisMap[result.id];
      if (!entry) continue;

      const { analysis } = entry;
      const entityRank = entityRankMap[result.id] ?? null;
      const compRanks = competitorRankMap[result.id] || {};

      // Merge entity_rank into each competitor mention entry
      const competitorMentionDetails = analysis.competitorMentions.map(c => ({
        ...c,
        entity_rank: compRanks[c.name] ?? null
      }));

      const { error: updateError } = await supabase
        .from('prompt_results')
        .update({
          brand_mentioned: analysis.mentioned,
          brand_position: entityRank,
          competitor_mention_details: competitorMentionDetails,
          sentiment_score: analysis.sentiment
        })
        .eq('id', result.id);

      if (updateError) {
        console.error('   ❌ Failed to update result:', updateError.message);
      } else {
        analyzed++;
      }
    }

    console.log('✅ All results saved');

    console.log('\n' + '='.repeat(70));
    console.log('📊 ANALYSIS SUMMARY');
    console.log('='.repeat(70));
    console.log('Total analyzed: ' + analyzed);
    console.log('Brand mentioned: ' + brandMentioned);
    console.log('No mention: ' + noMention);
    console.log('='.repeat(70) + '\n');

    return {
      analyzed,
      brandMentioned,
      noMention
    };

  } catch (error) {
    console.error('\n❌ Brand analysis failed:', error.message);
    throw error;
  }
}

// ============================================================================
// CORE ANALYSIS FUNCTIONS
// ============================================================================

/**
 * Analyze brand mentions in response text
 * Returns: { mentioned, mentionCount, sentiment, competitorMentions }
 * Note: position (entity rank) is computed separately via GPT in analyzeResults()
 */
function analyzeBrandMention(text, brandName, competitors) {
  const lowerText = text.toLowerCase();
  const lowerBrand = brandName.toLowerCase();

  // Find all brand mentions
  const brandMentions = [];
  let index = lowerText.indexOf(lowerBrand);
  while (index !== -1) {
    brandMentions.push(index);
    index = lowerText.indexOf(lowerBrand, index + 1);
  }

  const mentioned = brandMentions.length > 0;

  // Find competitor mentions with positions
  const competitorMentions = competitors.map(competitor => {
    const competitorPositions = [];
    const lowerCompetitor = competitor.toLowerCase();
    let compIndex = lowerText.indexOf(lowerCompetitor);
    while (compIndex !== -1) {
      competitorPositions.push(compIndex);
      compIndex = lowerText.indexOf(lowerCompetitor, compIndex + 1);
    }

    return {
      name: competitor,
      count: competitorPositions.length,
      position: competitorPositions.length > 0 ? competitorPositions[0] : -1,
      portrayalType: 'neutral'
    };
  }).filter(comp => comp.count > 0);

  return {
    mentioned,
    mentionCount: brandMentions.length,
    sentiment: mentioned ? analyzeSentiment(text, brandName) : 0,
    competitorMentions
  };
}

/**
 * Analyze sentiment based on keywords around brand mentions
 * Returns: number from -1 (negative) to 1 (positive)
 */
function analyzeSentiment(text, brandName) {
  const positiveWords = [
    'excellent', 'great', 'amazing', 'outstanding', 'superior',
    'best', 'leading', 'innovative', 'reliable', 'trusted',
    'quality', 'effective', 'successful', 'popular', 'recommended',
    'powerful', 'robust', 'efficient', 'fast', 'secure',
    'professional', 'comprehensive', 'advanced', 'proven', 'top'
  ];

  const negativeWords = [
    'poor', 'bad', 'terrible', 'awful', 'inferior',
    'worst', 'failing', 'unreliable', 'problematic', 'disappointing',
    'ineffective', 'unsuccessful', 'criticized', 'slow', 'buggy',
    'expensive', 'complicated', 'difficult', 'lacking', 'limited'
  ];

  const brandContext = text.toLowerCase();
  const brandIndex = brandContext.indexOf(brandName.toLowerCase());

  if (brandIndex === -1) return 0;

  // Get context around brand mention (100 chars before/after)
  const contextStart = Math.max(0, brandIndex - 100);
  const contextEnd = Math.min(brandContext.length, brandIndex + brandName.length + 100);
  const context = brandContext.substring(contextStart, contextEnd);

  let score = 0;
  positiveWords.forEach(word => {
    if (context.includes(word)) score += 0.1;
  });
  negativeWords.forEach(word => {
    if (context.includes(word)) score -= 0.1;
  });

  // Clamp to [-1, 1]
  return Math.max(-1, Math.min(1, score));
}

module.exports = {
  analyzeResults,
  analyzeBrandMention,
  analyzeSentiment
};
