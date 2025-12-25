/**
 * ChatGPT Executor - Pure Browserless Automation + Forensic Tracking
 *
 * RESPONSIBILITY: Execute prompts via ChatGPT and extract RAW responses + citations
 *
 * DOES:
 * - Connect to Browserless persistent session
 * - Navigate to chatgpt.com
 * - Send prompts via automation
 * - Extract raw response text
 * - Extract raw citations (URLs)
 * - Save to prompt_results (raw data only)
 * - FORENSIC: Log connection attempts and visual states
 *
 * DOES NOT:
 * - Analyze brand mentions (processor's job)
 * - Analyze sentiment (processor's job)
 * - Fetch URL content (processor's job)
 * - Classify content (processor's job)
 * - Update aggregates (processor's job)
 */

const playwright = require('playwright-core');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const CHATGPT_ACCOUNT_EMAIL = process.env.CHATGPT_ACCOUNT_EMAIL || 'ididitforkik1000@gmail.com';

// FORENSIC: Global state for tracking session and visual state
let currentAccountId = null;
let currentSessionId = null;
let currentVisualState = 'Unknown';
let currentProxyUsed = null;

// FORENSIC: Helper to log to automation_forensics table
async function logForensic(data) {
  try {
    const { error } = await supabase
      .from('automation_forensics')
      .insert([data]);

    if (error) {
      console.error('⚠️  [FORENSIC] Failed to log:', error.message);
    }
  } catch (err) {
    console.error('⚠️  [FORENSIC] Exception:', err.message);
  }
}

/**
 * Execute a batch of prompts using ChatGPT via Browserless
 * Returns raw execution results - NO PROCESSING
 */
