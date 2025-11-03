// @ts-nocheck
/**
 * ChatGPT Provider Client via Browserless
 * Handles automated ChatGPT interaction for report generation
 * Based on proven Browserless automation from POC
 */

import { chromium, Browser, Page } from 'playwright'

export interface ChatGPTResponse {
  id: string
  provider: 'chatgpt'
  promptText: string
  responseText: string
  citations: ChatGPTCitation[]
  responseTimeMs: number
  performanceMetrics?: PerformanceMetrics
  error?: string
}

export interface ChatGPTCitation {
  url: string
  title?: string
  text?: string
  type: 'direct_link' | 'citation_reference' | 'footnote'
}

export interface PerformanceMetrics {
  connectionTime: number
  navigationTime: number
  inputTime: number
  responseWaitTime: number
  extractionTime: number
  totalTime: number
  trace?: {
    traceFile?: string
    timestamps: Record<string, number>
  }
}

interface BrowserlessConfig {
  token: string
  endpoint: string
  timeout: number
  proxyCountry: string
  proxySticky: boolean
}

interface ChatGPTConfig {
  url: string
  inputSelectors: string[]
  sendButtonSelectors: string[]
  responseSelectors: string[]
  typingDelay: number
}

// Configuration from environment
const BROWSERLESS_CONFIG: BrowserlessConfig = {
  token: process.env.BROWSERLESS_API_KEY || process.env.BROWSERLESS_TOKEN || '',
  endpoint: 'wss://production-sfo.browserless.io/chromium/stealth',
  timeout: 120000, // 2 minutes
  proxyCountry: 'us',
  proxySticky: true
}

const CHATGPT_CONFIG: ChatGPTConfig = {
  url: 'https://chat.openai.com/',
  inputSelectors: [
    'textarea[data-id="root"]',
    'textarea[placeholder*="Message"]',
    'textarea[placeholder*="Send a message"]',
    '#prompt-textarea',
    'textarea'
  ],
  sendButtonSelectors: [
    'button[data-testid="send-button"]',
    'button[aria-label*="Send"]',
    'button[type="submit"]'
  ],
  responseSelectors: [
    '[data-message-author-role="assistant"]',
    '[data-testid="conversation-turn-3"]',
    '.markdown',
    '[role="presentation"] div'
  ],
  typingDelay: 100
}

/**
 * Connect to Browserless with stealth mode and residential proxy
 */
const connectToBrowserless = async (): Promise<Browser> => {
  console.log('🌐 [CHATGPT] Connecting to Browserless...')
  
  if (!BROWSERLESS_CONFIG.token) {
    throw new Error('BROWSERLESS_API_KEY environment variable is required')
  }

  const params = new URLSearchParams({
    token: BROWSERLESS_CONFIG.token,
    proxy: 'residential',
    proxyCountry: BROWSERLESS_CONFIG.proxyCountry,
    proxySticky: BROWSERLESS_CONFIG.proxySticky.toString()
  })
  
  const wsEndpoint = `${BROWSERLESS_CONFIG.endpoint}?${params.toString()}`
  console.log('🌐 [CHATGPT] Connecting to:', wsEndpoint.replace(BROWSERLESS_CONFIG.token, 'TOKEN_HIDDEN'))
  
  const browser = await chromium.connectOverCDP(wsEndpoint)
  console.log('✅ [CHATGPT] Connected to Browserless successfully')
  
  return browser
}

/**
 * Navigate to ChatGPT
 */
