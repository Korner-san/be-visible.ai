/**
 * Content Classifier
 * Uses ChatGPT to classify URL content into categories
 */

import OpenAI from 'openai'

interface ClassificationInput {
  url: string
  title: string
  description: string
  contentSnippet: string
}

interface CategoryScores {
  OFFICIAL_DOCS: number
  HOW_TO_GUIDE: number
  COMPARISON_ANALYSIS: number
  PRODUCT_PAGE: number
  THOUGHT_LEADERSHIP: number
  CASE_STUDY: number
  TECHNICAL_DEEP_DIVE: number
  NEWS_ANNOUNCEMENT: number
  COMMUNITY_DISCUSSION: number
  VIDEO_CONTENT: number
  OTHER_LOW_CONFIDENCE: number
}

interface ClassificationResult {
  content_structure_category: string
  confidence: number
  scores: CategoryScores
}

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
} as const

type ContentCategory = keyof typeof CONTENT_CATEGORIES

/**
 * Classify URL content in batches using ChatGPT
 */
export const classifyUrlContentBatch = async (inputs: ClassificationInput[]): Promise<ClassificationResult[]> => {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured')
  }

  if (inputs.length === 0) {
    return []
  }

  console.log(`🤖 [CONTENT CLASSIFIER] Classifying ${inputs.length} URLs using ChatGPT...`)
  
  const openai = new OpenAI({ apiKey })
  const results: ClassificationResult[] = []
  const batchSize = 10 // Process 10 URLs at a time
  
  for (let i = 0; i < inputs.length; i += batchSize) {
    const batch = inputs.slice(i, i + batchSize)
    console.log(`🤖 [CONTENT CLASSIFIER] Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(inputs.length / batchSize)} (${batch.length} URLs)`)
    
    try {
      const prompt = buildClassificationPrompt(batch)
      
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
      })
      
      const classification = response.choices[0]?.message?.content || ''
      const batchResults = parseClassificationResponse(classification, batch.length)
      
      results.push(...batchResults)
      console.log(`✅ [CONTENT CLASSIFIER] Batch ${Math.floor(i / batchSize) + 1} complete`)
      
      // Add delay between batches to avoid rate limiting
      if (i + batchSize < inputs.length) {
        await new Promise(resolve => setTimeout(resolve, 500))
      }
      
    } catch (error) {
      console.error(`❌ [CONTENT CLASSIFIER] Error processing batch:`, error)
      
      // Use fallback classification for failed batch
      batch.forEach(() => {
        results.push(createDefaultClassification())
      })
    }
  }
  
  console.log(`✅ [CONTENT CLASSIFIER] Classification complete for ${results.length} URLs`)
  return results
}

/**
 * Build classification prompt for a batch of URLs
 */
const buildClassificationPrompt = (batch: ClassificationInput[]): string => {
  let prompt = `Here are the allowed categories (with definitions):\n\n`
  
  Object.entries(CONTENT_CATEGORIES).forEach(([key, definition], index) => {
    prompt += `${index + 1}. ${key} — ${definition}\n`
  })
  
  prompt += `\n\nFor each URL below, evaluate and score ALL categories from 0.00 to 1.00 based on:\n`
  prompt += `- Title and meta description\n`
  prompt += `- Content summary and writing style\n`
  prompt += `- Intent (educate? persuade? compare? narrate?)\n\n`
  
  prompt += `Choose the category with the HIGHEST score.\n`
  prompt += `Use OTHER_LOW_CONFIDENCE ONLY if all other categories score below 0.45.\n\n`
  
  prompt += `URLs to classify:\n\n`
  
  batch.forEach((input, index) => {
    prompt += `URL ${index + 1}:\n`
    prompt += `URL: ${input.url}\n`
    prompt += `Title: ${input.title}\n`
    prompt += `Description: ${input.description.substring(0, 300)}\n`
    prompt += `Content Snippet: ${input.contentSnippet.substring(0, 800)}\n\n`
  })
  
  prompt += `\n\nRespond with a JSON object containing a "classifications" array:\n`
  prompt += `{\n`
  prompt += `  "classifications": [\n`
  prompt += `    {\n`
  prompt += `      "url": "<URL>",\n`
  prompt += `      "category": "<CATEGORY_KEY>",\n`
  prompt += `      "scores": {\n`
  prompt += `        "OFFICIAL_DOCS": 0.00,\n`
  prompt += `        "HOW_TO_GUIDE": 0.00,\n`
  prompt += `        "COMPARISON_ANALYSIS": 0.00,\n`
  prompt += `        "PRODUCT_PAGE": 0.00,\n`
  prompt += `        "THOUGHT_LEADERSHIP": 0.00,\n`
  prompt += `        "CASE_STUDY": 0.00,\n`
  prompt += `        "TECHNICAL_DEEP_DIVE": 0.00,\n`
  prompt += `        "NEWS_ANNOUNCEMENT": 0.00,\n`
  prompt += `        "COMMUNITY_DISCUSSION": 0.00,\n`
  prompt += `        "VIDEO_CONTENT": 0.00,\n`
  prompt += `        "OTHER_LOW_CONFIDENCE": 0.00\n`
  prompt += `      }\n`
  prompt += `    }\n`
  prompt += `  ]\n`
  prompt += `}\n`
  
  return prompt
}