async function executeBatch({ scheduleId, userId, brandId, reportDate, prompts }) {

  console.log('\n' + '='.repeat(70));
  console.log('🤖 CHATGPT EXECUTOR - ' + prompts.length + ' PROMPTS (+ FORENSIC)');
  console.log('='.repeat(70));
  console.log('Schedule ID: ' + scheduleId);
  console.log('Brand ID: ' + brandId);
  console.log('Batch Size: ' + prompts.length);
  console.log('='.repeat(70) + '\n');

  const startTime = new Date();

  try {
    // 1. Get or create daily_report
    const dailyReportId = await getOrCreateDailyReport(brandId, reportDate);
    console.log('✅ Daily Report ID: ' + dailyReportId);

    // 2. Load ChatGPT account and connect to persistent session
    const browser = await connectToPersistentSession(scheduleId);
    console.log('✅ Connected to persistent session');

    const context = browser.contexts()[0];
    const page = context.pages()[0] || await context.newPage();

    // 3. Navigate to ChatGPT if needed
    await ensureOnChatGPT(page);

    // 4. Verify login status - FORENSIC: Capture detailed visual state
    const loginResult = await verifyLoginStatus(page);
    if (!loginResult.isLoggedIn) {
      throw new Error('Session not logged in - requires re-initialization');
    }

    // FORENSIC: Update global visual state
    currentVisualState = loginResult.visualState;

    // FORENSIC: Log post-navigation state with actual visual state
    await logForensic({
      chatgpt_account_id: currentAccountId,
      chatgpt_account_email: CHATGPT_ACCOUNT_EMAIL,
      browserless_session_id: currentSessionId,
      proxy_used: currentProxyUsed,
      connection_status: 'Connected', // Connection succeeded (visual_state shows if usable)
      visual_state: loginResult.visualState,
      visual_state_details: loginResult.visualStateDetails,
      operation_type: 'batch_execution',
      batch_id: scheduleId
    });

    // 5. Process each prompt (EXECUTION ONLY - NO ANALYSIS)
    const results = [];

    for (let i = 0; i < prompts.length; i++) {
      const prompt = prompts[i];
      console.log('\n' + '─'.repeat(70));
      console.log('📝 PROMPT ' + (i + 1) + '/' + prompts.length);
      console.log('─'.repeat(70));
      console.log('ID: ' + prompt.promptId);
      console.log('Text: "' + prompt.promptText.substring(0, 80) + '..."');

      const promptStartTime = new Date();

      try {
        // Enable search mode first
        const textarea = page.locator('#prompt-textarea').first();
        await textarea.waitFor({ state: 'visible', timeout: 5000 });

        console.log('   🔍 Enabling search mode...');
        await textarea.fill('/search');
        await textarea.press('Enter');
        await page.waitForTimeout(1000);
        console.log('   ✅ Search mode enabled');

        // Type actual prompt into textarea
        await textarea.fill(prompt.promptText);

        // Send prompt
        await page.locator('button[data-testid="send-button"]').click();
        console.log('✅ Prompt sent');

        // Wait for response
        console.log('⏳ Waiting for response...');
        await page.waitForTimeout(5000);

        // Wait for response to stabilize
        let stable = 0;
        let lastLength = 0;

        for (let j = 0; j < 40; j++) {
          await page.waitForTimeout(1500);
          const messages = await page.locator('[data-message-author-role="assistant"]').all();

          if (messages.length === 0) continue;

          const currentLength = (await messages[messages.length - 1]?.textContent() || '').length;

          if (currentLength === lastLength && currentLength > 0) {
            stable++;
            if (stable >= 3) {
              console.log('✅ Response stable at ' + currentLength + ' chars');
              break;
            }
          } else {
            stable = 0;
          }
          lastLength = currentLength;
        }

        // Extract response text (RAW)
        const messages = await page.locator('[data-message-author-role="assistant"]').all();
        const lastMessage = messages[messages.length - 1];
        const responseText = await lastMessage?.textContent() || '';

        console.log('✅ Response received: ' + responseText.length + ' characters');

        // Extract citations (RAW)
        const citations = await extractCitations(page);
        console.log('✅ Extracted ' + citations.length + ' citations');

        const promptEndTime = new Date();
        const responseTime = promptEndTime - promptStartTime;

        // Save RAW result to database (NO ANALYSIS)
        await saveRawPromptResult({
          dailyReportId,
          brandPromptId: prompt.promptId,
          brandId,
          promptText: prompt.promptText,
          responseText,
          citations,
          responseTime,
          scheduleId
        });

        results.push({
          promptId: prompt.promptId,
          success: true,
          responseLength: responseText.length,
          citationCount: citations.length,
          responseTime
        });

        console.log('✅ Prompt ' + (i + 1) + ' completed successfully!');

        // Start new conversation for next prompt (skip for last prompt)
        if (i < prompts.length - 1) {
          console.log('🔄 Starting new conversation...');
          await page.keyboard.press('Control+Shift+KeyO');
          await page.waitForTimeout(2000);
        }

      } catch (error) {
        console.error('❌ Error processing prompt ' + (i + 1) + ':', error.message);

        // Save error result to database
        await saveRawPromptResult({
          dailyReportId,
          brandPromptId: prompt.promptId,
          brandId,
          promptText: prompt.promptText,
          responseText: '',
          citations: [],
          responseTime: 0,
          scheduleId,
          error: error.message
        });

        results.push({
          promptId: prompt.promptId,
          success: false,
          error: error.message
        });
      }
    }

    // 6. Close browser connection
    await browser.close();
    console.log('\n🔌 Disconnected from session');

    // 7. Display results summary
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;
    const totalCitations = results.reduce((sum, r) => sum + (r.citationCount || 0), 0);
    const endTime = new Date();

    console.log('\n' + '='.repeat(70));
    console.log('📊 EXECUTION SUMMARY');
    console.log('='.repeat(70));
    console.log('Total prompts: ' + prompts.length);
    console.log('Successful: ' + successCount);
    console.log('Failed: ' + failureCount);
    console.log('Total citations: ' + totalCitations);
    console.log('Execution time: ' + Math.round((endTime - startTime) / 1000) + 's');
    console.log('='.repeat(70) + '\n');

    // 8. Update daily_reports status
    console.log('📋 Updating daily_reports status...');
    try {
      // Update daily_reports with completion status and stats
      const { error: updateError } = await supabase
        .from('daily_reports')
        .update({
          chatgpt_status: 'complete',
          status: 'completed',
          completed_prompts: successCount,
          total_prompts: prompts.length,
          chatgpt_attempted: prompts.length,
          chatgpt_ok: successCount,
          chatgpt_no_result: failureCount,
          completed_at: new Date().toISOString()
        })
        .eq('id', dailyReportId);

      if (updateError) {
        console.error('⚠️  Failed to update daily_reports:', updateError);
      } else {
        console.log('✅ Updated daily_reports status:');
        console.log('   Completed: ' + successCount + '/' + prompts.length);
        console.log('   Total citations: ' + totalCitations);
      }
    } catch (aggregationError) {
      console.error('⚠️  Update error:', aggregationError);
    }

    return {
      success: true,
      dailyReportId,
      scheduleId,
      totalPrompts: prompts.length,
      successCount,
      failureCount,
      totalCitations,
      executionTime: endTime - startTime,
      results
    };

  } catch (error) {
    console.error('\n❌ Execution failed:', error.message);

    // FORENSIC: Log batch execution failure
    await logForensic({
      chatgpt_account_id: currentAccountId,
      chatgpt_account_email: CHATGPT_ACCOUNT_EMAIL,
      browserless_session_id: currentSessionId,
      proxy_used: currentProxyUsed,
      connection_status: 'Error',
      connection_error_raw: error.message,
      visual_state: currentVisualState,
      operation_type: 'batch_execution',
      batch_id: scheduleId
    });

    return {
      success: false,
      error: error.message
    };
  }
}

