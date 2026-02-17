/**
 * Content Classifier v2
 * Uses ChatGPT to classify URL content into categories
 * v2 improvements: domain heuristics, few-shot examples, expanded snippets,
 * lower threshold, richer category definitions
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
  OFFICIAL_DOCS: 'Formal structured reference documentation, API references, SDK guides, or official product docs. Signals: /docs/ in URL, code samples, parameter tables, versioned references.',
  HOW_TO_GUIDE: 'Step-by-step instructions teaching how to perform a task. Signals: numbered steps, "how to", checklists, tutorials, walkthroughs, best-practices lists.',
  COMPARISON_ANALYSIS: 'Content comparing products/services, alternatives, or presenting ranked/curated lists. Signals: "top 10", "best", "vs", "compare", "alternatives", pros/cons tables, multiple product names.',
  PRODUCT_PAGE: 'Marketing or landing pages focused on selling, conversion, or showcasing a product/service. Signals: CTAs ("get started", "free trial", "pricing"), feature highlights, testimonials, hero sections.',
  THOUGHT_LEADERSHIP: 'Expert opinions, industry insights, trend analysis, strategic framing. Signals: author byline, opinion language, forward-looking predictions, no step-by-step instructions.',
  CASE_STUDY: 'Narrative showing how a real organization achieved results using a product/approach. Signals: customer name, metrics/results, "challenge → solution → outcome" structure.',
  TECHNICAL_DEEP_DIVE: 'In-depth technical explanation, architecture design, engineering deep-dive, white papers. Signals: diagrams, code architecture, benchmarks, research methodology.',
  NEWS_ANNOUNCEMENT: 'Press releases, product launches, version releases, company news. Signals: "announces", "launches", "releases", dates, quotes from executives, PR Newswire/BusinessWire.',
  COMMUNITY_DISCUSSION: 'Forum threads, Q&A, Reddit/HN/SO style discussions. Signals: upvotes, comments, multiple authors, question-answer format, informal tone.',
  VIDEO_CONTENT: 'Video-first content: YouTube, Vimeo, webinar recordings, video tutorials. Signals: video player, transcript, "watch", duration timestamps.',
  OTHER_LOW_CONFIDENCE: 'Use ONLY when the page genuinely does not fit any category above. Do NOT use this as a default.'
} as const

type ContentCategory = keyof typeof CONTENT_CATEGORIES

// --- Domain Heuristic Lists ---

const COMMUNITY_DOMAINS = [
  'reddit.com', 'stackoverflow.com', 'stackexchange.com',
  'news.ycombinator.com', 'quora.com', 'discourse.org',
  'github.com/issues', 'github.com/discussions'
]

const NEWS_DOMAINS = [
  'prnewswire.com', 'businesswire.com', 'globenewswire.com',
  'techcrunch.com', 'venturebeat.com'
]

const VIDEO_DOMAINS = [
  'youtube.com', 'youtu.be', 'vimeo.com', 'twitch.tv'
]

/**
 * Apply domain-based heuristics before calling the LLM.
 * Returns a category string if a heuristic matches, or null to fall through to GPT.
 */
function applyDomainHeuristics(url: string, title: string): string | null {
  try {
    const parsed = new URL(url)
    const domain = parsed.hostname.replace('www.', '')
    const fullUrl = domain + parsed.pathname
    const lowerTitle = title.toLowerCase()

    // Community forums
    if (COMMUNITY_DOMAINS.some(d => fullUrl.includes(d))) return 'COMMUNITY_DISCUSSION'

    // Press releases / news wires
    if (NEWS_DOMAINS.some(d => domain.includes(d))) return 'NEWS_ANNOUNCEMENT'

    // Video platforms
    if (VIDEO_DOMAINS.some(d => domain.includes(d))) return 'VIDEO_CONTENT'

    // Official docs (URL path contains /docs/ or /documentation/ or /api-reference/)
    const path = parsed.pathname.toLowerCase()
    if (path.includes('/docs/') || path.includes('/documentation/') || path.includes('/api-reference/')) {
      return 'OFFICIAL_DOCS'
    }

    // Title-based heuristics for comparison articles
    if (/\b(top\s+\d+|best\s+\d+|\d+\s+best|vs\.?|versus|compare|alternatives)\b/i.test(lowerTitle)) {
      return 'COMPARISON_ANALYSIS'
    }

    return null // No heuristic match → send to LLM
  } catch {
    return null
  }
}

/**
 * Build a heuristic-based ClassificationResult with high confidence
 */