/**
 * Parse classification response from ChatGPT (JSON format)
 */
const parseClassificationResponse = (response: string, expectedCount: number): ClassificationResult[] => {
  const results: ClassificationResult[] = []
  
  try {
    const parsed = JSON.parse(response)
    const classifications = parsed.classifications || []
    
    for (let i = 0; i < expectedCount; i++) {
      const classification = classifications[i]
      
      if (classification && classification.category && classification.scores) {
        // Get the highest scoring category
        const scores = classification.scores as CategoryScores
        const scoreEntries = Object.entries(scores) as [ContentCategory, number][]
        const maxEntry = scoreEntries.reduce((max, curr) => 
          curr[1] > max[1] ? curr : max
        )
        
        const [topCategory, topScore] = maxEntry
        
        // Apply OTHER_LOW_CONFIDENCE rule
        let finalCategory = topCategory
        if (topCategory !== 'OTHER_LOW_CONFIDENCE' && topScore < 0.45) {
          // Check if OTHER_LOW_CONFIDENCE is available
          const otherCategories = scoreEntries.filter(([cat]) => cat !== 'OTHER_LOW_CONFIDENCE')
          const maxOtherScore = Math.max(...otherCategories.map(([, score]) => score))
          
          if (maxOtherScore < 0.45) {
            finalCategory = 'OTHER_LOW_CONFIDENCE'
          }
        }
        
        results.push({
          content_structure_category: finalCategory,
          confidence: topScore,
          scores: scores
        })
      } else {
        // Fallback if classification data is malformed
        results.push(createDefaultClassification())
      }
    }
    
    // Fill in any missing results
    while (results.length < expectedCount) {
      results.push(createDefaultClassification())
    }
    
  } catch (error) {
    console.error('❌ [CONTENT CLASSIFIER] Failed to parse JSON response:', error)
    
    // Return default classifications for all URLs
    for (let i = 0; i < expectedCount; i++) {
      results.push(createDefaultClassification())
    }
  }
  
  return results
}

/**
 * Create a default classification result
 */
const createDefaultClassification = (): ClassificationResult => {
  const defaultScores: CategoryScores = {
    OFFICIAL_DOCS: 0.5,
    HOW_TO_GUIDE: 0.0,
    COMPARISON_ANALYSIS: 0.0,
    PRODUCT_PAGE: 0.0,
    THOUGHT_LEADERSHIP: 0.0,
    CASE_STUDY: 0.0,
    TECHNICAL_DEEP_DIVE: 0.0,
    NEWS_ANNOUNCEMENT: 0.0,
    COMMUNITY_DISCUSSION: 0.0,
    VIDEO_CONTENT: 0.0,
    OTHER_LOW_CONFIDENCE: 0.0
  }
  
  return {
    content_structure_category: 'OFFICIAL_DOCS',
    confidence: 0.5,
    scores: defaultScores
  }
}