const navigateToChatGPT = async (page: Page, metrics: PerformanceMetrics): Promise<void> => {
  const navStart = performance.now()
  console.log('🌐 [CHATGPT] Navigating to:', CHATGPT_CONFIG.url)
  
  try {
    await page.goto(CHATGPT_CONFIG.url, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    })
    
    metrics.navigationTime = performance.now() - navStart
    console.log(`✅ [CHATGPT] Navigation completed in ${metrics.navigationTime.toFixed(0)}ms`)
    
    // Wait for page to stabilize
    await page.waitForTimeout(3000)
    
    // Check if we're blocked
    const title = await page.title()
    const url = page.url()
    
    console.log('📄 [CHATGPT] Page loaded - Title:', title, 'URL:', url)
    
    if (title.toLowerCase().includes('blocked') || url.includes('blocked')) {
      throw new Error('ChatGPT blocked the request - bot detection triggered')
    }
    
    if (url.includes('auth') || title.toLowerCase().includes('sign in')) {
      throw new Error('ChatGPT requires sign-in - authentication needed')
    }
  } catch (error) {
    console.error('❌ [CHATGPT] Navigation failed:', error)
    throw error
  }
}

/**
 * Send prompt to ChatGPT
 */
const sendPrompt = async (page: Page, promptText: string, metrics: PerformanceMetrics): Promise<void> => {
  const inputStart = performance.now()
  console.log('📝 [CHATGPT] Sending prompt:', promptText.substring(0, 100) + '...')
  
  // Wait for page stability
  await page.waitForTimeout(3000)
  
  // Find input field
  let inputElement = null
  let inputSelector = null
  
  for (const selector of CHATGPT_CONFIG.inputSelectors) {
    try {
      await page.waitForSelector(selector, { timeout: 5000 })
      inputElement = page.locator(selector)
      if (await inputElement.isVisible()) {
        inputSelector = selector
        console.log('✅ [CHATGPT] Found input field with selector:', selector)
        break
      }
    } catch (error) {
      console.log('⏭️ [CHATGPT] Selector not found:', selector)
    }
  }
  
  if (!inputElement || !inputSelector) {
    // Fallback: use first available textarea
    const textareas = await page.locator('textarea').count()
    if (textareas > 0) {
      inputElement = page.locator('textarea').first()
      inputSelector = 'textarea'
      console.log('⚠️ [CHATGPT] Using fallback textarea selector')
    } else {
      throw new Error('No input field found on ChatGPT page')
    }
  }
  
  // Type the prompt
  await inputElement.fill(promptText)
  await page.waitForTimeout(1000)
  console.log('✅ [CHATGPT] Prompt entered')
  
  metrics.inputTime = performance.now() - inputStart
  
  // Send the message
  let sent = false
  
  for (const selector of CHATGPT_CONFIG.sendButtonSelectors) {
    try {
      const sendButton = page.locator(selector)
      if (await sendButton.isVisible()) {
        await sendButton.click()
        console.log('✅ [CHATGPT] Prompt sent via button:', selector)
        sent = true
        break
      }
    } catch (error) {
      console.log('⏭️ [CHATGPT] Send button not found:', selector)
    }
  }
  
  // Fallback: press Enter
  if (!sent) {
    await page.press(inputSelector, 'Enter')
    console.log('✅ [CHATGPT] Prompt sent via Enter key')
  }
}

/**
 * Wait for ChatGPT response with early capture strategy
 */
