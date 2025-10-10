/**
 * Google AI Overview Provider Client
 * Handles API communication with Google Custom Search API
 */

export interface GoogleAIOverviewResponse {
  items?: Array<{
    title: string
    link: string
    snippet: string
    displayLink: string
  }>
  searchInformation?: {
    searchTime: number
    totalResults: string
  }
  response_time_ms?: number
}

export interface GoogleAIOverviewConfig {
  numResults?: number
}

const DEFAULT_CONFIG: GoogleAIOverviewConfig = {
  numResults: 10
}

/**
 * Call Google Custom Search API
 */
export const callGoogleAIOverviewAPI = async (
  prompt: string,
  config: GoogleAIOverviewConfig = {}
): Promise<GoogleAIOverviewResponse> => {
  const apiKey = process.env.GOOGLE_API_KEY
  const cseId = process.env.GOOGLE_CSE_ID
  
  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY not configured')
  }
  if (!cseId) {
    throw new Error('GOOGLE_CSE_ID not configured')
  }

  const finalConfig = { ...DEFAULT_CONFIG, ...config }
  
  console.log('🤖 [GOOGLE AI OVERVIEW] Calling API with prompt:', prompt.substring(0, 100) + '...')
  
  const startTime = Date.now()
  const apiUrl = 'https://www.googleapis.com/customsearch/v1'
  
  const response = await fetch(
    `${apiUrl}?key=${apiKey}&cx=${cseId}&q=${encodeURIComponent(prompt)}&num=${finalConfig.numResults}`,
    {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      }
    }
  )

  const responseTime = Date.now() - startTime
  console.log('🤖 [GOOGLE AI OVERVIEW] HTTP Status:', response.status, 'Response time:', responseTime, 'ms')

  if (!response.ok) {
    const errorText = await response.text()
    console.error('❌ [GOOGLE AI OVERVIEW] API Error - Status:', response.status, 'Payload:', errorText)
    throw new Error(`Google AI Overview API error: ${response.status} ${errorText}`)
  }

  const data = await response.json()
  
  const hasItems = data.items && Array.isArray(data.items) && data.items.length > 0
  const itemCount = hasItems ? data.items.length : 0
  console.log('✅ [GOOGLE AI OVERVIEW] Success - Items found:', itemCount)
  
  return { ...data, response_time_ms: responseTime }
}

/**
 * Extract response content from Google AI Overview response
 */
export const extractGoogleContent = (response: GoogleAIOverviewResponse): string => {
  if (!response.items || response.items.length === 0) {
    return ''
  }
  
  return response.items.map(item => item.snippet).join('\n\n')
}

/**
 * Extract citations from Google AI Overview response
 */
export const extractGoogleCitations = (response: GoogleAIOverviewResponse): any[] => {
  if (!response.items || response.items.length === 0) {
    return []
  }
  
  return response.items.map(item => ({
    title: item.title,
    link: item.link,
    snippet: item.snippet,
    domain: item.displayLink
  }))
}

/**
 * Check if Google AI Overview has results
 */
export const hasGoogleResults = (response: GoogleAIOverviewResponse): boolean => {
  return !!(response.items && response.items.length > 0)
}

