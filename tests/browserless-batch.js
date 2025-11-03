/**
 * Browserless ChatGPT Batch Test - 10 Prompts with New Chat
 * 
 * Current: 10 prompts per run, each in a fresh conversation
 * 
 * Flow for each prompt:
 * 1. Type prompt → Wait for response
 * 2. Click Sources → Extract citations → Close panel
 * 3. Click "New chat" → Start fresh conversation
 * 4. Repeat for next prompt
 */

require('dotenv').config({ path: '.env.local' });

const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs/promises');

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  browserless: {
    token: process.env.BROWSERLESS_API_KEY || process.env.BROWSERLESS_TOKEN,
    endpoint: 'wss://production-sfo.browserless.io/chromium/stealth',
    proxyCountry: 'us',
    proxySticky: true,
    timeout: 900000
  },
  supabase: {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY
  },
  account: {
    email: 'kk1995current@gmail.com'
  },
  batch: {
    promptCount: 10,                    // Process 10 prompts per run
    totalPrompts: 10,                   // Total prompts to fetch
    projectName: null,                  // No project - use regular conversation
    usedPromptsFile: 'tests/used-prompts.json'  // Track used prompts
  },
  optimization: {
    navigationWait: 5000,
    postClickWait: 1000,
    stabilityChecks: 3,
    stabilityInterval: 1500,
    maxWaitIterations: 40
  }
};

// Logger with timing
const logger = {
  start: Date.now(),
  timers: {},
  log: (msg, level = 'INFO') => {
    const elapsed = Date.now() - logger.start;
    console.log(`[${elapsed}ms] [${level}] ${msg}`);
  },
  startTimer: (name) => {
    logger.timers[name] = Date.now();
  },
  endTimer: (name) => {
    const elapsed = Date.now() - (logger.timers[name] || Date.now());
    logger.log(`⏱️  ${name}: ${elapsed}ms`, 'TIMER');
    return elapsed;
  }
};

// ============================================================================
// SUPABASE: LOAD ACCOUNT & FETCH PROMPTS
// ============================================================================

async function loadAccount(supabase, email) {
  logger.log(`📊 Loading ChatGPT account: ${email}`);
  
  const { data, error } = await supabase
    .from('chatgpt_accounts')
    .select('*')
    .eq('email', email)
    .limit(1)
    .single();
  
  if (error || !data) {
    throw new Error(`Account not found: ${error?.message}`);
  }
  
  // Reset status if needed
  if (data.status !== 'active') {
    logger.log(`⚠️  Account status was "${data.status}", resetting to active...`, 'WARN');
    await supabase
      .from('chatgpt_accounts')
      .update({ status: 'active', error_message: null })
      .eq('email', email);
    data.status = 'active';
  }
  
  logger.log(`✅ Loaded: ${data.display_name}`, 'SUCCESS');
  return data;
}

async function loadUsedPrompts() {
  try {
    const data = await fs.readFile(CONFIG.batch.usedPromptsFile, 'utf-8');
    return new Set(JSON.parse(data));
  } catch (e) {
    return new Set(); // File doesn't exist yet
  }
}

async function saveUsedPrompts(usedPrompts) {
  await fs.writeFile(
    CONFIG.batch.usedPromptsFile,
    JSON.stringify([...usedPrompts], null, 2)
  );
}

async function fetchUserPrompts(supabase, email, totalLimit = 10, selectCount = 3) {
  logger.log(`📋 Fetching ${totalLimit} prompts for ${email}...`);
  
  // First get the user ID from email
  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .single();
  
  if (userError || !userData) {
    throw new Error(`User not found: ${email}`);
  }
  
  // Get ALL prompts (no status filter) from brands owned by this user
  const { data, error } = await supabase
    .from('brand_prompts')
    .select('id, raw_prompt, brand_id, brands!inner(owner_user_id)')
    .eq('brands.owner_user_id', userData.id)
    .limit(totalLimit);
  
  if (error) {
    throw new Error(`Failed to fetch prompts: ${error.message}`);
  }
  
  if (!data || data.length === 0) {
    throw new Error(`No prompts found for ${email}`);
  }
  
  // Transform to match expected format
  const allPrompts = data.map(p => ({
    id: p.id,
    prompt_text: p.raw_prompt,
    brand_id: p.brand_id
  }));
  
  logger.log(`✅ Found ${allPrompts.length} total prompts`, 'SUCCESS');
  
  // Load used prompts and filter them out
  const usedPrompts = await loadUsedPrompts();
  const unusedPrompts = allPrompts.filter(p => !usedPrompts.has(p.id));
  
  logger.log(`   ${unusedPrompts.length} unused prompts available`);
  
  // If we've used all prompts, reset and use all again
  if (unusedPrompts.length < selectCount) {
    logger.log(`   ⚠️  Only ${unusedPrompts.length} unused prompts, resetting tracker...`, 'WARN');
    await saveUsedPrompts(new Set());
    return allPrompts.slice(0, selectCount);
  }
  
  // Select the first N unused prompts
  const selectedPrompts = unusedPrompts.slice(0, selectCount);
  logger.log(`✅ Selected ${selectedPrompts.length} unused prompts`, 'SUCCESS');
  
  return selectedPrompts;
}