function buildHeuristicResult(category: string): ClassificationResult {
  const scores: CategoryScores = {
    OFFICIAL_DOCS: 0,
    HOW_TO_GUIDE: 0,
    COMPARISON_ANALYSIS: 0,
    PRODUCT_PAGE: 0,
    THOUGHT_LEADERSHIP: 0,
    CASE_STUDY: 0,
    TECHNICAL_DEEP_DIVE: 0,
    NEWS_ANNOUNCEMENT: 0,
    COMMUNITY_DISCUSSION: 0,
    VIDEO_CONTENT: 0,
    OTHER_LOW_CONFIDENCE: 0
  }
  if (category in scores) {
    scores[category as ContentCategory] = 0.95
  }
  return {
    content_structure_category: category,
    confidence: 0.95,
    scores
  }
}

/**
 * Classify URL content in batches using ChatGPT
 * v2: applies domain heuristics first, only sends remaining URLs to GPT
 */
export const classifyUrlContentBatch = async (inputs: ClassificationInput[]): Promise<ClassificationResult[]> => {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured')
  }

  if (inputs.length === 0) {
    return []
  }

  console.log(`🤖 [CONTENT CLASSIFIER v2] Classifying ${inputs.length} URLs...`)

  // Phase 1: Apply domain heuristics
  const results: (ClassificationResult | null)[] = new Array(inputs.length).fill(null)
  const llmInputs: { index: number; input: ClassificationInput }[] = []

  inputs.forEach((input, index) => {
    const heuristicCategory = applyDomainHeuristics(input.url, input.title)
    if (heuristicCategory) {
      results[index] = buildHeuristicResult(heuristicCategory)
      console.log(`  ✅ Heuristic: ${input.url} → ${heuristicCategory}`)
    } else {
      llmInputs.push({ index, input })
    }
  })

  const heuristicCount = inputs.length - llmInputs.length
  console.log(`🤖 [CONTENT CLASSIFIER v2] Heuristic matches: ${heuristicCount}, sending ${llmInputs.length} to GPT`)

  // Phase 2: Send remaining URLs to GPT in batches
  if (llmInputs.length > 0) {
    const openai = new OpenAI({ apiKey })
    const batchSize = 5 // Reduced from 10 to accommodate larger snippets

    for (let i = 0; i < llmInputs.length; i += batchSize) {
      const batch = llmInputs.slice(i, i + batchSize)
      const batchInputs = batch.map(b => b.input)
      console.log(`🤖 [CONTENT CLASSIFIER v2] Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(llmInputs.length / batchSize)} (${batchInputs.length} URLs)`)

      try {
        const prompt = buildClassificationPrompt(batchInputs)

        const response = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'You are a content classification expert. You classify web pages based on purpose, intent, and informational structure. Pay close attention to: (1) the URL domain and path structure, (2) the page title — titles like "Top 10 Best..." strongly indicate COMPARISON_ANALYSIS, (3) the presence of CTAs, lists, Q&A format, or press release structure. Prefer assigning a specific category over OTHER_LOW_CONFIDENCE. Always respond with valid JSON.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.2,
          max_tokens: 4000,
          response_format: { type: 'json_object' }
        })

        const classification = response.choices[0]?.message?.content || ''
        const batchResults = parseClassificationResponse(classification, batchInputs.length)

        batch.forEach((b, batchIdx) => {
          results[b.index] = batchResults[batchIdx]
        })

        console.log(`✅ [CONTENT CLASSIFIER v2] Batch ${Math.floor(i / batchSize) + 1} complete`)

        // Add delay between batches to avoid rate limiting
        if (i + batchSize < llmInputs.length) {
          await new Promise(resolve => setTimeout(resolve, 500))
        }

      } catch (error) {
        console.error(`❌ [CONTENT CLASSIFIER v2] Error processing batch:`, error)

        // Use fallback classification for failed batch
        batch.forEach((b) => {
          results[b.index] = createDefaultClassification()
        })
      }
    }
  }

  // Fill any remaining nulls with defaults (shouldn't happen, but safety net)
  const finalResults = results.map(r => r || createDefaultClassification())

  console.log(`✅ [CONTENT CLASSIFIER v2] Classification complete for ${finalResults.length} URLs`)
  return finalResults
}

/**
 * Build classification prompt for a batch of URLs
 * v2: richer definitions, few-shot examples, 2000-char snippets
 */
