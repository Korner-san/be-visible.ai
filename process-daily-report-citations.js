#!/usr/bin/env node
/**
 * Unified Daily Report Citation Processor
 * Processes all citations for a daily report: extraction, classification, and linking
 *
 * Features:
 * - Processes entire daily report (all batches together)
 * - Global URL deduplication (reuses existing content)
 * - Retry logic for failed Tavily extractions (max 3 attempts)
 * - Proper 11-category classification system
 * - Per-user citation linking
 *
 * Usage: node process-daily-report-citations.js <daily_report_id>
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://tzfvtofjcvpddqfgxdtn.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const tavilyApiKey = process.env.TAVILY_API_KEY;
const openaiApiKey = process.env.OPENAI_API_KEY;

if (!supabaseKey || !tavilyApiKey || !openaiApiKey) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const openai = new OpenAI({ apiKey: openaiApiKey });

const MAX_RETRIES = 3;

// Content classification categories (11 detailed categories)
const CONTENT_CATEGORIES = {
  OFFICIAL_DOCS: 'Formal structured reference documentation or API instructions',
  HOW_TO_GUIDE: 'Step-by-step instructions teaching how to perform a task or achieve an outcome',
  COMPARISON_ANALYSIS: 'Content comparing products/services, alternatives, or presenting ranked lists',
  PRODUCT_PAGE: 'Landing pages or feature presentations focused on sales, conversion, or product value',
  THOUGHT_LEADERSHIP: 'Expert opinions, industry insight, trend discussion, strategic framing',
  CASE_STUDY: 'Narrative explanation showing how a real organization or person achieved a result',
  TECHNICAL_DEEP_DIVE: 'In-depth technical explanation, architecture design, engineering reasoning',
  NEWS_ANNOUNCEMENT: 'Release notes, product update announcements, company news',
  COMMUNITY_DISCUSSION: 'Informal discussions, Q&A threads, Reddit/HN/SO style content',
  VIDEO_CONTENT: 'Video-first educational or narrative media content',
  OTHER_LOW_CONFIDENCE: 'Use ONLY when all other categories score below 0.45'
};

const REAL_ESTATE_ISRAEL_CONTENT_CATEGORIES = {
  MARKET_ANALYSIS_ARTICLE: 'Analytical article, market review, forecast, transaction analysis, neighborhood analysis, or economic commentary using interpretation or market signals.',
  NEWS_ARTICLE: 'Editorial news coverage reporting a recent event, announcement, market update, regulation, deal, company activity, or published data.',
  LONG_FORM_GUIDE: 'Long-form guide, explainer, how-to article, legal/tax/buyer guide, price guide, or educational walkthrough.',
  HOMEPAGE_COMMERCIAL_GATEWAY: 'Homepage or commercial gateway for a company, agency, developer, investment firm, marketplace, or service provider.',
  SEARCH_LISTINGS_PLATFORM: 'Search/listings platform entry point where users can search, browse, or discover properties, projects, companies, or services.',
  FILTERED_RESULTS_OR_LISTING_INDEX: 'Filtered search results, listing index, project list, inventory page, sold-properties list, or category result page.',
  PROFESSIONAL_DIRECTORY: 'Directory, catalog, ranking, or index of professionals, companies, developers, contractors, brokers, agencies, or investors.',
  OFFICIAL_REPORT_OR_DOCUMENT: 'Official report, PDF, government document, formal filing, legal/regulatory document, or institutional publication.',
  OFFICIAL_PUBLICATION_OR_DATA_INDEX: 'Official publication index, government/statistical portal, data repository, or page listing official datasets/reports.',
  DATA_TABLE_OR_BENCHMARK: 'Data table, benchmark index, ranking table, calculator-like data page, yield table, price table, or comparable structured dataset.',
  OPINION_COLUMN: 'Opinion column, expert viewpoint, commentary, or subjective thought piece.',
  BRANDED_BLOG_OR_COMMERCIAL_ARTICLE: 'Branded blog post, sponsored/commercial article, professional article, marketing-led educational article, or company-authored content.',
  SOCIAL_OR_COMMUNITY_PAGE: 'Social media post, group page, forum discussion, community thread, gated social page, or public social profile content.',
  REFERENCE_ENTRY: 'Dictionary entry, encyclopedia page, glossary definition, wiki/reference page, or general factual reference entry.',
  PROJECT_OR_SERVICE_PAGE: 'Project page, service page, product page, about page, area information page, or commercial offer page that is not primarily a homepage.'
};

const REAL_ESTATE_ISRAEL_CLASSIFIER_VERSION = 'real_estate_israel_content_type_v2';

// ========== MAIN FUNCTION ==========
async function processDailyReportCitations(dailyReportId) {
  console.log(`\n🔍 [PROCESSOR] Starting citation processing for daily report: ${dailyReportId}\n`);

  try {
    const reportContext = await getDailyReportContext(dailyReportId);
    const isRealEstateIsrael = reportContext?.brand?.user_business_type === 'real_estate_israel';
    if (isRealEstateIsrael) {
      console.log(`[REAL ESTATE IL] Brand-specific content type analysis enabled for ${reportContext.brand.name || reportContext.brand.id}`);
    }

    // Mark URL processing as started
    await updateUrlProcessingStatus(dailyReportId, 'running');

    // Step 1: Extract all citations from this report (all providers)
    const citations = await extractAllCitations(dailyReportId);
    console.log(`📊 [CITATIONS] Found ${citations.length} total citations`);

    if (citations.length === 0) {
      await updateUrlProcessingStatus(dailyReportId, 'complete', { total: 0, new: 0, extracted: 0, classified: 0 });
      return { success: true, message: 'No citations to process' };
    }

    // Step 2: Deduplicate and categorize URLs — returns urlMap with integer IDs for all URLs
    const { newUrls, existingUrls, needsClassification, urlMap } = await categorizeUrls(citations);
    console.log(`📊 [DEDUP] ${newUrls.length} new URLs, ${existingUrls.length} existing, ${needsClassification.length} need classification`);

    // Step 3: Extract content from new URLs using Tavily
    let extractedCount = 0;
    if (newUrls.length > 0) {
      const extractionResults = await extractUrlsViaTavily(newUrls);
      const successfulExtractions = extractionResults.filter(e => e.success);
      extractedCount = successfulExtractions.length;
      console.log(`✅ [TAVILY] Extracted ${extractedCount}/${newUrls.length} new URLs`);

      // Store extracted content — bulk upsert (2 queries regardless of URL count)
      await storeUrlContent(successfulExtractions, urlMap);

      // Update retry counters for failed extractions
      const failedExtractions = extractionResults.filter(e => !e.success);
      await updateRetryCounters(failedExtractions, urlMap);
    }

    // Step 4: Classify URLs that need classification
    // Uses integer IDs — works for any URL encoding including Hebrew, special chars
    let classifiedCount = 0;
    if (needsClassification.length > 0) {
      const classificationInputs = await prepareClassificationInputs(needsClassification, urlMap);

      if (classificationInputs.length > 0) {
        const classifications = await classifyUrlContentBatch(classificationInputs);
        classifiedCount = await storeClassifications(classifications, classificationInputs);
        console.log(`🤖 [CLASSIFICATION] Classified ${classifiedCount} URLs`);
      }
    }

    // Step 5: Link ALL citations to prompts — uses urlMap directly, no re-query needed
    if (isRealEstateIsrael) {
      const realEstateClassifiedCount = await classifyRealEstateIsraelOverrides(
        reportContext.brand.id,
        [...new Set(citations.map(c => c.url))],
        urlMap
      );
      console.log(`[REAL ESTATE IL] Stored ${realEstateClassifiedCount} brand-specific content classifications`);
    }

    const linkedCount = await linkCitationsToPrompts(citations, urlMap);
    console.log(`🔗 [LINKING] Linked ${linkedCount} citations to prompts`);

    // Step 6: Mark URL processing as complete
    await updateUrlProcessingStatus(dailyReportId, 'complete', {
      total: citations.length,
      new: newUrls.length,
      extracted: extractedCount,
      classified: classifiedCount
    });

    // Step 7: Check if entire report should be marked complete
    await updateReportCompletionStatus(dailyReportId);

    console.log(`\n✅ [PROCESSOR] Citation processing complete for report ${dailyReportId}`);
    return {
      success: true,
      totalCitations: citations.length,
      newUrls: newUrls.length,
      extracted: extractedCount,
      classified: classifiedCount,
      linked: linkedCount
    };

  } catch (error) {
    console.error(`❌ [PROCESSOR] Error:`, error);
    await updateUrlProcessingStatus(dailyReportId, 'failed', null, error.message);
    throw error;
  }
}

async function getDailyReportContext(dailyReportId) {
  const { data, error } = await supabase
    .from('daily_reports')
    .select('id, brand_id, brands(id, name, user_business_type)')
    .eq('id', dailyReportId)
    .single();

  if (error) {
    console.warn(`[PROCESSOR] Could not load brand context: ${error.message}`);
    return null;
  }

  return {
    id: data.id,
    brandId: data.brand_id,
    brand: Array.isArray(data.brands) ? data.brands[0] : data.brands
  };
}

// ========== STEP 1: Extract Citations (all providers) ==========
async function extractAllCitations(dailyReportId) {
  const { data: promptResults, error } = await supabase
    .from('prompt_results')
    .select('id, provider, chatgpt_citations, brand_prompt_id')
    .eq('daily_report_id', dailyReportId)
    .in('provider_status', ['ok']);

  if (error) {
    throw new Error(`Failed to fetch prompt results: ${error.message}`);
  }

  const allCitations = [];
  (promptResults || []).forEach(result => {
    const citations = result.chatgpt_citations || [];
    citations.forEach(citation => {
      const url = typeof citation === 'string' ? citation : citation.url;
      if (url) {
        allCitations.push({
          url: normalizeUrl(url),
          promptResultId: result.id,
          brandPromptId: result.brand_prompt_id,
          provider: result.provider || 'chatgpt',
        });
      }
    });
  });

  return allCitations;
}

// ========== STEP 2: Categorize URLs ==========
async function categorizeUrls(citations) {
  const uniqueUrls = [...new Set(citations.map(c => c.url))];

  // Check existing URLs in database.
  // Use batches of 50 URL strings — small enough to avoid query-string length issues
  // with Hebrew-encoded or special-character URLs on any brand.
  const URL_LOOKUP_BATCH = 50;
  const existingUrlsData = [];
  for (let i = 0; i < uniqueUrls.length; i += URL_LOOKUP_BATCH) {
    const batch = uniqueUrls.slice(i, i + URL_LOOKUP_BATCH);
    const { data } = await supabase
      .from('url_inventory')
      .select(`
        id,
        url,
        content_extracted,
        retry_count,
        url_content_facts(id, content_structure_category)
      `)
      .in('url', batch);
    if (data) existingUrlsData.push(...data);
  }

  const existingUrlMap = new Map();
  (existingUrlsData || []).forEach(u => {
    existingUrlMap.set(u.url, {
      id: u.id,
      contentExtracted: u.content_extracted,
      retryCount: u.retry_count || 0,
      hasClassification: u.url_content_facts && u.url_content_facts.length > 0 && u.url_content_facts[0].content_structure_category
    });
  });

  const newUrls = [];
  const existingUrls = [];
  const needsClassification = [];

  for (const url of uniqueUrls) {
    const existing = existingUrlMap.get(url);

    if (!existing) {
      newUrls.push(url);
      needsClassification.push(url);
    } else if (!existing.contentExtracted && existing.retryCount < MAX_RETRIES) {
      newUrls.push(url);
      needsClassification.push(url);
    } else if (existing.contentExtracted && !existing.hasClassification) {
      needsClassification.push(url);
      existingUrls.push(url);
    } else {
      existingUrls.push(url);
    }
  }

  // Insert new URLs into inventory
  if (newUrls.length > 0) {
    const { data: insertedUrls } = await supabase
      .from('url_inventory')
      .upsert(
        newUrls.map(url => ({
          url,
          normalized_url: normalizeUrl(url),
          domain: extractDomain(url),
          content_extracted: false
        })),
        { onConflict: 'url' }
      )
      .select('id, url');

    (insertedUrls || []).forEach(u => {
      existingUrlMap.set(u.url, { id: u.id, contentExtracted: false, retryCount: 0, hasClassification: false });
    });
  }

  return { newUrls, existingUrls, needsClassification, urlMap: existingUrlMap };
}

// ========== STEP 3: Extract via Tavily ==========
async function extractUrlsViaTavily(urls) {
  if (urls.length === 0) return [];

  const batchSize = 20;
  const batches = [];
  for (let i = 0; i < urls.length; i += batchSize) batches.push(urls.slice(i, i + batchSize));

  console.log(`🔍 [TAVILY] Firing ${batches.length} batches in parallel (${urls.length} URLs total)`);

  async function extractBatch(batch, batchIndex) {
    try {
      const response = await fetch('https://api.tavily.com/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: tavilyApiKey, urls: batch })
      });

      if (!response.ok) {
        console.error(`❌ [TAVILY] Batch ${batchIndex}: HTTP ${response.status}`);
        return batch.map(url => ({ url, success: false, error: `API error ${response.status}` }));
      }

      const data = await response.json();
      const batchResults = [];

      (data.results || []).forEach(result => {
        batchResults.push({
          url: result.url,
          content: result.raw_content,
          title: extractTitleFromContent(result.raw_content),
          success: true
        });
      });

      (data.failed_results || []).forEach(result => {
        batchResults.push({ url: result.url, success: false, error: result.error });
      });

      console.log(`✅ [TAVILY] Batch ${batchIndex}: ${(data.results || []).length} ok / ${(data.failed_results || []).length} failed`);
      return batchResults;

    } catch (error) {
      console.error(`❌ [TAVILY] Batch ${batchIndex} error:`, error.message);
      return batch.map(url => ({ url, success: false, error: error.message }));
    }
  }

  const batchResults = await Promise.all(batches.map((batch, i) => extractBatch(batch, i + 1)));
  return batchResults.flat();
}

// ========== STEP 3b: Store URL Content — bulk upsert ==========
// Uses urlMap to get IDs directly — no per-URL DB lookups.
// 2 queries total regardless of how many URLs (was 3 queries per URL before).
async function storeUrlContent(extractions, urlMap) {
  const contentFactsRows = [];
  const urlIds = [];

  for (const extraction of extractions) {
    const entry = urlMap.get(extraction.url);
    if (!entry?.id) continue;

    contentFactsRows.push({
      url_id: entry.id,
      title: extraction.title || '',
      description: (extraction.content || '').substring(0, 500),
      raw_content: extraction.content || '',
      content_snippet: (extraction.content || '').substring(0, 2000)
    });
    urlIds.push(entry.id);

    // Update in-memory map so downstream steps see the new state
    entry.contentExtracted = true;
  }

  if (contentFactsRows.length === 0) return;

  // Single bulk upsert for all content
  const { error: upsertErr } = await supabase
    .from('url_content_facts')
    .upsert(contentFactsRows, { onConflict: 'url_id' });
  if (upsertErr) console.warn(`⚠️ [STORE] url_content_facts upsert error: ${upsertErr.message}`);

  // Single bulk update for all inventory flags
  const { error: updateErr } = await supabase
    .from('url_inventory')
    .update({ content_extracted: true, content_extracted_at: new Date().toISOString() })
    .in('id', urlIds);
  if (updateErr) console.warn(`⚠️ [STORE] url_inventory update error: ${updateErr.message}`);
}

// ========== STEP 3c: Update Retry Counters ==========
async function updateRetryCounters(failedExtractions, urlMap) {
  for (const failed of failedExtractions) {
    const entry = urlMap.get(failed.url);
    if (!entry?.id) continue;

    const newRetryCount = (entry.retryCount || 0) + 1;
    await supabase
      .from('url_inventory')
      .update({
        retry_count: newRetryCount,
        last_retry_at: new Date().toISOString(),
        last_retry_error: failed.error
      })
      .eq('id', entry.id);

    entry.retryCount = newRetryCount;

    if (newRetryCount >= MAX_RETRIES) {
      console.log(`⚠️  ${failed.url} - Max retries (${MAX_RETRIES}) reached`);
    }
  }
}

// ========== STEP 4: Prepare Classification Inputs ==========
// Queries by integer ID — works for ALL URLs regardless of encoding
// (Hebrew %D7%..., special chars, commas, parentheses — all safe with integer IDs).
// Includes 3-attempt retry per batch as an additional safety net.
async function prepareClassificationInputs(urls, urlMap) {
  // Convert URL strings → integer IDs using the in-memory map
  const urlsWithIds = urls
    .map(url => ({ url, id: urlMap.get(url)?.id }))
    .filter(u => u.id);

  const ids = urlsWithIds.map(u => u.id);
  const BATCH_SIZE = 100;
  const allRows = [];

  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batchIds = ids.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(ids.length / BATCH_SIZE);

    let success = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const { data, error } = await supabase
        .from('url_inventory')
        .select('id, url, url_content_facts(title, description, content_snippet)')
        .in('id', batchIds)
        .eq('content_extracted', true);

      if (error) {
        console.warn(`⚠️ [CLASSIFICATION] Batch ${batchNum}/${totalBatches} attempt ${attempt} error: ${error.message}`);
        if (attempt < 3) await new Promise(r => setTimeout(r, 2000));
      } else {
        allRows.push(...(data || []));
        success = true;
        break;
      }
    }
    if (!success) {
      console.error(`❌ [CLASSIFICATION] Batch ${batchNum}/${totalBatches} failed after 3 attempts — skipping`);
    }
  }

  return allRows
    .filter(u => u.url_content_facts && typeof u.url_content_facts === 'object')
    .map(u => {
      const facts = u.url_content_facts;
      return {
        urlId: u.id,
        url: u.url,
        title: facts.title || '',
        description: facts.description || '',
        contentSnippet: facts.content_snippet || ''
      };
    });
}

async function classifyRealEstateIsraelOverrides(brandId, urls, urlMap) {
  try {
    const classificationInputs = await prepareClassificationInputs(urls, urlMap);
    if (classificationInputs.length === 0) return 0;

    const urlIds = classificationInputs.map(input => input.urlId);
    const { data: existingOverrides, error: overrideFetchError } = await supabase
      .from('brand_url_content_facts')
      .select('url_id, classifier_version')
      .eq('brand_id', brandId)
      .in('url_id', urlIds);

    if (overrideFetchError) {
      console.warn(`[REAL ESTATE IL] Could not fetch existing overrides: ${overrideFetchError.message}`);
      return 0;
    }

    const existingUrlIds = new Set((existingOverrides || [])
      .filter(row => row.classifier_version === REAL_ESTATE_ISRAEL_CLASSIFIER_VERSION)
      .map(row => row.url_id));
    const inputsNeedingOverride = classificationInputs.filter(input => !existingUrlIds.has(input.urlId));
    if (inputsNeedingOverride.length === 0) return 0;

    const classifications = await classifyRealEstateIsraelContentBatch(inputsNeedingOverride);
    return storeRealEstateIsraelOverrides(brandId, classifications, inputsNeedingOverride);
  } catch (error) {
    console.warn(`[REAL ESTATE IL] Brand-specific classification skipped: ${error.message}`);
    return 0;
  }
}

async function classifyRealEstateIsraelContentBatch(inputs) {
  if (inputs.length === 0) return [];

  const batchSize = 10;
  const batches = [];
  for (let i = 0; i < inputs.length; i += batchSize) batches.push(inputs.slice(i, i + batchSize));

  async function classifyBatch(batch, batchIndex) {
    try {
      const prompt = buildRealEstateIsraelClassificationPrompt(batch);
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You classify web pages by content/page format for Israeli real estate citation analysis. Do not classify by real estate topic. Always respond with valid JSON object format.'
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.15,
        max_tokens: 4000,
        response_format: { type: 'json_object' }
      });

      const classification = response.choices[0]?.message?.content || '';
      const batchResults = parseClassificationResponse(classification, batch.length);
      console.log(`[REAL ESTATE IL] Batch ${batchIndex}: ${batchResults.length} URLs classified`);
      return batchResults;
    } catch (error) {
      console.error(`[REAL ESTATE IL] Batch ${batchIndex} error:`, error.message);
      return batch.map(() => ({ content_structure_category: 'OTHER_LOW_CONFIDENCE', confidence: 0.5, scores: {} }));
    }
  }

  const batchResults = await Promise.all(batches.map((batch, i) => classifyBatch(batch, i + 1)));
  return batchResults.flat();
}

function buildRealEstateIsraelClassificationPrompt(batch) {
  let prompt = `Classify each URL using this Israeli real estate content taxonomy:\n\n`;

  Object.entries(REAL_ESTATE_ISRAEL_CONTENT_CATEGORIES).forEach(([key, definition], index) => {
    prompt += `${index + 1}. ${key} - ${definition}\n`;
  });

  prompt += `\nClassify by WEB PAGE FORMAT, editorial structure, and user intent. Do NOT classify by real estate topic.\n`;
  prompt += `Use Hebrew or English page signals equally. Choose exactly one allowed category key.\n`;
  prompt += `Score every category from 0.00 to 1.00 and choose the highest scoring category.\n\n`;
  prompt += `URLs to classify:\n\n`;

  batch.forEach((input, index) => {
    prompt += `URL ${index + 1}:\n`;
    prompt += `URL: ${input.url}\n`;
    prompt += `Title: ${input.title}\n`;
    prompt += `Description: ${input.description.substring(0, 300)}\n`;
    prompt += `Content Snippet: ${input.contentSnippet.substring(0, 1200)}\n\n`;
  });

  prompt += `Respond with a JSON object containing a "classifications" array with category and scores for each URL.`;
  return prompt;
}

async function storeRealEstateIsraelOverrides(brandId, classifications, inputs) {
  const rows = [];

  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i];
    const classification = classifications[i];
    if (!classification) continue;

    rows.push({
      brand_id: brandId,
      url_id: input.urlId,
      content_structure_category: classification.content_structure_category,
      classification_confidence: classification.confidence,
      classifier_version: REAL_ESTATE_ISRAEL_CLASSIFIER_VERSION,
      classified_at: new Date().toISOString()
    });
  }

  if (rows.length === 0) return 0;

  const { error } = await supabase
    .from('brand_url_content_facts')
    .upsert(rows, { onConflict: 'brand_id,url_id' });

  if (error) {
    console.warn(`[REAL ESTATE IL] Could not store overrides: ${error.message}`);
    return 0;
  }

  return rows.length;
}

// ========== STEP 4b: Classify URL Content ==========
async function classifyUrlContentBatch(inputs) {
  if (inputs.length === 0) return [];

  const batchSize = 10;
  const batches = [];
  for (let i = 0; i < inputs.length; i += batchSize) batches.push(inputs.slice(i, i + batchSize));

  console.log(`🤖 [CLASSIFICATION] Firing ${batches.length} classification batches in parallel (${inputs.length} URLs total)`);

  async function classifyBatch(batch, batchIndex) {
    try {
      const prompt = buildClassificationPrompt(batch);
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a content classification expert. You classify web pages based on purpose, intent, and informational structure. Always respond with valid JSON array format.'
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.2,
        max_tokens: 4000,
        response_format: { type: 'json_object' }
      });

      const classification = response.choices[0]?.message?.content || '';
      const batchResults = parseClassificationResponse(classification, batch.length);
      console.log(`✅ [CLASSIFICATION] Batch ${batchIndex}: ${batchResults.length} URLs classified`);
      return batchResults;

    } catch (error) {
      console.error(`❌ [CLASSIFICATION] Batch ${batchIndex} error:`, error.message);
      return batch.map(() => ({ content_structure_category: 'OTHER_LOW_CONFIDENCE', confidence: 0.5, scores: {} }));
    }
  }

  const batchResults = await Promise.all(batches.map((batch, i) => classifyBatch(batch, i + 1)));
  return batchResults.flat();
}

function buildClassificationPrompt(batch) {
  let prompt = `Here are the allowed categories (with definitions):\n\n`;

  Object.entries(CONTENT_CATEGORIES).forEach(([key, definition], index) => {
    prompt += `${index + 1}. ${key} — ${definition}\n`;
  });

  prompt += `\n\nFor each URL below, evaluate and score ALL categories from 0.00 to 1.00 based on:\n`;
  prompt += `- Title and meta description\n`;
  prompt += `- Content summary and writing style\n`;
  prompt += `- Intent (educate? persuade? compare? narrate?)\n\n`;

  prompt += `You MUST choose the SINGLE BEST category from the 10 options. Do NOT use OTHER_LOW_CONFIDENCE.\n`;
  prompt += `Choose the category that best matches the PRIMARY purpose, even if not 100% confident.\n\n`;

  prompt += `URLs to classify:\n\n`;

  batch.forEach((input, index) => {
    prompt += `URL ${index + 1}:\n`;
    prompt += `URL: ${input.url}\n`;
    prompt += `Title: ${input.title}\n`;
    prompt += `Description: ${input.description.substring(0, 300)}\n`;
    prompt += `Content Snippet: ${input.contentSnippet.substring(0, 800)}\n\n`;
  });

  prompt += `\n\nRespond with a JSON object containing a "classifications" array with category and scores for each URL.\n`;

  return prompt;
}

function parseClassificationResponse(response, expectedCount) {
  const results = [];

  try {
    const parsed = JSON.parse(response);
    const classifications = parsed.classifications || [];

    for (let i = 0; i < expectedCount; i++) {
      const classification = classifications[i];

      if (classification && classification.category && classification.scores) {
        const scores = classification.scores;
        const scoreEntries = Object.entries(scores);
        const maxEntry = scoreEntries.reduce((max, curr) => curr[1] > max[1] ? curr : max);
        const [topCategory, topScore] = maxEntry;

        let finalCategory = topCategory;
        if (topCategory === "OTHER_LOW_CONFIDENCE") {
          const nonOtherEntries = scoreEntries.filter(([cat]) => cat !== "OTHER_LOW_CONFIDENCE");
          if (nonOtherEntries.length > 0) {
            const bestNonOther = nonOtherEntries.reduce((max, curr) => curr[1] > max[1] ? curr : max);
            finalCategory = bestNonOther[0];
          } else {
            finalCategory = "COMPARISON_ANALYSIS";
          }
        }

        results.push({
          content_structure_category: finalCategory,
          confidence: topScore,
          scores: scores
        });
      } else {
        results.push({ content_structure_category: 'OTHER_LOW_CONFIDENCE', confidence: 0.5, scores: {} });
      }
    }

    while (results.length < expectedCount) {
      results.push({ content_structure_category: 'OTHER_LOW_CONFIDENCE', confidence: 0.5, scores: {} });
    }

  } catch (error) {
    console.error('❌ Failed to parse classification response:', error);
    for (let i = 0; i < expectedCount; i++) {
      results.push({ content_structure_category: 'OTHER_LOW_CONFIDENCE', confidence: 0.5, scores: {} });
    }
  }

  return results;
}

// ========== STEP 4c: Store Classifications ==========
async function storeClassifications(classifications, inputs) {
  let count = 0;
  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i];
    const classification = classifications[i];

    if (!classification) continue;

    const { error } = await supabase
      .from('url_content_facts')
      .update({
        content_structure_category: classification.content_structure_category,
        classification_confidence: classification.confidence,
        classifier_version: 'v1',
        classified_at: new Date().toISOString()
      })
      .eq('url_id', input.urlId);

    if (!error) count++;
  }

  return count;
}

// ========== STEP 5: Link Citations to Prompts ==========
// Uses urlMap directly — no re-query needed, works for any URL encoding.
async function linkCitationsToPrompts(citations, urlMap) {
  const seen = new Set();
  const citationRecords = citations.map(citation => {
    const entry = urlMap.get(citation.url);
    if (!entry?.id) return null;
    const key = `${entry.id}|${citation.promptResultId}|${citation.provider || 'chatgpt'}`;
    if (seen.has(key)) return null; // deduplicate within batch
    seen.add(key);
    return {
      url_id: entry.id,
      prompt_result_id: citation.promptResultId,
      provider: citation.provider || 'chatgpt',
      cited_at: new Date().toISOString()
    };
  }).filter(Boolean);

  if (citationRecords.length === 0) return 0;

  const { error } = await supabase
    .from('url_citations')
    .upsert(citationRecords, { onConflict: 'url_id,prompt_result_id,provider' });

  if (error) {
    console.error(`⚠️  Error linking citations:`, error.message);
    return 0;
  }

  return citationRecords.length;
}

// ========== UPDATE STATUS ==========
async function updateUrlProcessingStatus(dailyReportId, status, counts = null, errorMessage = null) {
  const updateData = { url_processing_status: status };

  if (counts) {
    updateData.urls_total = counts.total;
    updateData.urls_extracted = counts.extracted;
    updateData.urls_classified = counts.classified;
  }

  if (errorMessage) {
    updateData.url_processing_error = errorMessage;
  }

  const { error } = await supabase
    .from('daily_reports')
    .update(updateData)
    .eq('id', dailyReportId);

  if (error) {
    console.error(`⚠️  Failed to update URL processing status:`, error.message);
  }
}

async function updateReportCompletionStatus(dailyReportId) {
  const { data: report, error } = await supabase
    .from('daily_reports')
    .select('chatgpt_status, url_processing_status')
    .eq('id', dailyReportId)
    .single();

  if (error || !report) {
    console.error(`⚠️  Failed to fetch report status:`, error?.message);
    return false;
  }

  const isChatGPTComplete = report.chatgpt_status === 'complete';
  const isUrlProcessingComplete = report.url_processing_status === 'complete';
  const shouldMarkComplete = isChatGPTComplete && isUrlProcessingComplete;

  console.log(`🔍 [COMPLETION] Status check:`, {
    chatgpt: report.chatgpt_status,
    urlProcessing: report.url_processing_status,
    shouldMarkComplete
  });

  if (!shouldMarkComplete) {
    console.log(`⏳ [COMPLETION] Report not yet complete (waiting for all phases)`);
    return false;
  }

  const { error: updateError } = await supabase
    .from('daily_reports')
    .update({ generated: true })
    .eq('id', dailyReportId);

  if (updateError) {
    console.error(`⚠️  Failed to update report:`, updateError.message);
    return false;
  }

  console.log(`✅ [COMPLETION] URL processing complete and report generated flag set`);
  return true;
}

// ========== UTILITIES ==========
function normalizeUrl(url) {
  try {
    const urlObj = new URL(url);
    urlObj.hash = '';
    let normalized = urlObj.toString();
    return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
  } catch {
    return url;
  }
}

function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace('www.', '');
  } catch {
    return '';
  }
}

function extractTitleFromContent(content) {
  if (!content) return '';
  const lines = content.split('\n').filter(line => line.trim().length > 0);
  if (lines.length > 0) {
    const firstLine = lines[0].trim();
    if (firstLine.length < 200) return firstLine;
  }
  return content.substring(0, 100).trim();
}

// ========== CLI ENTRY POINT ==========
if (require.main === module) {
  const dailyReportId = process.argv[2];

  if (!dailyReportId) {
    console.error('Usage: node process-daily-report-citations.js <daily_report_id>');
    process.exit(1);
  }

  processDailyReportCitations(dailyReportId)
    .then((result) => {
      console.log('\n✅ [PROCESSOR] Processing complete:', result, '\n');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ [PROCESSOR] Processing failed:', error);
      process.exit(1);
    });
}

module.exports = { processDailyReportCitations };
