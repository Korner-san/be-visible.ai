/**
 * ChatGPT via Browserless Integration
 * 
 * Uses Browserless headless browser to:
 * 1. Navigate to ChatGPT.com
 * 2. Authenticate with session cookies
 * 3. Submit prompts and extract responses + citations
 * 4. Save results to Supabase (same schema as Perplexity/Google AO)
 */

import { chromium, Browser, Page } from 'playwright';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// TYPES
// ============================================================================

export interface ChatGPTAccount {
  id: string;
  email: string;
  display_name: string | null;
  account_type: string;
  session_token: string;
  csrf_token: string | null;
  auth_info: string | null;
  cloudflare_clearance: string | null;
  session_context: string | null;
  device_id: string | null;
  callback_url: string | null;
  state_token: string | null;
  status: string;
}

export interface ChatGPTPromptResult {
  promptId: string;
  promptText: string;
  responseText: string;
  citations: Array<{
    url: string;
    title: string;
  }>;
  timeMs: number;
  success: boolean;
  error?: string;
}

export interface ChatGPTBatchResult {
  brandId: string;
  reportDate: string;
  totalPrompts: number;
  successfulPrompts: number;
  totalCitations: number;
  results: ChatGPTPromptResult[];
  totalTimeMs: number;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  browserless: {
    endpoint: process.env.BROWSERLESS_ENDPOINT || 'wss://production-sfo.browserless.io/chromium/stealth',
    token: process.env.BROWSERLESS_TOKEN || process.env.BROWSERLESS_API_KEY,
    timeout: 900000, // 15 minutes
  },
  chatgpt: {
    url: 'https://chatgpt.com',
    responseStabilityChecks: 3,
    responseStabilityInterval: 1500, // ms
    maxWaitIterations: 40,
    postClickWait: 1000,
  },
  performance: {
    enableTracing: false, // Set to true for detailed performance analysis
  },
};

// ============================================================================
// LOGGER
// ============================================================================

class Logger {
  private timers: Map<string, number> = new Map();

  log(message: string, level: 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR' = 'INFO') {
    const timestamp = Date.now();
    const prefix = {
      INFO: 'ℹ️',
      SUCCESS: '✅',
      WARN: '⚠️',
      ERROR: '❌',
    }[level];
    console.log(`[${timestamp}ms] [${level}] ${prefix} ${message}`);
  }

  startTimer(name: string) {
    this.timers.set(name, Date.now());
  }

  endTimer(name: string): number {
    const start = this.timers.get(name);
    if (!start) return 0;
    const duration = Date.now() - start;
    this.log(`⏱️  ${name}: ${duration}ms`, 'INFO');
    this.timers.delete(name);
    return duration;
  }
}

const logger = new Logger();

// ============================================================================
// BROWSERLESS CONNECTION
// ============================================================================

