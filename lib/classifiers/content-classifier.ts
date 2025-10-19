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
  QA_BLOCK: 'Q&A or FAQ Block',
  DATA_DRIVEN_REPORT: 'Original Research or Data Report',
  COMPARISON_TABLE: 'Product or Service Comparison',
  CASE_STUDY: 'Case Study',
  DOCS_PAGE: 'Official Documentation',
  FORUM_THREAD: 'Community Discussion',
  TUTORIAL_STEP_BY_STEP: 'How-To Tutorial',
  LONG_FORM_ARTICLE: 'Editorial or Thought Leadership Article',
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
  
  const systemPrompt = `You are an expert content analyst. Your task is to identify what type of content a webpage represents based on its structure and purpose.

**CONTENT STRUCTURE TAXONOMY:**
1. QA_BLOCK – Short, structured text answering a single question (FAQ, glossary).
2. DATA_DRIVEN_REPORT – Proprietary study or dataset with measurable results.
3. COMPARISON_TABLE – Product or service comparison ("X vs Y", "Top 5", feature lists).
4. CASE_STUDY – Narrative example describing a challenge, solution, and outcome.
5. DOCS_PAGE – Technical or instructional documentation (API, help center, developer pages).
6. FORUM_THREAD – Community thread, forum discussion, or user Q&A exchange.
7. TUTORIAL_STEP_BY_STEP – Step‑by‑step instructional or how‑to guide.
8. LONG_FORM_ARTICLE – Editorial or analytical article providing commentary or insight.

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
      content_structure_category: parsed.content_structure_category || 'DOCS_PAGE'
    }
  } catch (error: any) {
    console.error('❌ [CLASSIFIER] Content classification failed:', error.message)
    // Return default classification
    return {
      url,
      content_structure_category: 'DOCS_PAGE'
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

