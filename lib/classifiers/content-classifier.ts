/**
 * Content Classification Service
 * Uses ChatGPT to classify prompts and URL content
 */

import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// Prompt Intent Categories
export const PROMPT_INTENT_CATEGORIES = {
  FOUNDATIONAL_AUTHORITY: 'Foundational Authority',
  COMPETITIVE_CONSENSUS: 'Competitive Consensus',
  REAL_TIME_SIGNAL: 'Real-Time Signal',
  COMMUNITY_VALIDATION: 'Community Validation',
  TACTICAL_GUIDE: 'Tactical Guide',
} as const

// Content Structure Categories
export const CONTENT_STRUCTURE_CATEGORIES = {
  DEFINITIVE_QA_BLOCK: 'Definitive Q&A Block',
  ORIGINAL_DATA_STUDY: 'Original Data Study',
  PRODUCT_COMPARISON_MATRIX: 'Product Comparison Matrix',
  NARRATIVE_CASE_STUDY: 'Narrative Case Study',
  OFFICIAL_DOCUMENTATION: 'Official Documentation',
  COMMUNITY_DISCUSSION: 'Community Discussion',
} as const

export type PromptIntentCategory = keyof typeof PROMPT_INTENT_CATEGORIES
export type ContentStructureCategory = keyof typeof CONTENT_STRUCTURE_CATEGORIES

interface PromptIntentResult {
  prompt: string
  intent_category: PromptIntentCategory
}

interface ContentClassificationResult {
  url: string
  content_structure_category: ContentStructureCategory
  domain_role_category: PromptIntentCategory
}

/**
 * Classify multiple prompts' intent in a single API call
 */
export const classifyPromptIntents = async (
  prompts: string[]
): Promise<PromptIntentResult[]> => {
  console.log(`🤖 [CLASSIFIER] Classifying ${prompts.length} prompt intents...`)
  
  const systemPrompt = `You are an expert SEO and Generative Engine Optimization (GEO) analyst. Your task is to analyze a user's research query (prompt) and classify its intent using a specific taxonomy.

**TAXONOMY:**
1. FOUNDATIONAL_AUTHORITY: Queries seeking definitions, history, technical standards, or widely accepted facts.
2. COMPETITIVE_CONSENSUS: Queries comparing products, services, features, or seeking best-in-class recommendations.
3. REAL_TIME_SIGNAL: Queries seeking very recent news, event coverage, or immediate updates.
4. COMMUNITY_VALIDATION: Queries seeking peer advice, troubleshooting solutions, or public sentiment/reviews.
5. TACTICAL_GUIDE: Queries seeking step-by-step instructions, tutorials, or detailed documentation.

**INSTRUCTIONS:**
1. Analyze the following prompts.
2. Assign exactly ONE category from the TAXONOMY to each prompt.
3. Return the results as a single JSON array.

**DESIRED JSON OUTPUT FORMAT:**
[
  {"prompt": "Example prompt text", "intent_category": "REAL_TIME_SIGNAL"},
  {"prompt": "Another prompt", "intent_category": "COMPETITIVE_CONSENSUS"}
]`

  const userPrompt = `**PROMPTS TO ANALYZE:**
${prompts.map((p, i) => `${i + 1}. "${p}"`).join('\n')}

Return only the JSON array, no additional text.`

  try {
    const startTime = Date.now()
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' }
    })

    const responseTime = Date.now() - startTime
    const content = completion.choices[0].message.content || '{}'
    
    console.log(`✅ [CLASSIFIER] Prompt intents classified in ${responseTime}ms`)
    
    // Parse the response - it might be wrapped in an object
    let parsed = JSON.parse(content)
    if (parsed.results) parsed = parsed.results
    if (!Array.isArray(parsed)) {
      // Try to extract array from object
      const keys = Object.keys(parsed)
      if (keys.length > 0 && Array.isArray(parsed[keys[0]])) {
        parsed = parsed[keys[0]]
      }
    }
    
    return parsed as PromptIntentResult[]
  } catch (error: any) {
    console.error('❌ [CLASSIFIER] Prompt intent classification failed:', error.message)
    // Return default classifications
    return prompts.map(prompt => ({
      prompt,
      intent_category: 'FOUNDATIONAL_AUTHORITY' as PromptIntentCategory
    }))
  }
}

/**
 * Classify a single URL's content structure and domain role
 */