async function connectToBrowserless(account: ChatGPTAccount): Promise<Browser> {
  logger.log('🌐 Connecting to Browserless...');
  logger.startTimer('connection');

  // Validate Browserless token
  if (!CONFIG.browserless.token) {
    throw new Error('BROWSERLESS_TOKEN or BROWSERLESS_API_KEY environment variable is not set');
  }

  const wsEndpoint = `${CONFIG.browserless.endpoint}?token=${CONFIG.browserless.token}&proxy=residential&proxyCountry=us&proxySticky=true`;
  
  logger.log(`📡 WebSocket endpoint: ${CONFIG.browserless.endpoint}`);
  logger.log(`🔑 Token length: ${CONFIG.browserless.token.length} characters`);

  try {
    const browser = await chromium.connect(wsEndpoint, {
      timeout: 60000, // 60 seconds (reduced from 15 minutes)
    });
    
    logger.log('✅ Connected to Browserless successfully', 'SUCCESS');
    
    // Get the default context and set cookies
    const context = browser.contexts()[0];
  
  const cookies = [
    {
      name: '__Secure-next-auth.session-token',
      value: account.session_token,
      domain: '.chatgpt.com',
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'Lax' as const,
    },
  ];

  // Add optional cookies if available
  if (account.csrf_token) {
    cookies.push({
      name: '__Host-next-auth.csrf-token',
      value: account.csrf_token,
      domain: 'chatgpt.com',
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'Lax' as const,
    });
  }

  if (account.auth_info) {
    cookies.push({
      name: 'oai-client-auth-info',
      value: account.auth_info,
      domain: '.chatgpt.com',
      path: '/',
      secure: true,
      httpOnly: false,
      sameSite: 'Lax',
    });
  }

  if (account.cloudflare_clearance) {
    cookies.push({
      name: 'cf_clearance',
      value: account.cloudflare_clearance,
      domain: '.chatgpt.com',
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'Lax',
    });
  }

    await context.addCookies(cookies);

    logger.endTimer('connection');
    logger.log(`✅ Connected with ${account.display_name || account.email} cookies`, 'SUCCESS');

    return browser;
  } catch (error) {
    logger.log(`❌ Connection failed: ${(error as Error).message}`, 'ERROR');
    logger.log(`📊 Error details: ${JSON.stringify(error)}`, 'ERROR');
    throw new Error(`Failed to connect to Browserless: ${(error as Error).message}`);
  }
}

// ============================================================================
// CHATGPT AUTOMATION
// ============================================================================

async function processPrompt(
  page: Page,
  prompt: { id: string; text: string },
  promptIndex: number
): Promise<ChatGPTPromptResult> {
  logger.log('');
  logger.log('='.repeat(60));
  logger.log(`📝 PROCESSING PROMPT ${promptIndex + 1}`);
  logger.log('='.repeat(60));
  logger.startTimer(`prompt_${promptIndex + 1}`);

  const result: ChatGPTPromptResult = {
    promptId: prompt.id,
    promptText: prompt.text,
    responseText: '',
    citations: [],
    timeMs: 0,
    success: false,
  };

  try {
    // Type prompt
    logger.log(`📝 Typing prompt: "${prompt.text.substring(0, 60)}..."`);
    const textarea = page.locator('#prompt-textarea').first();
    await textarea.waitFor({ state: 'visible', timeout: 5000 });
    await textarea.fill(prompt.text);

    // Send
    await page.locator('button[data-testid="send-button"]').click();
    logger.log('✅ Prompt sent');

    // Wait for response to complete
    logger.log('⏳ Waiting for response...');
    await page.waitForTimeout(5000); // Initial wait for response to start

    let stable = 0;
    let lastLength = 0;

    for (let i = 0; i < CONFIG.chatgpt.maxWaitIterations; i++) {
      await page.waitForTimeout(CONFIG.chatgpt.responseStabilityInterval);
      const messages = await page.locator('[data-message-author-role="assistant"]').all();

      if (messages.length === 0) continue;

      const currentLength = (await messages[messages.length - 1]?.textContent() || '').length;

      if (currentLength === lastLength && currentLength > 0) {
        stable++;
        if (stable >= CONFIG.chatgpt.responseStabilityChecks) {
          logger.log(`✅ Response stable at ${currentLength} chars`);
          break;
        }
      } else {
        stable = 0;
      }
      lastLength = currentLength;
    }

    // Extract response text
    const messages = await page.locator('[data-message-author-role="assistant"]').all();
    const lastMessage = messages[messages.length - 1];
    const responseText = await lastMessage?.textContent() || '';

    logger.log(`✅ Response: ${responseText.length} characters`, 'SUCCESS');
    result.responseText = responseText;

    // Extract citations
    logger.log('🔍 Looking for Sources button...');

    const sourcesButton = page.locator('button').filter({ hasText: /sources/i }).first();
    const hasSourcesButton = await sourcesButton.count() > 0;

    let citations: Array<{ url: string; title: string }> = [];

    if (hasSourcesButton) {
      logger.log('✅ Found Sources button, clicking...');
      await sourcesButton.click();
      await page.waitForTimeout(CONFIG.chatgpt.postClickWait);

      const citationLinks = await page.locator('[role="dialog"] a[href^="http"]').all();
      logger.log(`🔍 Found ${citationLinks.length} citation links`);

      const linkPromises = citationLinks.map(async (link) => {
        try {
          let href = await link.getAttribute('href');
          const text = (await link.textContent() || '').trim();

          // Extract actual URL from ChatGPT redirect
          if (href && href.includes('chatgpt.com/link')) {
            const url = new URL(href);
            const actualUrl = url.searchParams.get('url');
            if (actualUrl) href = actualUrl;
          }

          if (href) {
            const urlObj = new URL(href);
            const domain = urlObj.hostname;

            if (!domain.includes('chatgpt.com') && text.length > 0) {
              return { url: href, title: text };
            }
          }
        } catch (e) {
          // Skip invalid links
        }
        return null;
      });

      const results = await Promise.all(linkPromises);
      citations = results.filter((c): c is { url: string; title: string } => c !== null);

      logger.log(`✅ Extracted ${citations.length} citations`, 'SUCCESS');

      // Close the Links panel
      logger.log('🔄 Closing Links panel...');
      const closeButton = page.locator('[role="dialog"] button[aria-label="Close"]').first();
      if (await closeButton.count() > 0) {
        await closeButton.click();
        await page.waitForTimeout(500);
        logger.log('✅ Links panel closed');
      }
    } else {
      logger.log('⚠️  No Sources button found', 'WARN');
    }

    result.citations = citations;

    // Start new conversation for next prompt (Ctrl+Shift+O)
    logger.log('🔄 Starting new conversation (Ctrl+Shift+O)...');
    await page.keyboard.press('Control+Shift+KeyO');
    await page.waitForTimeout(2000);
    logger.log('✅ New conversation started');

    result.timeMs = logger.endTimer(`prompt_${promptIndex + 1}`);
    result.success = true;

    return result;
  } catch (error) {
    logger.log(`❌ Failed to process prompt: ${(error as Error).message}`, 'ERROR');
    result.error = (error as Error).message;
    result.timeMs = logger.endTimer(`prompt_${promptIndex + 1}`);
    return result;
  }
}