async function updateStatus(supabase, email, status, errorMsg = null) {
  const updates = {
    status,
    last_used_at: new Date().toISOString(),
    error_message: errorMsg
  };
  
  if (status === 'active') {
    updates.last_validated_at = new Date().toISOString();
    updates.error_message = null;
  }
  
  await supabase
    .from('chatgpt_accounts')
    .update(updates)
    .eq('email', email);
}

// ============================================================================
// BROWSERLESS CONNECTION
// ============================================================================

async function connect(account) {
  logger.startTimer('connection');
  logger.log('🌐 Connecting to Browserless...');
  
  const params = new URLSearchParams({
    token: CONFIG.browserless.token,
    proxy: 'residential',
    proxyCountry: CONFIG.browserless.proxyCountry,
    proxySticky: CONFIG.browserless.proxySticky.toString()
  });
  
  const browser = await chromium.connectOverCDP(`${CONFIG.browserless.endpoint}?${params.toString()}`);
  const context = browser.contexts()[0];
  
  // Set user agent
  await context.setExtraHTTPHeaders({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0',
    'Accept-Language': 'en-US,en;q=0.9'
  });
  
  // Add cookies from database
  await context.addCookies([
    {
      name: '__Secure-next-auth.session-token',
      value: account.session_token,
      domain: '.chatgpt.com',
      path: '/',
      secure: true,
      sameSite: 'Lax'
    },
    {
      name: '__Host-next-auth.csrf-token',
      value: account.csrf_token,
      domain: 'chatgpt.com',
      path: '/',
      secure: true,
      sameSite: 'Lax'
    },
    {
      name: 'cf_clearance',
      value: account.cloudflare_clearance,
      domain: '.chatgpt.com',
      path: '/',
      secure: true,
      sameSite: 'None'
    },
    {
      name: 'oai-sc',
      value: account.session_context,
      domain: '.chatgpt.com',
      path: '/',
      secure: true,
      sameSite: 'None'
    },
    {
      name: 'oai-did',
      value: account.device_id,
      domain: '.chatgpt.com',
      path: '/',
      sameSite: 'Lax'
    },
    {
      name: 'oai-client-auth-info',
      value: account.auth_info,
      domain: 'chatgpt.com',
      path: '/',
      sameSite: 'Lax'
    }
  ]);
  
  logger.endTimer('connection');
  logger.log(`✅ Connected with ${account.display_name} cookies`, 'SUCCESS');
  return browser;
}

// ============================================================================
// CHATGPT PROJECT NAVIGATION
// ============================================================================

async function clickBrandMonitoringProject(page, projectName, scrollFirst = false) {
  logger.log(`📁 Clicking "${projectName}" project...`);
  
  // If scrollFirst, scroll down in the sidebar to find the project
  if (scrollFirst) {
    logger.log('📜 Scrolling sidebar down to reveal projects...');
    const sidebar = page.locator('nav').first();
    await sidebar.evaluate((el) => {
      el.scrollTop += 200; // Scroll down 200px
    });
    await page.waitForTimeout(500);
  }
  
  // Try multiple selectors for the project button
  const selectors = [
    `button:has-text("${projectName}")`,
    `a:has-text("${projectName}")`,
    `[role="button"]:has-text("${projectName}")`,
    `.sidebar button:has-text("${projectName}")`
  ];
  
  for (const selector of selectors) {
    try {
      const button = page.locator(selector).first();
      if (await button.count() > 0) {
        await button.click();
        await page.waitForTimeout(CONFIG.optimization.postClickWait);
        logger.log(`✅ Clicked "${projectName}" project`, 'SUCCESS');
        return true;
      }
    } catch (e) {
      // Try next selector
    }
  }
  
  throw new Error(`Could not find "${projectName}" project in sidebar`);
}

// ============================================================================
// PROMPT PROCESSING
// ============================================================================