// ============================================================================
// HELPER FUNCTIONS - EXECUTION ONLY + FORENSIC
// ============================================================================

/**
 * Connect to existing Browserless persistent session
 * FORENSIC: Logs connection attempt and captures visual state
 */
async function connectToPersistentSession(scheduleId = null) {
  const connectStartTime = Date.now();

  console.log('🔌 Connecting to persistent session...');

  const { data: account, error } = await supabase
    .from('chatgpt_accounts')
    .select('*')
    .eq('email', CHATGPT_ACCOUNT_EMAIL)
    .single();

  if (error || !account || !account.browserless_connect_url) {
    // FORENSIC: Log connection failure
    await logForensic({
      chatgpt_account_email: CHATGPT_ACCOUNT_EMAIL,
      connection_status: 'Error',
      connection_error_raw: error?.message || 'No persistent session found',
      visual_state: 'Unknown',
      operation_type: 'batch_execution',
      batch_id: scheduleId,
      response_time_ms: Date.now() - connectStartTime
    });

    throw new Error('No persistent session found - run initialization first');
  }

  // FORENSIC: Set global tracking variables
  currentAccountId = account.id;
  currentSessionId = account.browserless_session_id;
  currentProxyUsed = `${account.proxy_host}:${account.proxy_port}`;

  console.log('   Account: ' + account.email);
  console.log('   Session ID: ' + account.browserless_session_id);
  console.log('   Proxy: ' + currentProxyUsed);

  let browser;
  try {
    browser = await playwright.chromium.connectOverCDP(account.browserless_connect_url);

    // FORENSIC: Log successful connection
    await logForensic({
      chatgpt_account_id: currentAccountId,
      chatgpt_account_email: account.email,
      browserless_session_id: currentSessionId,
      proxy_used: currentProxyUsed,
      connection_status: 'Connected',
      visual_state: 'Unknown', // Will be updated after navigation
      operation_type: 'batch_execution',
      batch_id: scheduleId,
      playwright_cdp_url: account.browserless_connect_url,
      response_time_ms: Date.now() - connectStartTime
    });

  } catch (connectError) {
    // FORENSIC: Log connection failure
    await logForensic({
      chatgpt_account_id: currentAccountId,
      chatgpt_account_email: account.email,
      browserless_session_id: currentSessionId,
      proxy_used: currentProxyUsed,
      connection_status: 'Error',
      connection_error_raw: connectError.message,
      visual_state: 'Unknown',
      operation_type: 'batch_execution',
      batch_id: scheduleId,
      playwright_cdp_url: account.browserless_connect_url,
      response_time_ms: Date.now() - connectStartTime
    });

    throw connectError;
  }

  // Update last_connection_at
  await supabase
    .from('chatgpt_accounts')
    .update({
      last_connection_at: new Date().toISOString(),
      total_connections: (account.total_connections || 0) + 1
    })
    .eq('email', CHATGPT_ACCOUNT_EMAIL);

  return browser;
}

