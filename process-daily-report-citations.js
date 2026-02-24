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

// ========== MAIN FUNCTION ==========
async function processDailyReportCitations(dailyReportId) {
  console.log(`\n🔍 [PROCESSOR] Starting citation processing for daily report: ${dailyReportId}\n`);
  
  try {
    // Mark URL processing as started
    await updateUrlProcessingStatus(dailyReportId, 'running');
    
    // Step 1: Extract all ChatGPT citations from this report
    const citations = await extractChatGPTCitations(dailyReportId);
    console.log(`📊 [CITATIONS] Found ${citations.length} total citations`);
    
    if (citations.length === 0) {
      await updateUrlProcessingStatus(dailyReportId, 'complete', { total: 0, new: 0, extracted: 0, classified: 0 });
      return { success: true, message: 'No citations to process' };
    }
    
    // Step 2: Deduplicate and categorize URLs
    const { newUrls, existingUrls, needsClassification } = await categorizeUrls(citations);
    console.log(`📊 [DEDUP] ${newUrls.length} new URLs, ${existingUrls.length} existing, ${needsClassification.length} need classification`);
    
    // Step 3: Extract content from new URLs using Tavily
    let extractedCount = 0;
    if (newUrls.length > 0) {
      const extractionResults = await extractUrlsViaTavily(newUrls);
      const successfulExtractions = extractionResults.filter(e => e.success);
      extractedCount = successfulExtractions.length;
      console.log(`✅ [TAVILY] Extracted ${extractedCount}/${newUrls.length} new URLs`);
      
      // Store extracted content
      await storeUrlContent(successfulExtractions, newUrls);
      
      // Update retry counters for failed extractions
      const failedExtractions = extractionResults.filter(e => !e.success);
      await updateRetryCounters(failedExtractions, newUrls);
    }
    
    // Step 4: Classify URLs that need classification
    let classifiedCount = 0;
    if (needsClassification.length > 0) {
      // Get content for classification
      const classificationInputs = await prepareClassificationInputs(needsClassification);
      
      if (classificationInputs.length > 0) {
        const classifications = await classifyUrlContentBatch(classificationInputs);
        classifiedCount = await storeClassifications(classifications, classificationInputs);
        console.log(`🤖 [CLASSIFICATION] Classified ${classifiedCount} URLs`);
      }
    }
    
    // Step 5: Link ALL citations to prompts (including existing URLs)
    const allUrls = [...newUrls, ...existingUrls];
    const linkedCount = await linkCitationsToPrompts(citations, allUrls);
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

// ========== STEP 1: Extract ChatGPT Citations ==========
async function extractChatGPTCitations(dailyReportId) {
  const { data: promptResults, error } = await supabase
    .from('prompt_results')
    .select('id, chatgpt_citations, brand_prompt_id')
    .eq('daily_report_id', dailyReportId)
    .eq('provider', 'chatgpt')
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
          brandPromptId: result.brand_prompt_id
        });
      }
    });
  });
  
  return allCitations;
}

// ========== STEP 2: Categorize URLs ==========
async function categorizeUrls(citations) {
  const uniqueUrls = [...new Set(citations.map(c => c.url))];
  
  // Check existing URLs in database
  const { data: existingUrlsData } = await supabase
    .from('url_inventory')
    .select(`
      id,
      url,
      content_extracted,
      retry_count,
      url_content_facts(id, content_structure_category)
    `)
    .in('url', uniqueUrls);
  
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
      // Brand new URL - needs extraction and classification
      newUrls.push(url);
      needsClassification.push(url);
    } else if (!existing.contentExtracted && existing.retryCount < MAX_RETRIES) {
      // Failed extraction - retry
      newUrls.push(url);
      needsClassification.push(url);
    } else if (existing.contentExtracted && !existing.hasClassification) {
      // Has content but no classification
      needsClassification.push(url);
      existingUrls.push(url);
    } else {
      // Fully processed - just reuse
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
    
    // Update map with newly inserted URLs
    (insertedUrls || []).forEach(u => {
      existingUrlMap.set(u.url, { id: u.id, contentExtracted: false, retryCount: 0, hasClassification: false });
    });
  }
  
  return { newUrls, existingUrls, needsClassification, urlMap: existingUrlMap };
}

// ========== STEP 3: Extract via Tavily ==========
async function extractUrlsViaTavily(urls) {
  if (urls.length === 0) return [];
  
  const results = [];
  const batchSize = 20; // Tavily API limit
  
  for (let i = 0; i < urls.length; i += batchSize) {
    const batch = urls.slice(i, i + batchSize);
    console.log(`🔍 [TAVILY] Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(urls.length/batchSize)} (${batch.length} URLs)`);
    
    try {
      const response = await fetch('https://api.tavily.com/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: tavilyApiKey,
          urls: batch
        })
      });
      
      if (!response.ok) {
        console.error(`❌ [TAVILY] API Error: ${response.status}`);
        batch.forEach(url => results.push({ url, success: false, error: `API error ${response.status}` }));
        continue;
      }
      
      const data = await response.json();
      
      // Process successful extractions
      (data.results || []).forEach(result => {
        results.push({
          url: result.url,
          content: result.raw_content,
          title: extractTitleFromContent(result.raw_content),
          success: true
        });
      });
      
      // Process failed extractions
      (data.failed_results || []).forEach(result => {
        results.push({
          url: result.url,
          success: false,
          error: result.error
        });
      });
      
      if (i + batchSize < urls.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
    } catch (error) {
      console.error(`❌ [TAVILY] Batch error:`, error.message);
      batch.forEach(url => results.push({ url, success: false, error: error.message }));
    }
  }
  
  return results;
}