const buildClassificationPrompt = (batch: ClassificationInput[]): string => {
  let prompt = `Here are the allowed categories (with definitions):\n\n`

  Object.entries(CONTENT_CATEGORIES).forEach(([key, definition], index) => {
    prompt += `${index + 1}. ${key} — ${definition}\n`
  })

  prompt += `\n=== EXAMPLES ===\n\n`
  prompt += `Example 1:\n`
  prompt += `URL: https://stackoverflow.com/questions/12345/how-to-fix-cmake-build-errors\n`
  prompt += `Title: How to fix CMake build errors - Stack Overflow\n`
  prompt += `Content: "I'm getting error X when running cmake... [answers with code]"\n`
  prompt += `→ Category: COMMUNITY_DISCUSSION (Q&A format, Stack Overflow domain)\n\n`

  prompt += `Example 2:\n`
  prompt += `URL: https://zapier.com/blog/best-project-management-software\n`
  prompt += `Title: The 10 Best Project Management Tools in 2026\n`
  prompt += `Content: "We tested dozens of project management tools. Here are our top picks... 1. Asana - Best for..."\n`
  prompt += `→ Category: COMPARISON_ANALYSIS (ranked list, "best", multiple products compared)\n\n`

  prompt += `Example 3:\n`
  prompt += `URL: https://incredibuild.com/solutions/ci-cd-acceleration\n`
  prompt += `Title: CI/CD Acceleration | Incredibuild\n`
  prompt += `Content: "Accelerate your CI/CD pipelines by up to 8x. Get started free..."\n`
  prompt += `→ Category: PRODUCT_PAGE (vendor's own site, CTAs, feature highlights)\n\n`

  prompt += `Example 4:\n`
  prompt += `URL: https://prnewswire.com/news-releases/company-x-launches-new-platform\n`
  prompt += `Title: Company X Launches AI-Powered Platform\n`
  prompt += `Content: "NEW YORK, Jan 15, 2026 — Company X today announced the launch of..."\n`
  prompt += `→ Category: NEWS_ANNOUNCEMENT (press release, "announced", date, executive quotes)\n\n`

  prompt += `Example 5:\n`
  prompt += `URL: https://docs.incredibuild.com/win/v9/getting-started\n`
  prompt += `Title: Getting Started - Incredibuild Documentation\n`
  prompt += `Content: "Prerequisites: ... Step 1: Install the agent... Step 2: Configure..."\n`
  prompt += `→ Category: OFFICIAL_DOCS (/docs/ URL, versioned, structured reference)\n\n`

  prompt += `=== END EXAMPLES ===\n\n`

  prompt += `For each URL below, evaluate and score ALL categories from 0.00 to 1.00 based on:\n`
  prompt += `- URL domain and path structure\n`
  prompt += `- Title and meta description\n`
  prompt += `- Content summary and writing style\n`
  prompt += `- Intent (educate? persuade? compare? narrate?)\n\n`

  prompt += `Choose the category with the HIGHEST score.\n`
  prompt += `Use OTHER_LOW_CONFIDENCE ONLY if the page genuinely does not fit any category above.\n\n`

  prompt += `URLs to classify:\n\n`

  batch.forEach((input, index) => {
    prompt += `URL ${index + 1}:\n`
    prompt += `URL: ${input.url}\n`
    prompt += `Title: ${input.title}\n`
    prompt += `Description: ${input.description.substring(0, 300)}\n`
    prompt += `Content Snippet: ${input.contentSnippet.substring(0, 2000)}\n\n`
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
 * v2: lowered threshold from 0.45 → 0.25
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

        // Apply OTHER_LOW_CONFIDENCE rule — only if ALL scores are below 0.25
        let finalCategory = topCategory
        if (topCategory !== 'OTHER_LOW_CONFIDENCE' && topScore < 0.25) {
          const otherCategories = scoreEntries.filter(([cat]) => cat !== 'OTHER_LOW_CONFIDENCE')
          const maxOtherScore = Math.max(...otherCategories.map(([, score]) => score))

          if (maxOtherScore < 0.25) {
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
    console.error('❌ [CONTENT CLASSIFIER v2] Failed to parse JSON response:', error)

    // Return default classifications for all URLs
    for (let i = 0; i < expectedCount; i++) {
      results.push(createDefaultClassification())
    }
  }

  return results
}

/**
 * Create a default classification result
 * v2: defaults to OTHER_LOW_CONFIDENCE instead of OFFICIAL_DOCS
 */
const createDefaultClassification = (): ClassificationResult => {
  const defaultScores: CategoryScores = {
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

  return {
    content_structure_category: 'OTHER_LOW_CONFIDENCE',
    confidence: 0.5,
    scores: defaultScores
  }
}
