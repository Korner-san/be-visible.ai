#!/usr/bin/env node
/**
 * Re-classify Nov 16 URLs using the proper classification system
 * This fixes the issue where all URLs were marked as "OTHER"
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://tzfvtofjcvpddqfgxdtn.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const openaiApiKey = process.env.OPENAI_API_KEY;

if (!supabaseKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY is required');
  process.exit(1);
}

if (!openaiApiKey) {
  console.error('❌ OPENAI_API_KEY is required');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const openai = new OpenAI({ apiKey: openaiApiKey });

// Content classification categories (matching the old system)
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

/**
 * Classify URL content in batches using ChatGPT
 */
async function classifyUrlContentBatch(inputs) {
  if (inputs.length === 0) return [];

  console.log(`🤖 [CONTENT CLASSIFIER] Classifying ${inputs.length} URLs using ChatGPT...`);
  
  const results = [];
  const batchSize = 10; // Process 10 URLs at a time
  
  for (let i = 0; i < inputs.length; i += batchSize) {
    const batch = inputs.slice(i, i + batchSize);
    console.log(`🤖 [CONTENT CLASSIFIER] Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(inputs.length / batchSize)} (${batch.length} URLs)`);
    
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
      console.log(`✅ [CONTENT CLASSIFIER] Batch ${Math.floor(i / batchSize) + 1} complete`);
      
      // Add delay between batches to avoid rate limiting
      if (i + batchSize < inputs.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
    } catch (error) {
      console.error(`❌ [CONTENT CLASSIFIER] Error processing batch:`, error);
      
      // Use fallback classification for failed batch
      batch.forEach(() => {
        results.push(createDefaultClassification());
      });
    }
  }
  
  console.log(`✅ [CONTENT CLASSIFIER] Classification complete for ${results.length} URLs`);
  return results;
}

/**
 * Build classification prompt for a batch of URLs
 */
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
    prompt += `Description: ${input.description.substring(0, 300)}\n`;
    prompt += `Content Snippet: ${input.contentSnippet.substring(0, 800)}\n\n`;
  });
  
  prompt += `\n\nRespond with a JSON object containing a "classifications" array:\n`;
  prompt += `{\n`;
  prompt += `  "classifications": [\n`;
  prompt += `    {\n`;
  prompt += `      "url": "<URL>",\n`;
  prompt += `      "category": "<CATEGORY_KEY>",\n`;
  prompt += `      "scores": {\n`;
  prompt += `        "OFFICIAL_DOCS": 0.00,\n`;
  prompt += `        "HOW_TO_GUIDE": 0.00,\n`;
  prompt += `        "COMPARISON_ANALYSIS": 0.00,\n`;
  prompt += `        "PRODUCT_PAGE": 0.00,\n`;
  prompt += `        "THOUGHT_LEADERSHIP": 0.00,\n`;
  prompt += `        "CASE_STUDY": 0.00,\n`;
  prompt += `        "TECHNICAL_DEEP_DIVE": 0.00,\n`;
  prompt += `        "NEWS_ANNOUNCEMENT": 0.00,\n`;
  prompt += `        "COMMUNITY_DISCUSSION": 0.00,\n`;
  prompt += `        "VIDEO_CONTENT": 0.00,\n`;
  prompt += `        "OTHER_LOW_CONFIDENCE": 0.00\n`;
  prompt += `      }\n`;
  prompt += `    }\n`;
  prompt += `  ]\n`;
  prompt += `}\n`;
  
  return prompt;
}

/**
 * Parse classification response from ChatGPT
 */
function parseClassificationResponse(response, expectedCount) {
  const results = [];
  
  try {
    const parsed = JSON.parse(response);
    const classifications = parsed.classifications || [];
    
    for (let i = 0; i < expectedCount; i++) {
      const classification = classifications[i];
      
      if (classification && classification.category && classification.scores) {
        // Get the highest scoring category
        const scores = classification.scores;
        const scoreEntries = Object.entries(scores);
        const maxEntry = scoreEntries.reduce((max, curr) => 
          curr[1] > max[1] ? curr : max
        );
        
        const [topCategory, topScore] = maxEntry;
        
        // Apply OTHER_LOW_CONFIDENCE rule
        let finalCategory = topCategory;
        if (topCategory !== 'OTHER_LOW_CONFIDENCE' && topScore < 0.45) {
          const otherCategories = scoreEntries.filter(([cat]) => cat !== 'OTHER_LOW_CONFIDENCE');
          const maxOtherScore = Math.max(...otherCategories.map(([, score]) => score));
          
          if (maxOtherScore < 0.45) {
            finalCategory = 'OTHER_LOW_CONFIDENCE';
          }
        }
        
        results.push({
          content_structure_category: finalCategory,
          confidence: topScore,
          scores: scores
        });
      } else {
        results.push(createDefaultClassification());
      }
    }
    
    // Fill in any missing results
    while (results.length < expectedCount) {
      results.push(createDefaultClassification());
    }
    
  } catch (error) {
    console.error('❌ [CONTENT CLASSIFIER] Failed to parse JSON response:', error);
    
    // Return default classifications for all URLs
    for (let i = 0; i < expectedCount; i++) {
      results.push(createDefaultClassification());
    }
  }
  
  return results;
}

