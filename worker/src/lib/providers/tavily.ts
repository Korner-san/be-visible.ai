/**
 * Tavily Provider Client
 * Handles URL content extraction using Tavily API
 */

interface TavilyExtractResponse {
  results: Array<{
    url: string
    raw_content: string
  }>
  failed_results: Array<{
    url: string
    error: string
  }>
}

interface UrlContentResult {
  url: string
  title?: string
  content?: string
  raw_content?: string
  failed: boolean
  error?: string
}

/**
 * Extract domain from URL
 */
export const extractDomain = (url: string): string => {
  try {
    const urlObj = new URL(url)
    return urlObj.hostname.replace('www.', '')
  } catch {
    return ''
  }
}

/**
 * Normalize URL (remove trailing slashes, fragments, etc.)
 */
export const normalizeUrl = (url: string): string => {
  try {
    const urlObj = new URL(url)
    urlObj.hash = ''
    let normalized = urlObj.toString()
    if (normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1)
    }
    return normalized
  } catch {
    return url
  }
}

/**
 * Extract content from multiple URLs using Tavily API in batches
 */
export const extractUrlContentBatch = async (urls: string[]): Promise<UrlContentResult[]> => {
  const apiKey = process.env.TAVILY_API_KEY
  if (!apiKey) {
    throw new Error('TAVILY_API_KEY not configured')
  }

  if (urls.length === 0) {
    return []
  }

  console.log(`🔍 [TAVILY] Extracting content from ${urls.length} URLs...`)
  
  const results: UrlContentResult[] = []
  const batchSize = 20 // Tavily supports up to 20 URLs per request
  
  // Process in batches
  for (let i = 0; i < urls.length; i += batchSize) {
    const batch = urls.slice(i, i + batchSize)
    console.log(`🔍 [TAVILY] Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(urls.length / batchSize)} (${batch.length} URLs)`)
    
    try {
      const response = await fetch('https://api.tavily.com/extract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          api_key: apiKey,
          urls: batch
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`❌ [TAVILY] API Error - Status: ${response.status}, Payload:`, errorText)
        
        // Mark all URLs in this batch as failed
        batch.forEach(url => {
          results.push({
            url,
            failed: true,
            error: `Tavily API error: ${response.status}`
          })
        })
        continue
      }

      const data: TavilyExtractResponse = await response.json()
      
      // Process successful results
      if (data.results && Array.isArray(data.results)) {
        data.results.forEach(result => {
          results.push({
            url: result.url,
            raw_content: result.raw_content,
            content: result.raw_content?.substring(0, 500), // First 500 chars as preview
            title: extractTitleFromContent(result.raw_content),
            failed: false
          })
        })
      }
      
      // Process failed results
      if (data.failed_results && Array.isArray(data.failed_results)) {
        data.failed_results.forEach(result => {
          results.push({
            url: result.url,
            failed: true,
            error: result.error
          })
        })
      }
      
      console.log(`✅ [TAVILY] Batch ${Math.floor(i / batchSize) + 1} complete - ${data.results?.length || 0} successful, ${data.failed_results?.length || 0} failed`)
      
      // Add delay between batches to avoid rate limiting
      if (i + batchSize < urls.length) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
      
    } catch (error) {
      console.error(`❌ [TAVILY] Error processing batch:`, error)
      
      // Mark all URLs in this batch as failed
      batch.forEach(url => {
        results.push({
          url,
          failed: true,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      })
    }
  }
  
  const successCount = results.filter(r => !r.failed).length
  const failureCount = results.filter(r => r.failed).length
  console.log(`✅ [TAVILY] Content extraction complete - ${successCount} successful, ${failureCount} failed`)
  
  return results
}

/**
 * Extract title from content (simple heuristic)
 */
const extractTitleFromContent = (content: string | undefined): string => {
  if (!content) return ''
  
  // Try to find the first line or first sentence as title
  const lines = content.split('\n').filter(line => line.trim().length > 0)
  if (lines.length > 0) {
    const firstLine = lines[0].trim()
    if (firstLine.length < 200) {
      return firstLine
    }
  }
  
  // Fallback to first 100 characters
  return content.substring(0, 100).trim()
}