export const classifyUrlContent = async (
  url: string,
  title: string,
  description: string,
  contentSnippet: string
): Promise<ContentClassificationResult> => {
  console.log(`🤖 [CLASSIFIER] Classifying content for ${url}`)
  
  const systemPrompt = `You are an expert content strategist. Your task is to analyze the provided URL's title, description, and full content to classify its core purpose/structure and domain role.

**CONTENT STRUCTURE TAXONOMY:**
1. DEFINITIVE_QA_BLOCK: Concise text block, often schema-tagged or in an FAQ section, designed for direct answer extraction.
2. ORIGINAL_DATA_STUDY: Content focused on proprietary research, surveys, or unique data sets with stated methodology.
3. PRODUCT_COMPARISON_MATRIX: Content presented in bulleted lists, tables, or side-by-side product feature layouts.
4. NARRATIVE_CASE_STUDY: Story-driven content detailing a client win, problem/solution, or a project outcome.
5. OFFICIAL_DOCUMENTATION: Structured content from official help centers, APIs, or knowledge bases.
6. COMMUNITY_DISCUSSION: Forum posts, discussion threads, Q&A exchanges, and community-driven conversations where users interact and share experiences.

**DOMAIN ROLE TAXONOMY:**
1. FOUNDATIONAL_AUTHORITY: Domains cited for established definitions, history, and technical standards.
2. COMPETITIVE_CONSENSUS: Domains cited for comparative data, product features, and reviews.
3. REAL_TIME_SIGNAL: Domains cited for recent events, breaking news, or temporary spikes.
4. COMMUNITY_VALIDATION: Domains where user experience and peer discussion drive citation.
5. TACTICAL_GUIDE: Domains cited for step-by-step instructions, troubleshooting, or product documentation.

**INSTRUCTIONS:**
1. Determine the content_structure_category from the CONTENT STRUCTURE TAXONOMY.
2. Determine the domain_role_category from the DOMAIN ROLE TAXONOMY.
3. Return only the JSON format specified below.

**DESIRED JSON OUTPUT FORMAT:**
{
  "url": "[The URL being analyzed]",
  "content_structure_category": "[ONE_OF_THE_CONTENT_STRUCTURE_CATEGORIES]",
  "domain_role_category": "[ONE_OF_THE_DOMAIN_ROLE_CATEGORIES]"
}`

  const userPrompt = `**INPUT DATA:**
<URL>${url}</URL>
<URL_TITLE>${title}</URL_TITLE>
<URL_DESCRIPTION>${description}</URL_DESCRIPTION>
<URL_CONTENT_SNIPPET>${contentSnippet.substring(0, 2000)}</URL_CONTENT_SNIPPET>

Return only the JSON object, no additional text.`

  try {
    const startTime = Date.now()
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' }
    })

    const responseTime = Date.now() - startTime
    const content = completion.choices[0].message.content || '{}'
    
    console.log(`✅ [CLASSIFIER] Content classified in ${responseTime}ms`)
    
    const parsed = JSON.parse(content)
    return {
      url: parsed.url || url,
      content_structure_category: parsed.content_structure_category || 'OFFICIAL_DOCUMENTATION',
      domain_role_category: parsed.domain_role_category || 'FOUNDATIONAL_AUTHORITY'
    }
  } catch (error: any) {
    console.error('❌ [CLASSIFIER] Content classification failed:', error.message)
    // Return default classification
    return {
      url,
      content_structure_category: 'OFFICIAL_DOCUMENTATION',
      domain_role_category: 'FOUNDATIONAL_AUTHORITY'
    }
  }
}

/**
 * Batch classify multiple URLs
 */
export const classifyUrlContentBatch = async (
  urls: Array<{
    url: string
    title: string
    description: string
    contentSnippet: string
  }>
): Promise<ContentClassificationResult[]> => {
  console.log(`🤖 [CLASSIFIER] Batch classifying ${urls.length} URLs...`)
  
  const results: ContentClassificationResult[] = []
  
  // Process sequentially to avoid rate limits
  for (const urlData of urls) {
    const result = await classifyUrlContent(
      urlData.url,
      urlData.title,
      urlData.description,
      urlData.contentSnippet
    )
    results.push(result)
    
    // Small delay between calls
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  
  console.log(`✅ [CLASSIFIER] Batch classification complete: ${results.length} URLs`)
  return results
}