const waitForResponse = async (page: Page, metrics: PerformanceMetrics): Promise<void> => {
  const waitStart = performance.now()
  console.log('⏳ [CHATGPT] Waiting for response...')
  
  let responseSelector = null
  
  // Find response element
  for (const selector of CHATGPT_CONFIG.responseSelectors) {
    try {
      await page.waitForSelector(selector, { timeout: 5000 })
      const elements = await page.locator(selector).all()
      if (elements.length > 0) {
        responseSelector = selector
        console.log('✅ [CHATGPT] Found response with selector:', selector)
        break
      }
    } catch (error) {
      console.log('⏭️ [CHATGPT] Response selector not found:', selector)
    }
  }
  
  if (!responseSelector) {
    console.warn('⚠️ [CHATGPT] No response selector found, proceeding anyway...')
    metrics.responseWaitTime = performance.now() - waitStart
    return
  }
  
  // Early capture strategy: Monitor response growth
  let capturedLength = 0
  const maxWaitIterations = 8 // ~8 seconds max wait
  
  for (let i = 0; i < maxWaitIterations; i++) {
    try {
      const responses = await page.locator(responseSelector).all()
      const lastResponse = responses[responses.length - 1]
      
      if (lastResponse) {
        const currentText = await lastResponse.textContent()
        const currentLength = currentText ? currentText.length : 0
        
        console.log(`⏳ [CHATGPT] Response check ${i + 1}/${maxWaitIterations}: ${currentLength} chars`)
        
        // Capture once we have substantial content (500+ chars)
        if (currentLength > 500) {
          capturedLength = currentLength
          console.log(`✅ [CHATGPT] Early capture triggered at ${currentLength} chars`)
          
          // Wait just a bit more to get additional content
          await page.waitForTimeout(3000)
          break
        }
      }
      
      await page.waitForTimeout(1000)
    } catch (error) {
      console.error('❌ [CHATGPT] Response check failed:', error)
      break
    }
  }
  
  metrics.responseWaitTime = performance.now() - waitStart
  console.log(`✅ [CHATGPT] Response monitoring complete in ${metrics.responseWaitTime.toFixed(0)}ms`)
}

/**
 * Extract response text and citations from ChatGPT
 */
const extractResponse = async (page: Page, metrics: PerformanceMetrics): Promise<{ responseText: string; citations: ChatGPTCitation[] }> => {
  const extractStart = performance.now()
  console.log('📤 [CHATGPT] Extracting response and citations...')
  
  let responseText = ''
  let citations: ChatGPTCitation[] = []
  
  // Try to find response content
  for (const selector of CHATGPT_CONFIG.responseSelectors) {
    try {
      const responses = await page.locator(selector).all()
      if (responses.length > 0) {
        const lastResponse = responses[responses.length - 1]
        responseText = await lastResponse.textContent() || ''
        
        if (responseText.length > 0) {
          console.log(`✅ [CHATGPT] Found response text: ${responseText.length} characters`)
          
          // Extract citations - comprehensive approach
          try {
            // Method 1: Direct links in response
            const directLinks = await lastResponse.locator('a').evaluateAll((links) => {
              return links.map((link: any) => ({
                href: link.href,
                text: link.textContent?.trim() || '',
                title: link.title || '',
                type: 'direct_link' as const
              }))
            })
            
            // Method 2: Citation references
            const citationRefs = await lastResponse.locator('[data-citation], sup, .citation').evaluateAll((refs) => {
              return refs.map((ref: any) => ({
                text: ref.textContent?.trim() || '',
                type: 'citation_reference' as const,
                html: ref.outerHTML
              }))
            })
            
            // Method 3: Footnote-style citations
            const footnotes = await page.locator('ol li, .footnote, [role="note"]').evaluateAll((notes) => {
              return notes.map((note: any) => {
                const link = note.querySelector('a')
                return {
                  href: link ? link.href : '',
                  text: note.textContent?.trim() || '',
                  type: 'footnote' as const
                }
              }).filter((note: any) => note.href || note.text.includes('http'))
            })
            
            // Combine all citations
            citations = [
              ...directLinks.map((l: any) => ({ url: l.href, title: l.title, text: l.text, type: l.type })),
              ...citationRefs.map((r: any) => ({ url: '', text: r.text, type: r.type })),
              ...footnotes.map((f: any) => ({ url: f.href, text: f.text, type: f.type }))
            ].filter((c: any) => c.url || c.text)
            
            console.log(`✅ [CHATGPT] Extracted ${citations.length} citations`)
          } catch (error) {
            console.error('❌ [CHATGPT] Citation extraction failed:', error)
            citations = []
          }
          
          break
        }
      }
    } catch (error) {
      console.error('❌ [CHATGPT] Error with selector:', selector, error)
    }
  }
  
  if (!responseText) {
    console.warn('⚠️ [CHATGPT] No response text found, using fallback')
    const bodyText = await page.locator('body').textContent()
    responseText = bodyText ? bodyText.substring(0, 1000) : 'No response text found'
  }
  
  metrics.extractionTime = performance.now() - extractStart
  console.log(`✅ [CHATGPT] Extraction complete in ${metrics.extractionTime.toFixed(0)}ms`)
  console.log(`📊 [CHATGPT] Final: ${responseText.length} chars, ${citations.length} citations`)
  
  return { responseText, citations }
}