// ========== STEP 3b: Store URL Content ==========
async function storeUrlContent(extractions, urlList) {
  for (const extraction of extractions) {
    const { data: urlInventory } = await supabase
      .from('url_inventory')
      .select('id')
      .eq('url', extraction.url)
      .single();
    
    if (!urlInventory) continue;
    
    // Store content facts
    await supabase
      .from('url_content_facts')
      .upsert({
        url_id: urlInventory.id,
        title: extraction.title || '',
        description: (extraction.content || '').substring(0, 500),
        raw_content: extraction.content || '',
        content_snippet: (extraction.content || '').substring(0, 2000)
      }, { onConflict: 'url_id' });
    
    // Update url_inventory
    await supabase
      .from('url_inventory')
      .update({
        content_extracted: true,
        content_extracted_at: new Date().toISOString()
      })
      .eq('id', urlInventory.id);
  }
}

// ========== STEP 3c: Update Retry Counters ==========
async function updateRetryCounters(failedExtractions, urlList) {
  for (const failed of failedExtractions) {
    const { data: urlInventory } = await supabase
      .from('url_inventory')
      .select('id, retry_count')
      .eq('url', failed.url)
      .single();
    
    if (!urlInventory) continue;
    
    const newRetryCount = (urlInventory.retry_count || 0) + 1;
    await supabase
      .from('url_inventory')
      .update({
        retry_count: newRetryCount,
        last_retry_at: new Date().toISOString(),
        last_retry_error: failed.error
      })
      .eq('id', urlInventory.id);
    
    if (newRetryCount >= MAX_RETRIES) {
      console.log(`⚠️  ${failed.url} - Max retries (${MAX_RETRIES}) reached`);
    }
  }
}

// ========== STEP 4: Prepare Classification Inputs ==========
async function prepareClassificationInputs(urls) {
  // Batch .in() queries to avoid "Bad Request" (URL too long) when urls > ~100
  const BATCH_SIZE = 100;
  const allRows = [];
  for (let i = 0; i < urls.length; i += BATCH_SIZE) {
    const batch = urls.slice(i, i + BATCH_SIZE);
    const { data: batchData, error } = await supabase
      .from('url_inventory')
      .select(`
        id,
        url,
        url_content_facts(title, description, content_snippet)
      `)
      .in('url', batch)
      .eq('content_extracted', true);
    if (error) {
      console.warn(`⚠️ [CLASSIFICATION] prepareClassificationInputs batch ${Math.floor(i/BATCH_SIZE)+1} error:`, error.message);
    } else {
      allRows.push(...(batchData || []));
    }
  }

  return allRows
    .filter(u => u.url_content_facts && typeof u.url_content_facts === "object")
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

// ========== STEP 4b: Classify URL Content ==========
async function classifyUrlContentBatch(inputs) {
  if (inputs.length === 0) return [];
  
  const results = [];
  const batchSize = 10; // Process 10-15 URLs at a time
  
  for (let i = 0; i < inputs.length; i += batchSize) {
    const batch = inputs.slice(i, i + batchSize);
    console.log(`🤖 [CLASSIFICATION] Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(inputs.length/batchSize)} (${batch.length} URLs)`);
    
    try {
      const prompt = buildClassificationPrompt(batch);
      
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a content classification expert. You classify web pages based on purpose, intent, and informational structure. Always respond with valid JSON array format.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.2,
        max_tokens: 2000,
        response_format: { type: 'json_object' }
      });
      
      const classification = response.choices[0]?.message?.content || '';
      const batchResults = parseClassificationResponse(classification, batch.length);
      results.push(...batchResults);
      
      if (i + batchSize < inputs.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
    } catch (error) {
      console.error(`❌ [CLASSIFICATION] Error:`, error);
      batch.forEach(() => {
        results.push({ content_structure_category: 'OTHER_LOW_CONFIDENCE', confidence: 0.5, scores: {} });
      });
    }
  }
  
  return results;
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
        // Reject OTHER_LOW_CONFIDENCE and use next best category
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
async function linkCitationsToPrompts(citations, urlList) {
  // Batch URL lookups to avoid "fetch failed" errors with large arrays (>250 URLs)
  const BATCH_SIZE = 100;
  const allUrlInventory = [];

  for (let i = 0; i < urlList.length; i += BATCH_SIZE) {
    const batch = urlList.slice(i, i + BATCH_SIZE);
    const { data } = await supabase
      .from('url_inventory')
      .select('id, url')
      .in('url', batch);
    if (data) allUrlInventory.push(...data);
  }

  const urlMap = new Map();
  allUrlInventory.forEach(u => urlMap.set(u.url, u.id));

  const citationRecords = citations.map(citation => {
    const urlId = urlMap.get(citation.url);
    if (!urlId) return null;

    return {
      url_id: urlId,
      prompt_result_id: citation.promptResultId,
      provider: 'chatgpt',
      cited_at: new Date().toISOString()
    };
  }).filter(Boolean);

  if (citationRecords.length === 0) return 0;

  // Use upsert to avoid duplicates
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
  
  // NOTE: Status and completed_at are now set by end-of-day processor Phase 5
  // This function only updates url_processing_status and generated flag
  const { error: updateError } = await supabase
    .from('daily_reports')
    .update({
      generated: true
      // status: 'completed' - removed, handled by end-of-day processor
      // completed_at - removed, handled by end-of-day processor
    })
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