// ============================================================================
// MAIN BATCH PROCESSING
// ============================================================================

export async function processChatGPTBatch(
  brandId: string,
  prompts: Array<{ id: string; text: string }>,
  reportDate: string
): Promise<ChatGPTBatchResult> {
  logger.log('═'.repeat(60));
  logger.log('🚀 CHATGPT BATCH PROCESSING');
  logger.log('═'.repeat(60));
  logger.startTimer('total_batch');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  let browser: Browser | null = null;

  const batchResult: ChatGPTBatchResult = {
    brandId,
    reportDate,
    totalPrompts: prompts.length,
    successfulPrompts: 0,
    totalCitations: 0,
    results: [],
    totalTimeMs: 0,
  };

  try {
    // Load ChatGPT account
    logger.log('📊 Loading ChatGPT account...');
    const { data: account, error: accountError } = await supabase
      .from('chatgpt_accounts')
      .select('*')
      .eq('status', 'active')
      .limit(1)
      .single();

    if (accountError || !account) {
      throw new Error(`No active ChatGPT account found: ${accountError?.message}`);
    }

    logger.log(`✅ Loaded: ${account.display_name || account.email}`, 'SUCCESS');

    // Connect to Browserless
    browser = await connectToBrowserless(account);
    const page = await browser.contexts()[0].pages()[0] || await browser.contexts()[0].newPage();

    // Navigate to ChatGPT
    logger.log('🌐 Navigating to ChatGPT...');
    await page.goto(CONFIG.chatgpt.url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(CONFIG.chatgpt.responseStabilityInterval);
    logger.log('✅ Loaded: ChatGPT');

    // Process each prompt
    logger.log(`🔄 Will process ${prompts.length} prompts in ${prompts.length} separate conversations`);

    for (let i = 0; i < prompts.length; i++) {
      const result = await processPrompt(page, prompts[i], i);
      batchResult.results.push(result);
      if (result.success) {
        batchResult.successfulPrompts++;
        batchResult.totalCitations += result.citations.length;
      }
    }

    batchResult.totalTimeMs = logger.endTimer('total_batch');

    logger.log('');
    logger.log('═'.repeat(60), 'SUCCESS');
    logger.log('✅ BATCH PROCESSING COMPLETED', 'SUCCESS');
    logger.log('═'.repeat(60), 'SUCCESS');
    logger.log(`📊 Prompts Processed: ${batchResult.successfulPrompts}/${batchResult.totalPrompts}`, 'SUCCESS');
    logger.log(`📚 Total Citations: ${batchResult.totalCitations}`, 'SUCCESS');
    logger.log(`⏱️  Total Time: ${batchResult.totalTimeMs}ms`, 'SUCCESS');

    return batchResult;
  } catch (error) {
    logger.log(`❌ BATCH PROCESSING FAILED: ${(error as Error).message}`, 'ERROR');
    throw error;
  } finally {
    if (browser) {
      await browser.close();
      logger.log('🔒 Browser closed');
    }
  }
}

// ============================================================================
// SAVE TO SUPABASE
// ============================================================================

export async function saveChatGPTResults(
  supabase: SupabaseClient,
  dailyReportId: string,
  results: ChatGPTPromptResult[]
): Promise<void> {
  logger.log('💾 Saving ChatGPT results to Supabase...');

  for (const result of results) {
    try {
      // Save prompt_results
      const { error: promptError } = await supabase
        .from('prompt_results')
        .upsert(
          {
            daily_report_id: dailyReportId,
            brand_prompt_id: result.promptId,
            provider: 'chatgpt',
            chatgpt_response: result.responseText,
            chatgpt_response_time_ms: result.timeMs,
            chatgpt_citations: result.citations.map((c) => c.url),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: 'daily_report_id,brand_prompt_id',
          }
        );

      if (promptError) {
        logger.log(`❌ Error saving prompt result: ${promptError.message}`, 'ERROR');
        continue;
      }

      // Save individual citations
      for (const citation of result.citations) {
        const { error: citationError } = await supabase
          .from('url_inventory')
          .upsert(
            {
              url: citation.url,
              title: citation.title,
              domain: new URL(citation.url).hostname,
              first_seen_date: new Date().toISOString().split('T')[0],
              last_seen_date: new Date().toISOString().split('T')[0],
              total_mentions: 1,
              source_provider: 'chatgpt',
            },
            {
              onConflict: 'url',
            }
          );

        if (citationError) {
          logger.log(`⚠️  Warning: Could not save citation ${citation.url}`, 'WARN');
        }
      }

      logger.log(`✅ Saved results for prompt: ${result.promptText.substring(0, 40)}...`, 'SUCCESS');
    } catch (error) {
      logger.log(`❌ Error saving result: ${(error as Error).message}`, 'ERROR');
    }
  }

  logger.log('✅ All results saved', 'SUCCESS');
}

// ============================================================================
// HTTP API VERSION (FOR RENDER - NO WEBSOCKET)
// ============================================================================

/**
 * Process ChatGPT batch using Browserless HTTP API
 * This version sends Playwright code as a string to Browserless
 * Works on Render (no WebSocket required)
 */
export async function processChatGPTBatchHTTP(
  brandId: string,
  prompts: Array<{ id: string; text: string }>,
  reportDate: string
): Promise<ChatGPTBatchResult> {
  logger.log('═'.repeat(60));
  logger.log('🚀 CHATGPT BATCH PROCESSING (HTTP MODE)');
  logger.log('═'.repeat(60));
  logger.startTimer('total_batch');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const batchResult: ChatGPTBatchResult = {
    brandId,
    reportDate,
    totalPrompts: prompts.length,
    successfulPrompts: 0,
    totalCitations: 0,
    results: [],
    totalTimeMs: 0,
  };

  try {
    // Load ChatGPT account from Supabase
    logger.log('📊 Loading ChatGPT account from Supabase...');
    const { data: account, error: accountError } = await supabase
      .from('chatgpt_accounts')
      .select('*')
      .eq('status', 'active')
      .limit(1)
      .single();

    if (accountError || !account) {
      throw new Error(`No active ChatGPT account found: ${accountError?.message}`);
    }

    logger.log(`✅ Loaded: ${account.display_name || account.email} (${account.email})`, 'SUCCESS');

    // Prepare cookies from account
    const cookies = [
      {
        name: '__Secure-next-auth.session-token',
        value: account.session_token,
        domain: '.chatgpt.com',
        path: '/',
        secure: true,
        httpOnly: true,
        sameSite: 'Lax',
      },
    ];

    if (account.csrf_token) {
      cookies.push({
        name: '__Host-next-auth.csrf-token',
        value: account.csrf_token,
        domain: 'chatgpt.com',
        path: '/',
        secure: true,
        httpOnly: true,
        sameSite: 'Lax',
      });
    }

    if (account.auth_info) {
      cookies.push({
        name: 'oai-client-auth-info',
        value: account.auth_info,
        domain: '.chatgpt.com',
        path: '/',
        secure: true,
        httpOnly: false,
        sameSite: 'Lax',
      });
    }

    if (account.cloudflare_clearance) {
      cookies.push({
        name: 'cf_clearance',
        value: account.cloudflare_clearance,
        domain: '.chatgpt.com',
        path: '/',
        secure: true,
        httpOnly: true,
        sameSite: 'Lax',
      });
    }

    logger.log(`🍪 Prepared ${cookies.length} cookies for authentication`);

    // Create Playwright script for Browserless HTTP API
    const playwrightCode = `
      const { chromium } = require('playwright');
      
      module.exports = async () => {
        const browser = await chromium.launch({ headless: true });
        const context = await browser.newContext();
        
        // Add cookies
        const cookies = ${JSON.stringify(cookies)};
        await context.addCookies(cookies);
        
        const page = await context.newPage();
        
        // Navigate to ChatGPT
        await page.goto('https://chatgpt.com', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);
        
        const results = [];
        const prompts = ${JSON.stringify(prompts)};
        
        // Process each prompt
        for (let i = 0; i < prompts.length; i++) {
          const prompt = prompts[i];
          const result = {
            promptId: prompt.id,
            promptText: prompt.text,
            responseText: '',
            citations: [],
            success: false,
            error: null
          };
          
          try {
            // Type prompt
            const textarea = page.locator('#prompt-textarea').first();
            await textarea.waitFor({ state: 'visible', timeout: 5000 });
            await textarea.fill(prompt.text);
            
            // Send
            await page.locator('button[data-testid="send-button"]').click();
            
            // Wait for response to complete
            await page.waitForTimeout(5000);
            
            let stable = 0;
            let lastLength = 0;
            
            for (let j = 0; j < 30; j++) {
              await page.waitForTimeout(1000);
              const messages = await page.locator('[data-message-author-role="assistant"]').all();
              
              if (messages.length === 0) continue;
              
              const currentLength = (await messages[messages.length - 1]?.textContent() || '').length;
              
              if (currentLength === lastLength && currentLength > 0) {
                stable++;
                if (stable >= 3) break;
              } else {
                stable = 0;
              }
              lastLength = currentLength;
            }
            
            // Extract response text
            const messages = await page.locator('[data-message-author-role="assistant"]').all();
            const lastMessage = messages[messages.length - 1];
            result.responseText = await lastMessage?.textContent() || '';
            
            // Extract citations
            const sourcesButton = page.locator('button').filter({ hasText: /sources/i }).first();
            const hasSourcesButton = await sourcesButton.count() > 0;
            
            if (hasSourcesButton) {
              await sourcesButton.click();
              await page.waitForTimeout(2000);
              
              const citationLinks = await page.locator('[role="dialog"] a[href^="http"]').all();
              
              for (const link of citationLinks) {
                try {
                  let href = await link.getAttribute('href');
                  const text = (await link.textContent() || '').trim();
                  
                  // Extract actual URL from ChatGPT redirect
                  if (href && href.includes('chatgpt.com/link')) {
                    const url = new URL(href);
                    const actualUrl = url.searchParams.get('url');
                    if (actualUrl) href = actualUrl;
                  }
                  
                  if (href) {
                    const urlObj = new URL(href);
                    const domain = urlObj.hostname;
                    
                    if (!domain.includes('chatgpt.com') && text.length > 0) {
                      result.citations.push({ url: href, title: text });
                    }
                  }
                } catch (e) {
                  // Skip invalid links
                }
              }
              
              // Close the Links panel
              const closeButton = page.locator('[role="dialog"] button[aria-label="Close"]').first();
              if (await closeButton.count() > 0) {
                await closeButton.click();
                await page.waitForTimeout(500);
              }
            }
            
            result.success = true;
            
            // Start new conversation for next prompt (Ctrl+Shift+O)
            await page.keyboard.press('Control+Shift+KeyO');
            await page.waitForTimeout(2000);
            
          } catch (error) {
            result.error = error.message;
          }
          
          results.push(result);
        }
        
        await browser.close();
        return results;
      };
    `;

    // Call Browserless HTTP API
    logger.log('🌐 Sending function to Browserless HTTP API...');
    const browserlessUrl = `https://production-sfo.browserless.io/function?token=${CONFIG.browserless.token}`;
    
    const response = await fetch(browserlessUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        code: playwrightCode,
        context: {
          timeout: 300000, // 5 minutes
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Browserless HTTP API error (${response.status}): ${errorText}`);
    }

    logger.log('✅ Browserless HTTP API call successful');
    
    const httpResults = await response.json() as any[];
    logger.log(`📦 Received ${httpResults.length} results from Browserless`);

    // Parse results
    for (const httpResult of httpResults) {
      const result: ChatGPTPromptResult = {
        promptId: httpResult.promptId,
        promptText: httpResult.promptText,
        responseText: httpResult.responseText,
        citations: httpResult.citations,
        timeMs: 0,
        success: httpResult.success,
        error: httpResult.error,
      };

      batchResult.results.push(result);
      if (result.success) {
        batchResult.successfulPrompts++;
        batchResult.totalCitations += result.citations.length;
      }
    }

    batchResult.totalTimeMs = logger.endTimer('total_batch');

    logger.log('');
    logger.log('═'.repeat(60), 'SUCCESS');
    logger.log('✅ HTTP BATCH PROCESSING COMPLETED', 'SUCCESS');
    logger.log('═'.repeat(60), 'SUCCESS');
    logger.log(`📊 Prompts Processed: ${batchResult.successfulPrompts}/${batchResult.totalPrompts}`, 'SUCCESS');
    logger.log(`📚 Total Citations: ${batchResult.totalCitations}`, 'SUCCESS');
    logger.log(`⏱️  Total Time: ${batchResult.totalTimeMs}ms`, 'SUCCESS');

    return batchResult;
  } catch (error) {
    logger.log(`❌ HTTP BATCH PROCESSING FAILED: ${(error as Error).message}`, 'ERROR');
    throw error;
  }
}

// ============================================================================
// MODE SWITCHING WRAPPER
// ============================================================================

/**
 * Main export - switches between WebSocket and HTTP based on env var
 * Default: HTTP (for Render compatibility)
 */
export async function processChatGPTBatchAuto(
  brandId: string,
  prompts: Array<{ id: string; text: string }>,
  reportDate: string
): Promise<ChatGPTBatchResult> {
  const mode = process.env.BROWSERLESS_MODE || 'http';
  
  logger.log(`🔧 Browserless mode: ${mode.toUpperCase()}`);
  
  if (mode === 'websocket') {
    logger.log('📡 Using WebSocket connection (for Fly.io / local dev)');
    return processChatGPTBatch(brandId, prompts, reportDate);
  } else {
    logger.log('🌐 Using HTTP API (for Render)');
    return processChatGPTBatchHTTP(brandId, prompts, reportDate);
  }
}