/**
 * Call ChatGPT API via Browserless automation
 */
export const callChatGPTAPI = async (prompt: string): Promise<ChatGPTResponse> => {
  const startTime = performance.now()
  const responseId = `chatgpt_${Date.now()}_${Math.random().toString(36).substring(7)}`
  
  const metrics: PerformanceMetrics = {
    connectionTime: 0,
    navigationTime: 0,
    inputTime: 0,
    responseWaitTime: 0,
    extractionTime: 0,
    totalTime: 0,
    trace: {
      timestamps: {
        start: startTime
      }
    }
  }
  
  let browser: Browser | null = null
  
  try {
    console.log('🚀 [CHATGPT] Starting ChatGPT automation for prompt:', prompt.substring(0, 100) + '...')
    
    // PHASE 1: Connect to Browserless
    const connStart = performance.now()
    browser = await connectToBrowserless()
    metrics.connectionTime = performance.now() - connStart
    metrics.trace!.timestamps.connected = performance.now()
    
    const context = browser.contexts()[0]
    const page = await context.newPage()
    
    // PHASE 2: Navigate to ChatGPT
    await navigateToChatGPT(page, metrics)
    metrics.trace!.timestamps.navigated = performance.now()
    
    // PHASE 3: Send prompt
    await sendPrompt(page, prompt, metrics)
    metrics.trace!.timestamps.promptSent = performance.now()
    
    // PHASE 4: Wait for response
    await waitForResponse(page, metrics)
    metrics.trace!.timestamps.responseReceived = performance.now()
    
    // PHASE 5: Extract response and citations
    const { responseText, citations } = await extractResponse(page, metrics)
    metrics.trace!.timestamps.extracted = performance.now()
    
    // Calculate total time
    metrics.totalTime = performance.now() - startTime
    
    console.log('✅ [CHATGPT] Automation completed successfully')
    console.log('📊 [CHATGPT] Performance metrics:', JSON.stringify(metrics, null, 2))
    
    return {
      id: responseId,
      provider: 'chatgpt',
      promptText: prompt,
      responseText,
      citations,
      responseTimeMs: metrics.totalTime,
      performanceMetrics: metrics
    }
    
  } catch (error) {
    console.error('❌ [CHATGPT] Automation failed:', error)
    
    metrics.totalTime = performance.now() - startTime
    
    return {
      id: responseId,
      provider: 'chatgpt',
      promptText: prompt,
      responseText: '',
      citations: [],
      responseTimeMs: metrics.totalTime,
      performanceMetrics: metrics,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  } finally {
    // Cleanup
    if (browser) {
      try {
        await browser.close()
        console.log('✅ [CHATGPT] Browser closed')
      } catch (error) {
        console.error('❌ [CHATGPT] Browser cleanup failed:', error)
      }
    }
  }
}

/**
 * Extract response content from ChatGPT response
 */
export const extractChatGPTContent = (response: ChatGPTResponse): string => {
  return response.responseText || ''
}

/**
 * Extract citations from ChatGPT response
 */
export const extractChatGPTCitations = (response: ChatGPTResponse): any[] => {
  return response.citations.map(citation => ({
    url: citation.url,
    title: citation.title || '',
    snippet: citation.text || '',
    domain: citation.url ? new URL(citation.url).hostname : ''
  }))
}

/**
 * Check if ChatGPT has results
 */
export const hasChatGPTResults = (response: ChatGPTResponse): boolean => {
  return !response.error && response.responseText.length > 100
}




