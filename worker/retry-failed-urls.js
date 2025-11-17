#!/usr/bin/env node
/**
 * Retry Failed URL Extraction and Classification
 * Finds URLs with content_extracted=false and retries them
 * Implements retry limit to avoid infinite loops
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

const MAX_RETRIES = 3; // Cap retries at 3 attempts

// Content classification categories
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

async function retryFailedUrls() {
  console.log('\n🔄 [RETRY] Starting retry of failed URL extractions...\n');
  
  try {
    // Step 1: Find all URLs with content_extracted=false and retry_count < MAX_RETRIES
    const { data: failedUrls, error } = await supabase
      .from('url_inventory')
      .select('id, url, domain, retry_count, last_retry_at')
      .eq('content_extracted', false)
      .or(`retry_count.is.null,retry_count.lt.${MAX_RETRIES}`);
    
    if (error) {
      throw new Error(`Failed to fetch URLs: ${error.message}`);
    }
    
    if (!failedUrls || failedUrls.length === 0) {
      console.log('✅ No failed URLs need retry');
      return { success: true, retried: 0, extracted: 0, classified: 0 };
    }
    
    console.log(`📊 Found ${failedUrls.length} URLs to retry\n`);
    
    // Step 2: Extract content via Tavily
    const extractionResults = await extractUrlsViaTavily(failedUrls.map(u => u.url));
    const successfulExtractions = extractionResults.filter(r => r.success);
    console.log(`✅ [TAVILY] Successfully extracted ${successfulExtractions.length}/${failedUrls.length} URLs\n`);
    
    // Step 3: Classify content via OpenAI
    let classifications = [];
    if (successfulExtractions.length > 0) {
      const classificationInputs = successfulExtractions.map(e => ({
        url: e.url,
        title: e.title || '',
        description: (e.content || '').substring(0, 300),
        contentSnippet: (e.content || '').substring(0, 800)
      }));
      
      classifications = await classifyUrlContentBatch(classificationInputs);
      console.log(`🤖 [OPENAI] Classified ${classifications.length} URLs\n`);
    }
    
    // Step 4: Store results and update retry counters
    let storedCount = 0;
    for (let i = 0; i < successfulExtractions.length; i++) {
      const extraction = successfulExtractions[i];
      const classification = classifications[i] || { content_structure_category: 'OTHER_LOW_CONFIDENCE', confidence: 0.5 };
      const urlInventory = failedUrls.find(u => u.url === extraction.url);
      
      if (!urlInventory) continue;
      
      // Store content facts
      const { error: storeError } = await supabase
        .from('url_content_facts')
        .upsert({
          url_id: urlInventory.id,
          title: extraction.title || '',
          description: (extraction.content || '').substring(0, 500),
          raw_content: extraction.content || '',
          content_snippet: (extraction.content || '').substring(0, 2000),
          content_structure_category: classification.content_structure_category,
          classification_confidence: classification.confidence,
          classifier_version: 'v1'
        }, { onConflict: 'url_id' });
      
      if (storeError) {
        console.error(`⚠️  Error storing ${extraction.url}:`, storeError.message);
        continue;
      }
      
      // Update url_inventory
      await supabase
        .from('url_inventory')
        .update({
          content_extracted: true,
          content_extracted_at: new Date().toISOString(),
          retry_count: (urlInventory.retry_count || 0) + 1,
          last_retry_at: new Date().toISOString()
        })
        .eq('id', urlInventory.id);
      
      storedCount++;
      console.log(`✅ [${i + 1}/${successfulExtractions.length}] ${extraction.url.substring(0, 60)}... → ${classification.content_structure_category}`);
    }
    
    // Step 5: Update retry counter for failed attempts
    const failedExtractions = extractionResults.filter(r => !r.success);
    for (const failed of failedExtractions) {
      const urlInventory = failedUrls.find(u => u.url === failed.url);
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
        console.log(`⚠️  ${failed.url} - Max retries (${MAX_RETRIES}) reached, giving up`);
      } else {
        console.log(`⚠️  ${failed.url} - Retry ${newRetryCount}/${MAX_RETRIES} failed: ${failed.error}`);
      }
    }
    
    console.log(`\n✅ [RETRY] Complete: ${storedCount} URLs extracted and classified`);
    return {
      success: true,
      retried: failedUrls.length,
      extracted: successfulExtractions.length,
      classified: classifications.length,
      failed: failedExtractions.length
    };
    
  } catch (error) {
    console.error('\n❌ [RETRY] Error:', error);
    throw error;
  }
}

// ========== TAVILY EXTRACTION ==========
async function extractUrlsViaTavily(urls) {
  if (urls.length === 0) return [];
  
  const results = [];
  const batchSize = 20;
  
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

// ========== OPENAI CLASSIFICATION ==========
async function classifyUrlContentBatch(inputs) {
  if (inputs.length === 0) return [];
  
  const results = [];
  const batchSize = 10;
  
  for (let i = 0; i < inputs.length; i += batchSize) {
    const batch = inputs.slice(i, i + batchSize);
    
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
      console.error(`❌ [OPENAI] Classification error:`, error);
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
  
  prompt += `Choose the category with the HIGHEST score.\n`;
  prompt += `Use OTHER_LOW_CONFIDENCE ONLY if all other categories score below 0.45.\n\n`;
  
  prompt += `URLs to classify:\n\n`;
  
  batch.forEach((input, index) => {
    prompt += `URL ${index + 1}:\n`;
    prompt += `URL: ${input.url}\n`;
    prompt += `Title: ${input.title}\n`;
    prompt += `Description: ${input.description}\n`;
    prompt += `Content Snippet: ${input.contentSnippet}\n\n`;
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
        if (topCategory !== 'OTHER_LOW_CONFIDENCE' && topScore < 0.45) {
          const otherCategories = scoreEntries.filter(([cat]) => cat !== 'OTHER_LOW_CONFIDENCE');
          const maxOtherScore = Math.max(...otherCategories.map(([, score]) => score));
          if (maxOtherScore < 0.45) finalCategory = 'OTHER_LOW_CONFIDENCE';
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

function extractTitleFromContent(content) {
  if (!content) return '';
  const lines = content.split('\n').filter(line => line.trim().length > 0);
  if (lines.length > 0) {
    const firstLine = lines[0].trim();
    if (firstLine.length < 200) return firstLine;
  }
  return content.substring(0, 100).trim();
}

// Run retry
if (require.main === module) {
  retryFailedUrls()
    .then((result) => {
      console.log('\n✅ Retry complete!', result, '\n');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Retry failed:', error);
      process.exit(1);
    });
}

module.exports = { retryFailedUrls };

