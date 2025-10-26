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

interface ClassificationResult {
  content_structure_category: string
  confidence?: number
}

const CONTENT_CATEGORIES = [
  'OFFICIAL_DOCUMENTATION',
  'TUTORIAL',
  'COMPARISON_REVIEW',
  'BLOG_POST',
  'NEWS_ARTICLE',
  'FORUM_DISCUSSION',
  'SOCIAL_MEDIA',
  'VIDEO_CONTENT',
  'ACADEMIC_RESEARCH',
  'OTHER'
]

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
            content: 'You are a content classification expert. Classify web content into predefined categories based on URL, title, and content snippet.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.2,
        max_tokens: 500
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
        results.push({
          content_structure_category: 'OFFICIAL_DOCUMENTATION',
          confidence: 0.5
        })
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
  const categoriesList = CONTENT_CATEGORIES.join(', ')
  
  let prompt = `Classify the following web content into one of these categories: ${categoriesList}\n\n`
  prompt += `For each URL, respond with just the category name on a single line.\n\n`
  
  batch.forEach((input, index) => {
    prompt += `URL ${index + 1}:\n`
    prompt += `URL: ${input.url}\n`
    prompt += `Title: ${input.title}\n`
    prompt += `Description: ${input.description.substring(0, 200)}\n`
    prompt += `Content Snippet: ${input.contentSnippet.substring(0, 300)}\n\n`
  })
  
  prompt += `\nRespond with exactly ${batch.length} lines, one category per line:`
  
  return prompt
}

/**
 * Parse classification response from ChatGPT
 */
const parseClassificationResponse = (response: string, expectedCount: number): ClassificationResult[] => {
  const lines = response.split('\n').filter(line => line.trim().length > 0)
  const results: ClassificationResult[] = []
  
  for (let i = 0; i < expectedCount; i++) {
    const line = lines[i]?.trim().toUpperCase() || ''
    
    // Find matching category
    let category = 'OFFICIAL_DOCUMENTATION' // Default
    for (const cat of CONTENT_CATEGORIES) {
      if (line.includes(cat)) {
        category = cat
        break
      }
    }
    
    results.push({
      content_structure_category: category,
      confidence: 0.8
    })
  }
  
  return results
}