/**
 * Create a default classification result
 */
function createDefaultClassification() {
  return {
    content_structure_category: 'OTHER_LOW_CONFIDENCE',
    confidence: 0.5,
    scores: {
      OFFICIAL_DOCS: 0.0,
      HOW_TO_GUIDE: 0.0,
      COMPARISON_ANALYSIS: 0.0,
      PRODUCT_PAGE: 0.0,
      THOUGHT_LEADERSHIP: 0.0,
      CASE_STUDY: 0.0,
      TECHNICAL_DEEP_DIVE: 0.0,
      NEWS_ANNOUNCEMENT: 0.0,
      COMMUNITY_DISCUSSION: 0.0,
      VIDEO_CONTENT: 0.0,
      OTHER_LOW_CONFIDENCE: 0.5
    }
  };
}

// Main reclassification function
async function reclassifyNov16Citations() {
  console.log('\n🔄 [RECLASSIFY] Starting re-classification of Nov 16 URLs...\n');
  
  try {
    // Step 1: Get all Nov 16 URLs that need reclassification
    const { data: urlData, error } = await supabase
      .from('url_content_facts')
      .select(`
        id,
        url_id,
        title,
        description,
        content_snippet,
        content_structure_category,
        url_inventory(url, domain)
      `)
      .eq('classifier_version', 'v1-chatgpt');
    
    if (error) {
      throw new Error(`Failed to fetch URLs: ${error.message}`);
    }
    
    if (!urlData || urlData.length === 0) {
      console.log('✅ No URLs need reclassification');
      return;
    }
    
    console.log(`📊 Found ${urlData.length} URLs to reclassify\n`);
    
    // Step 2: Prepare classification inputs
    const classificationInputs = urlData
      .filter(u => u.url_inventory && u.url_inventory.url)
      .map(u => {
        return {
          factId: u.id,
          urlId: u.url_id,
          url: u.url_inventory.url,
          title: u.title || '',
          description: u.description || '',
          contentSnippet: u.content_snippet || ''
        };
      });
    
    console.log(`🤖 Classifying ${classificationInputs.length} URLs using proper system...\n`);
    
    // Step 3: Classify using the proper classifier
    const classifications = await classifyUrlContentBatch(classificationInputs);
    
    // Step 4: Update database with new classifications
    let updateCount = 0;
    for (let i = 0; i < classificationInputs.length; i++) {
      const input = classificationInputs[i];
      const classification = classifications[i];
      
      if (!classification) continue;
      
      const { error: updateError } = await supabase
        .from('url_content_facts')
        .update({
          content_structure_category: classification.content_structure_category,
          classification_confidence: classification.confidence,
          classifier_version: 'v1',
          classified_at: new Date().toISOString()
        })
        .eq('id', input.factId);
      
      if (updateError) {
        console.error(`⚠️  Error updating ${input.url}:`, updateError.message);
      } else {
        updateCount++;
        console.log(`✅ [${i + 1}/${classificationInputs.length}] ${input.url.substring(0, 60)}... → ${classification.content_structure_category}`);
      }
    }
    
    console.log(`\n✅ [RECLASSIFY] Successfully reclassified ${updateCount}/${classificationInputs.length} URLs`);
    
    // Step 5: Show category distribution
    const categoryStats = classifications.reduce((acc, c) => {
      acc[c.content_structure_category] = (acc[c.content_structure_category] || 0) + 1;
      return acc;
    }, {});
    
    console.log('\n📊 Category Distribution:');
    Object.entries(categoryStats)
      .sort((a, b) => b[1] - a[1])
      .forEach(([category, count]) => {
        console.log(`   ${category}: ${count}`);
      });
    
  } catch (error) {
    console.error('\n❌ [RECLASSIFY] Error:', error);
    throw error;
  }
}

// Run reclassification
reclassifyNov16Citations()
  .then(() => {
    console.log('\n✅ Reclassification complete!\n');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Reclassification failed:', error);
    process.exit(1);
  });

