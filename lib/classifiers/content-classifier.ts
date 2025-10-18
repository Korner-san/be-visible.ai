/**
 * Content Classification Service
 * Uses ChatGPT to classify prompts and URL content
 */

import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// Content Structure Categories
export const CONTENT_STRUCTURE_CATEGORIES = {
  DEFINITIVE_QA_BLOCK: 'Definitive Q&A Block',
  ORIGINAL_DATA_STUDY: 'Original Data Study',
  PRODUCT_COMPARISON_MATRIX: 'Product Comparison Matrix',
  NARRATIVE_CASE_STUDY: 'Narrative Case Study',
  OFFICIAL_DOCUMENTATION: 'Official Documentation',
  COMMUNITY_DISCUSSION: 'Community Discussion',
} as const

export type ContentStructureCategory = keyof typeof CONTENT_STRUCTURE_CATEGORIES

interface ContentClassificationResult {
  url: string
  content_structure_category: ContentStructureCategory
}


/**
 * Classify a single URL's content structure
 */
export const classifyUrlContent = async (
  url: string,
  title: string,
  description: string,
  contentSnippet: string
): Promise<ContentClassificationResult> => {
  console.log(`🤖 [CLASSIFIER] Classifying content for ${url}`)
  
  const systemPrompt = `You are an expert content strategist. Your task is to analyze the provided URL's title, description, and full content to classify its content structure.

**CONTENT STRUCTURE TAXONOMY:**
1. DEFINITIVE_QA_BLOCK: Concise text block, often schema-tagged or in an FAQ section, designed for direct answer extraction.
2. ORIGINAL_DATA_STUDY: Content focused on proprietary research, surveys, or unique data sets with stated methodology.
3. PRODUCT_COMPARISON_MATRIX: Content presented in bulleted lists, tables, or side-by-side product feature layouts.
4. NARRATIVE_CASE_STUDY: Story-driven content detailing a client win, problem/solution, or a project outcome.
5. OFFICIAL_DOCUMENTATION: Structured content from official help centers, APIs, or knowledge bases.
6. COMMUNITY_DISCUSSION: Forum posts, discussion threads, Q&A exchanges, and community-driven conversations where users interact and share experiences.

**INSTRUCTIONS:**
1. Determine the content_structure_category from the CONTENT STRUCTURE TAXONOMY.
2. Return only the JSON format specified below.

**DESIRED JSON OUTPUT FORMAT:**
{
  "url": "[The URL being analyzed]",
  "content_structure_category": "[ONE_OF_THE_CONTENT_STRUCTURE_CATEGORIES]"
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
      content_structure_category: parsed.content_structure_category || 'OFFICIAL_DOCUMENTATION'
    }
  } catch (error: any) {
    console.error('❌ [CLASSIFIER] Content classification failed:', error.message)
    // Return default classification
    return {
      url,
      content_structure_category: 'OFFICIAL_DOCUMENTATION'
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

