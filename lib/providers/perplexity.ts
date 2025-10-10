/**
 * Perplexity AI Provider Client
 * Handles API communication with Perplexity
 */

export interface PerplexityResponse {
  id: string
  object: string
  created: number
  model: string
  choices: {
    index: number
    finish_reason: string
    message: {
      role: string
      content: string
    }
    delta?: {
      role?: string
      content?: string
    }
  }[]
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
  search_results?: Array<{
    url: string
    title?: string
    snippet?: string
  }>
  response_time_ms?: number
}

export interface PerplexityConfig {
  model?: string
  maxTokens?: number
  temperature?: number
  topP?: number
  returnCitations?: boolean
  searchRecencyFilter?: 'day' | 'week' | 'month' | 'year'
}

const DEFAULT_CONFIG: PerplexityConfig = {
  model: 'sonar',
  maxTokens: 1000,
  temperature: 0.2,
  topP: 0.9,
  returnCitations: true,
  searchRecencyFilter: 'month'
}

/**
 * Call Perplexity API with a prompt
 */
export const callPerplexityAPI = async (
  prompt: string,
  config: PerplexityConfig = {}
): Promise<PerplexityResponse> => {
  const apiKey = process.env.PERPLEXITY_API_KEY
  if (!apiKey) {
    throw new Error('PERPLEXITY_API_KEY not configured')
  }

  const finalConfig = { ...DEFAULT_CONFIG, ...config }
  
  console.log('🤖 [PERPLEXITY] Calling API with model:', finalConfig.model, 'prompt:', prompt.substring(0, 100) + '...')
  
  const startTime = Date.now()
  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: finalConfig.model,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: finalConfig.maxTokens,
      temperature: finalConfig.temperature,
      top_p: finalConfig.topP,
      return_citations: finalConfig.returnCitations,
      search_recency_filter: finalConfig.searchRecencyFilter
    })
  })

  const responseTime = Date.now() - startTime
  console.log('🤖 [PERPLEXITY] HTTP Status:', response.status, 'Response time:', responseTime, 'ms')

  if (!response.ok) {
    const errorText = await response.text()
    console.error('❌ [PERPLEXITY] API Error - Status:', response.status, 'Payload:', errorText)
    throw new Error(`Perplexity API error: ${response.status} ${errorText}`)
  }

  const data = await response.json()
  
  const hasSearchResults = data.search_results && Array.isArray(data.search_results)
  const citationCount = hasSearchResults ? data.search_results.length : 0
  console.log('✅ [PERPLEXITY] Success - Citations:', citationCount)
  
  return { ...data, response_time_ms: responseTime }
}

/**
 * Extract response content from Perplexity response
 */
export const extractPerplexityContent = (response: PerplexityResponse): string => {
  return response.choices[0]?.message?.content || ''
}

/**
 * Extract citations from Perplexity response
 */
export const extractPerplexityCitations = (response: PerplexityResponse): any[] => {
  return response.search_results || []
}

