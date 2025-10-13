/**
 * Tavily API Provider Client
 * Handles content extraction from URLs
 */

export interface TavilyExtractResult {
  url: string
  title?: string
  content?: string // Raw content
  raw_content?: string
  failed?: boolean
  error?: string
}

export interface TavilyExtractResponse {
  results: TavilyExtractResult[]
  failed_results?: TavilyExtractResult[]
}

/**
 * Extract content from multiple URLs using Tavily API
 * Can process up to 20 URLs per request
 */
export const extractUrlContent = async (
  urls: string[]
): Promise<TavilyExtractResponse> => {
  const apiKey = process.env.TAVILY_API_KEY
  if (!apiKey) {
    throw new Error('TAVILY_API_KEY not configured')
  }

  if (urls.length === 0) {
    return { results: [] }
  }

  if (urls.length > 20) {
    throw new Error('Tavily API supports maximum 20 URLs per request')
  }

  console.log(`🔍 [TAVILY] Extracting content from ${urls.length} URLs...`)
  
  const startTime = Date.now()
  const response = await fetch('https://api.tavily.com/extract', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      api_key: apiKey,
      urls: urls
    })
  })

  const responseTime = Date.now() - startTime
  console.log('🔍 [TAVILY] HTTP Status:', response.status, 'Response time:', responseTime, 'ms')

  if (!response.ok) {
    const errorText = await response.text()
    console.error('❌ [TAVILY] API Error - Status:', response.status, 'Payload:', errorText)
    throw new Error(`Tavily API error: ${response.status} ${errorText}`)
  }

  const data = await response.json()
  
  const successCount = data.results?.length || 0
  const failedCount = data.failed_results?.length || 0
  console.log(`✅ [TAVILY] Success: ${successCount} extracted, ${failedCount} failed`)
  
  return data
}

/**
 * Batch process URLs in groups of 20
 */
export const extractUrlContentBatch = async (
  urls: string[]
): Promise<TavilyExtractResult[]> => {
  const allResults: TavilyExtractResult[] = []
  
  // Split into batches of 20
  for (let i = 0; i < urls.length; i += 20) {
    const batch = urls.slice(i, i + 20)
    console.log(`🔍 [TAVILY] Processing batch ${Math.floor(i / 20) + 1}/${Math.ceil(urls.length / 20)}`)
    
    try {
      const response = await extractUrlContent(batch)
      allResults.push(...(response.results || []))
      
      // Also include failed results with error info
      if (response.failed_results) {
        allResults.push(...response.failed_results.map(r => ({ ...r, failed: true })))
      }
    } catch (error: any) {
      console.error(`❌ [TAVILY] Batch failed:`, error.message)
      // Mark all URLs in this batch as failed
      batch.forEach(url => {
        allResults.push({
          url,
          failed: true,
          error: error.message
        })
      })
    }
    
    // Small delay between batches to avoid rate limiting
    if (i + 20 < urls.length) {
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }
  
  return allResults
}

/**
 * Extract domain from URL
 */
export const extractDomain = (url: string): string => {
  try {
    const urlObj = new URL(url)
    return urlObj.hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/**
 * Normalize URL for deduplication
 */
export const normalizeUrl = (url: string): string => {
  try {
    const urlObj = new URL(url)
    
    // Lowercase host and path
    urlObj.hostname = urlObj.hostname.toLowerCase()
    urlObj.pathname = urlObj.pathname.toLowerCase()
    
    // Remove trailing slash
    if (urlObj.pathname.endsWith('/') && urlObj.pathname.length > 1) {
      urlObj.pathname = urlObj.pathname.slice(0, -1)
    }
    
    // Remove common tracking parameters
    const paramsToRemove = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'ref', 'fbclid', 'gclid']
    paramsToRemove.forEach(param => urlObj.searchParams.delete(param))
    
    // Remove fragment
    urlObj.hash = ''
    
    return urlObj.toString()
  } catch {
    return url.toLowerCase()
  }
}