/**
 * Ensure page is on chatgpt.com
 */
async function ensureOnChatGPT(page) {
  console.log('🌐 Checking current page...');
  const currentUrl = page.url();
  console.log('   Current URL: ' + currentUrl);

  if (!currentUrl.includes('chatgpt.com')) {
    console.log('   Navigating to ChatGPT...');
    await page.goto('https://chatgpt.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);
  } else {
    console.log('   Already on ChatGPT');
    await page.waitForTimeout(2000);
  }

  // Check for Cloudflare challenge
  let title = await page.title();
  if (title.includes('Just a moment')) {
    console.log('⏳ Waiting for Cloudflare challenge...');
    let attempts = 0;
    while (title.includes('Just a moment') && attempts < 10) {
      await page.waitForTimeout(3000);
      title = await page.title();
      attempts++;
    }
  }
}

/**
 * Verify user is logged in
 * FORENSIC: Enhanced to capture detailed visual state
 */
async function verifyLoginStatus(page) {
  const isLoggedOut = await page.locator('button:has-text("Log in")').count() > 0;
  const hasTextarea = await page.locator('#prompt-textarea').count() > 0;
  const hasUserMenu = await page.locator('[data-testid="profile-button"]').count() > 0 ||
                      await page.locator('button[id^="radix-"]').count() > 0;
  const title = await page.title();
  const hasCaptcha = title.toLowerCase().includes('captcha') ||
                     await page.locator('[name="cf-turnstile-response"]').count() > 0;
  const currentUrl = page.url();

  // FORENSIC: Determine visual state
  let visualState;
  if (hasCaptcha) {
    visualState = 'Captcha';
  } else if (isLoggedOut) {
    visualState = 'Sign_In_Button';
  } else if (hasTextarea || hasUserMenu) {
    visualState = 'Logged_In';
  } else if (currentUrl === 'about:blank') {
    visualState = 'Blank';
  } else {
    visualState = 'Unknown';
  }

  const visualStateDetails = {
    hasTextarea,
    hasLoginButton: isLoggedOut,
    hasUserMenu,
    hasCaptcha,
    url: currentUrl,
    pageTitle: title
  };

  console.log('📊 Login Status:');
  console.log('   Logged out: ' + isLoggedOut);
  console.log('   Has textarea: ' + hasTextarea);
  console.log('   Has user menu: ' + hasUserMenu);
  console.log('   Visual state: ' + visualState);

  // FORENSIC: Update account's last visual state
  await supabase
    .from('chatgpt_accounts')
    .update({
      last_visual_state: visualState,
      last_visual_state_at: new Date().toISOString()
    })
    .eq('id', currentAccountId);

  return {
    isLoggedIn: !isLoggedOut && hasTextarea,
    visualState,
    visualStateDetails
  };
}

/**
 * Extract citations from Sources panel (RAW URLs only)
 * FIXED: Uses before/after link comparison instead of broken [role="dialog"] selector
 */
async function extractCitations(page) {
  console.log('   🔍 Looking for Sources button...');
  const sourcesButton = page.locator('button').filter({ hasText: /sources/i }).first();
  const hasSourcesButton = await sourcesButton.count() > 0;

  if (!hasSourcesButton) {
    console.log('   ⚠️  No Sources button found - response may not have citations');
    return [];
  }

  // Get links BEFORE clicking Sources
  const linksBefore = await page.locator('a[href^="http"]').all();
  const hrefsBefore = new Set();
  for (const link of linksBefore) {
    const href = await link.getAttribute('href');
    if (href) hrefsBefore.add(href);
  }

  console.log('   📋 Clicking Sources button...');
  await sourcesButton.click({ force: true });
  await page.waitForTimeout(2000);
  console.log('   ✅ Sources panel opened');

  // Get links AFTER clicking Sources
  const linksAfter = await page.locator('a[href^="http"]').all();
  const hrefsAfter = [];
  for (const link of linksAfter) {
    const href = await link.getAttribute('href');
    if (href) hrefsAfter.push(href);
  }

  // Find NEW links that appeared
  const newLinks = hrefsAfter.filter(href => !hrefsBefore.has(href));

  // Process citations
  const citations = [];
  for (const href of newLinks) {
    try {
      let url = href;

      // Extract actual URL from ChatGPT redirect
      if (url.includes('chatgpt.com/link')) {
        const urlObj = new URL(url);
        const actualUrl = urlObj.searchParams.get('url');
        if (actualUrl) url = actualUrl;
      }

      const urlObj = new URL(url);
      const domain = urlObj.hostname;

      if (!domain.includes('chatgpt.com')) {
        citations.push(url);
      }
    } catch (e) {
      // Skip invalid URLs
    }
  }

  console.log('   ✅ Extracted ' + citations.length + ' valid citations');
  return citations;
}

/**
 * Get or create daily_report for the given brand and date
 */
async function getOrCreateDailyReport(brandId, reportDate) {
  // Try to get existing report
  const { data: existing, error: fetchError } = await supabase
    .from('daily_reports')
    .select('id')
    .eq('brand_id', brandId)
    .eq('report_date', reportDate)
    .single();

  if (existing) {
    return existing.id;
  }

  // Create new report
  const { data: newReport, error: createError } = await supabase
    .from('daily_reports')
    .insert({
      brand_id: brandId,
      report_date: reportDate,
      status: 'running',
      chatgpt_status: 'running'
    })
    .select('id')
    .single();

  if (createError) {
    throw new Error('Failed to create daily report: ' + createError.message);
  }

  return newReport.id;
}

/**
 * Save RAW prompt result to database (NO ANALYSIS FIELDS)
 * FORENSIC: Adds browserless_session_id_used and execution_visual_state
 */
async function saveRawPromptResult({
  dailyReportId,
  brandPromptId,
  brandId,
  promptText,
  responseText,
  citations,
  responseTime,
  scheduleId,
  error = null
}) {
  const { error: saveError } = await supabase
    .from('prompt_results')
    .insert({
      daily_report_id: dailyReportId,
      brand_prompt_id: brandPromptId,
      prompt_text: promptText,
      chatgpt_response: responseText,
      chatgpt_response_time_ms: responseTime,
      chatgpt_citations: citations,
      provider: 'chatgpt',
      provider_status: error ? 'error' : (responseText.length > 0 ? 'ok' : 'no_result'),
      provider_error_message: error,
      // FORENSIC: Track which session was used and its visual state
      browserless_session_id_used: currentSessionId,
      execution_visual_state: currentVisualState
      // ✅ NO brand_mentioned, NO sentiment_score, NO analysis
      // These will be filled by processors/brand-analyzer.js
    });

  if (saveError) {
    console.error('⚠️  Failed to save prompt result:', saveError);
  } else {
    console.log('✅ Saved raw result to prompt_results (+ forensic data)');
  }

  // Log to execution history for intelligent scheduler
  const chatgptAccountId = process.env.CHATGPT_ACCOUNT_ID || currentAccountId;
  if (chatgptAccountId) {
    await supabase
      .from('prompt_execution_log')
      .insert({
        chatgpt_account_id: chatgptAccountId,
        brand_prompt_id: brandPromptId,
        brand_id: brandId,
        daily_schedule_id: scheduleId,
        executed_at: new Date().toISOString(),
        response_received: !error,
        citations_count: citations.length,
        error_message: error
      });

    console.log('✅ Logged to execution history');
  }
}

module.exports = {
  executeBatch
};