async function processPrompt(page, prompt, promptIndex) {
  logger.log('');
  logger.log(`${'='.repeat(60)}`);
  logger.log(`📝 PROCESSING PROMPT ${promptIndex + 1}/${CONFIG.batch.promptCount}`, 'INFO');
  logger.log(`${'='.repeat(60)}`);
  logger.startTimer(`prompt_${promptIndex + 1}`);
  
  try {
    /* COMMENTED OUT - Multi-prompt with project navigation
    // Click BRAND MONITORING project to start new conversation
    // For prompts 2+, scroll the sidebar first to reveal the project
    const shouldScroll = promptIndex > 0;
    await clickBrandMonitoringProject(page, CONFIG.batch.projectName, shouldScroll);
    */
    
    // Find and type into textarea
    logger.log(`📝 Typing prompt: "${prompt.prompt_text.substring(0, 60)}..."`);
    const textarea = page.locator('#prompt-textarea').first();
    await textarea.waitFor({ state: 'visible', timeout: 5000 });
    await textarea.fill(prompt.prompt_text);
    
    // Send
    await page.locator('button[data-testid="send-button"]').click();
    logger.log('✅ Prompt sent');
    
    // Wait for response to complete
    logger.log('⏳ Waiting for response...');
    await page.waitForTimeout(5000); // Initial wait for response to start
    
    let stable = 0;
    let lastLength = 0;
    
    for (let i = 0; i < CONFIG.optimization.maxWaitIterations; i++) {
      await page.waitForTimeout(CONFIG.optimization.stabilityInterval);
      const messages = await page.locator('[data-message-author-role="assistant"]').all();
      
      if (messages.length === 0) continue;
      
      const currentLength = (await messages[messages.length - 1]?.textContent() || '').length;
      
      if (currentLength === lastLength && currentLength > 0) {
        stable++;
        if (stable >= CONFIG.optimization.stabilityChecks) {
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
    
    // Extract citations - OLD WORKING VERSION
    logger.log('🔍 Looking for Sources button...');
    
    const sourcesButton = page.locator('button').filter({ hasText: /sources/i }).first();
    const hasSourcesButton = await sourcesButton.count() > 0;
    
    let citations = [];
    if (hasSourcesButton) {
      logger.log('✅ Found Sources button, clicking...');
      await sourcesButton.click();
      await page.waitForTimeout(CONFIG.optimization.postClickWait);
      
      // Take screenshot AFTER clicking Sources (now at bottom with panel open)
      logger.log('📸 Taking screenshot with Sources panel open...');
      await page.screenshot({ path: `tests/prompt-${promptIndex + 1}-with-sources.png`, fullPage: false });
      logger.log(`✅ Screenshot saved`);
      
      const citationLinks = await page.locator('[role="dialog"] a[href^="http"]').all();
      logger.log(`🔍 Found ${citationLinks.length} citation links`);
      
      const linkPromises = citationLinks.map(async (link) => {
        try {
          let href = await link.getAttribute('href');
          const text = (await link.textContent() || '').trim();
          
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
      citations = results.filter(c => c !== null);
      
      logger.log(`✅ Extracted ${citations.length} citations`, 'SUCCESS');
      
      // Close the Links panel by clicking X
      logger.log('🔄 Closing Links panel...');
      const closeButton = page.locator('[role="dialog"] button[aria-label="Close"]').first();
      if (await closeButton.count() > 0) {
        await closeButton.click();
        await page.waitForTimeout(500);
        logger.log('✅ Links panel closed');
      } else {
        const altCloseButton = page.locator('[role="dialog"] button').filter({ hasText: 'X' }).first();
        if (await altCloseButton.count() > 0) {
          await altCloseButton.click();
          await page.waitForTimeout(500);
          logger.log('✅ Links panel closed (alt method)');
        }
      }
    } else {
      logger.log('⚠️  No Sources button found - taking screenshot anyway', 'WARN');
      await page.screenshot({ path: `tests/prompt-${promptIndex + 1}-no-sources.png`, fullPage: false });
    }
    
    // Start new conversation for next prompt using Ctrl+Shift+O
    // (Skip for the last prompt since there's no next one)
    if (promptIndex < CONFIG.batch.promptCount - 1) {
      logger.log('🔄 Starting new conversation (Ctrl+Shift+O)...');
      await page.keyboard.press('Control+Shift+KeyO');
      await page.waitForTimeout(2000); // Wait for new chat to load
      logger.log('✅ New conversation started');
    }
    
    const promptTime = logger.endTimer(`prompt_${promptIndex + 1}`);
    
    return {
      promptId: prompt.id,
      promptText: prompt.prompt_text,
      responseText,
      responseLength: responseText.length,
      citations,
      citationCount: citations.length,
      timeMs: promptTime
    };
    
  } catch (error) {
    logger.log(`❌ Failed to process prompt: ${error.message}`, 'ERROR');
    throw error;
  }
}

// ============================================================================
// MAIN BATCH PROCESSING
// ============================================================================

async function runBatchTest() {
  const supabase = createClient(CONFIG.supabase.url, CONFIG.supabase.serviceKey);
  let browser;
  
  try {
    logger.startTimer('total_batch');
    logger.log('═══════════════════════════════════════════════════════');
    logger.log('🚀 BATCH TEST - 3 PROMPTS IN ONE SESSION', 'INFO');
    logger.log('═══════════════════════════════════════════════════════');
    
    // Load account
    logger.startTimer('startup');
    const account = await loadAccount(supabase, CONFIG.account.email);
    
    // Fetch unused prompts
    // Fetch all 10 prompts
    const prompts = await fetchUserPrompts(
      supabase,
      CONFIG.account.email,
      CONFIG.batch.totalPrompts,
      CONFIG.batch.promptCount
    );
    
    logger.log(`🔄 Will process ${prompts.length} prompts in ${prompts.length} separate conversations`);
    
    // Connect to Browserless ONCE
    browser = await connect(account);
    const page = await browser.contexts()[0].pages()[0] || await browser.contexts()[0].newPage();
    
    // Navigate to ChatGPT ONCE
    logger.log('🌐 Navigating to ChatGPT...');
    await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(CONFIG.optimization.navigationWait);
    logger.log(`✅ Loaded: ${await page.title()}`);
    
    logger.endTimer('startup');
    logger.log('✅ One-time setup complete', 'SUCCESS');
    
    // Process all 3 prompts in sequence
    const results = [];
    for (let i = 0; i < prompts.length; i++) {
      const result = await processPrompt(page, prompts[i], i);
      results.push(result);
    }
    
    // Mark these prompts as used
    const usedPrompts = await loadUsedPrompts();
    prompts.forEach(p => usedPrompts.add(p.id));
    await saveUsedPrompts(usedPrompts);
    logger.log(`✅ Marked ${prompts.length} prompts as used`, 'SUCCESS');
    
    // Mark account as active
    await updateStatus(supabase, CONFIG.account.email, 'active');
    
    // Save batch results
    const batchResult = {
      timestamp: new Date().toISOString(),
      account: account.email,
      displayName: account.display_name,
      promptCount: results.length,
      results: results,
      performance: {
        totalBatch: Date.now() - logger.timers.total_batch,
        startup: logger.timers.startup ? Date.now() - logger.timers.startup : 0,
        averagePerPrompt: Math.round((Date.now() - logger.timers.total_batch) / results.length),
        totalCitations: results.reduce((sum, r) => sum + r.citationCount, 0)
      }
    };
    
    await fs.writeFile('tests/batch-results.json', JSON.stringify(batchResult, null, 2));
    
    const totalTime = logger.endTimer('total_batch');
    
    logger.log('');
    logger.log('═══════════════════════════════════════════════════════', 'SUCCESS');
    logger.log('✅ BATCH TEST COMPLETED SUCCESSFULLY', 'SUCCESS');
    logger.log('═══════════════════════════════════════════════════════', 'SUCCESS');
    logger.log(`📊 Prompts Processed: ${results.length}`, 'SUCCESS');
    logger.log(`📚 Total Citations: ${batchResult.performance.totalCitations}`, 'SUCCESS');
    logger.log(`⏱️  Total Time: ${totalTime}ms (${(totalTime/1000).toFixed(1)}s)`, 'SUCCESS');
    logger.log(`⏱️  Average per Prompt: ${batchResult.performance.averagePerPrompt}ms`, 'SUCCESS');
    logger.log(`💰 Estimated Units: ~${Math.ceil(totalTime/1000)}`, 'SUCCESS');
    logger.log('📄 Results saved to: tests/batch-results.json', 'SUCCESS');
    logger.log('═══════════════════════════════════════════════════════', 'SUCCESS');
    
    // Show individual results
    results.forEach((r, i) => {
      logger.log(`\n📝 Prompt ${i + 1}:`, 'INFO');
      logger.log(`   Text: ${r.promptText.substring(0, 60)}...`);
      logger.log(`   Response: ${r.responseLength} chars`);
      logger.log(`   Citations: ${r.citationCount}`);
      logger.log(`   Time: ${r.timeMs}ms`);
    });
    
  } catch (error) {
    logger.log(`❌ BATCH TEST FAILED: ${error.message}`, 'ERROR');
    
    if (error.message.includes('session') || error.message.includes('auth') || error.message.includes('expired')) {
      await updateStatus(supabase, CONFIG.account.email, 'expired', error.message);
    } else {
      await updateStatus(supabase, CONFIG.account.email, 'error', error.message);
    }
    
    throw error;
  } finally {
    if (browser) {
      await browser.close();
      logger.log('🔒 Browser closed');
    }
  }
}

// ============================================================================
// MAIN
// ============================================================================

runBatchTest().catch(console.error);

