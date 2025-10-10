/**
 * Shared Portrayal Classification Service
 * Provider-agnostic LLM classification for brand mentions
 */

import crypto from 'crypto'
import { Provider } from '@/types/domain/provider'

// Fixed taxonomy slugs
export const PORTRAYAL_CATEGORIES = [
  'RECOMMENDATION',
  'COMPARISON',
  'PROBLEM_SOLVER',
  'FEATURE_BENEFIT',
  'NEUTRAL_DESCRIPTION',
  'AUTHORITY_REFERENCE',
  'USE_CASE',
  'OTHER'
] as const

export type PortrayalCategory = typeof PORTRAYAL_CATEGORIES[number]

export interface ClassificationResult {
  category: PortrayalCategory
  confidence: number
}

/**
 * Generate snippet hash for caching and deduplication
 */
export const generateSnippetHash = (brandName: string, snippet: string): string => {
  return crypto
    .createHash('sha256')
    .update(`${brandName.toLowerCase()}|${snippet.toLowerCase()}`)
    .digest('hex')
}

/**
 * Extract snippet around brand mention (max 800 chars)
 */
export const extractSnippet = (text: string, brandName: string, maxLength: number = 800): string => {
  const lowerText = text.toLowerCase()
  const lowerBrand = brandName.toLowerCase()
  
  // Find all brand mentions
  const mentions: number[] = []
  let index = lowerText.indexOf(lowerBrand)
  while (index !== -1) {
    mentions.push(index)
    index = lowerText.indexOf(lowerBrand, index + 1)
  }
  
  if (mentions.length === 0) return text.slice(0, maxLength)
  
  // Use the first mention as reference point
  const mentionIndex = mentions[0]
  
  // Extract context around the mention
  const start = Math.max(0, mentionIndex - 200)
  const end = Math.min(text.length, start + maxLength)
  
  return text.slice(start, end).trim()
}

/**
 * Call GPT-4o-mini for deterministic portrayal classification
 */
export const classifyPortrayal = async (
  brandName: string,
  snippet: string
): Promise<ClassificationResult> => {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured')
  }

  const systemMessage = `You are a deterministic classifier for brand portrayal in AI responses.
Return exactly one label from this fixed set (uppercase slugs):

RECOMMENDATION — the text steers the reader to choose/use the brand.

COMPARISON — the brand is contrasted with alternatives.

PROBLEM_SOLVER — the brand is framed as solving a specific problem/pain.

FEATURE_BENEFIT — the brand's capabilities/benefits are highlighted.

NEUTRAL_DESCRIPTION — simple definition/intro of the brand.

AUTHORITY_REFERENCE — cited as example/reference/benchmark/best practice.

USE_CASE — a scenario describing where the brand fits/is typically used.

OTHER — none of the above fits confidently.

Precedence rules:

If recommendation signals appear → RECOMMENDATION.

If "vs/compared to/alternative to" language appears → COMPARISON.

If a concrete pain + remedy is explicit → PROBLEM_SOLVER.
Else pick the best fit; if uncertain → OTHER.

Validation:

If the snippet does not mention the brand, return OTHER with confidence 0.

Output only JSON exactly in this shape:
{"category":"<ONE_SLUG>","confidence":<0..1>}`

  const userMessage = `Classify how the brand is portrayed in the snippet.
Return JSON only with keys category and confidence.

Brand: ${brandName}

Snippet (≤ ~800 characters, include the sentence with the mention):
"""
${snippet}
"""

Keep this instruction text identical across calls to maximize consistency and caching.`

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userMessage }
      ],
      temperature: 0, // Deterministic
      top_p: 1,
      max_tokens: 50,
      response_format: { type: 'json_object' }
    })
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`OpenAI API error: ${response.status} ${errorText}`)
  }

  const data = await response.json()
  const content = data.choices[0]?.message?.content
  
  if (!content) {
    throw new Error('No response content from OpenAI')
  }

  try {
    const result = JSON.parse(content) as ClassificationResult
    
    // Validate the result
    if (!PORTRAYAL_CATEGORIES.includes(result.category as PortrayalCategory)) {
      throw new Error(`Invalid category: ${result.category}`)
    }
    
    if (typeof result.confidence !== 'number' || result.confidence < 0 || result.confidence > 1) {
      throw new Error(`Invalid confidence: ${result.confidence}`)
    }
    
    return result
  } catch (error) {
    console.error('Failed to parse classification result:', content, error)
    return { category: 'OTHER', confidence: 0 }
  }
}

/**
 * Provider-aware classification orchestrator
 * Processes unclassified results for a specific provider
 */
export interface ClassificationOptions {
  brandId: string
  brandName: string
  provider: Provider
  dailyReportId?: string
  fromCron?: boolean
}

export interface ClassificationStats {
  processed: number
  skipped: number
  errors: Array<{ id: string; error: string }>
}

/**
 * Get the appropriate response field name for a provider
 */
export const getProviderResponseField = (provider: Provider): string => {
  switch (provider) {
    case 'perplexity':
      return 'perplexity_response'
    case 'google_ai_overview':
      return 'google_ai_overview_response'
    case 'claude':
      return 'claude_response'
    case 'chatgpt':
      return 'chatgpt_response' // Future
    default:
      return 'perplexity_response'
  }
}

/**
 * Get the appropriate portrayal type field name for a provider
 */
export const getProviderPortrayalField = (provider: Provider): string => {
  switch (provider) {
    case 'perplexity':
      return 'portrayal_type'
    case 'google_ai_overview':
      return 'google_ai_overview_portrayal_type'
    case 'claude':
      return 'claude_portrayal_type'
    case 'chatgpt':
      return 'chatgpt_portrayal_type' // Future
    default:
      return 'portrayal_type'
  }
}

/**
 * Get the appropriate classifier stage field name for a provider
 */
export const getProviderClassifierStageField = (provider: Provider): string => {
  switch (provider) {
    case 'perplexity':
      return 'classifier_stage'
    case 'google_ai_overview':
      return 'google_ai_overview_classifier_stage'
    case 'claude':
      return 'claude_classifier_stage'
    case 'chatgpt':
      return 'chatgpt_classifier_stage' // Future
    default:
      return 'classifier_stage'
  }
}

/**
 * Get the appropriate snippet hash field name for a provider
 */
export const getProviderSnippetHashField = (provider: Provider): string => {
  switch (provider) {
    case 'perplexity':
      return 'snippet_hash'
    case 'google_ai_overview':
      return 'google_ai_overview_snippet_hash'
    case 'claude':
      return 'claude_snippet_hash'
    case 'chatgpt':
      return 'chatgpt_snippet_hash' // Future
    default:
      return 'snippet_hash'
  }
}

/**
 * Get the appropriate confidence field name for a provider
 */
export const getProviderConfidenceField = (provider: Provider): string => {
  switch (provider) {
    case 'perplexity':
      return 'portrayal_confidence'
    case 'google_ai_overview':
      return 'google_ai_overview_portrayal_confidence'
    case 'claude':
      return 'claude_portrayal_confidence'
    case 'chatgpt':
      return 'chatgpt_portrayal_confidence' // Future
    default:
      return 'portrayal_confidence'
  }
}

/**
 * Get the appropriate classifier version field name for a provider
 */
export const getProviderClassifierVersionField = (provider: Provider): string => {
  switch (provider) {
    case 'perplexity':
      return 'classifier_version'
    case 'google_ai_overview':
      return 'google_ai_overview_classifier_version'
    case 'claude':
      return 'claude_classifier_version'
    case 'chatgpt':
      return 'chatgpt_classifier_version' // Future
    default:
      return 'classifier_version'
  }
}

