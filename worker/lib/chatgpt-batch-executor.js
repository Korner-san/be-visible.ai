/**
 * ChatGPT Batch Executor - Core module for processing prompts via Browserless
 * 
 * Generalized from run-2-prompts-persistent.js to support 1-4 prompts per batch
 * Integrates with daily_schedules and saves results to database
 */

const playwright = require('playwright-core');
const { createClient } = require('@supabase/supabase-js');

// Use environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Default ChatGPT account for Basic plan users
const CHATGPT_ACCOUNT_EMAIL = process.env.CHATGPT_ACCOUNT_EMAIL || 'ididitforkik1000@gmail.com';

/**
 * Execute a batch of prompts using ChatGPT via Browserless
 * 
 * @param {Object} params Batch execution parameters
 * @param {string} params.scheduleId - ID of the daily_schedules record
 * @param {string} params.userId - User ID for result association
 * @param {string} params.brandId - Brand ID for result association
 * @param {string} params.reportDate - Date for the daily report (YYYY-MM-DD)
 * @param {Array<{promptId: string, promptText: string}>} params.prompts - Array of prompts to process
 * @returns {Promise<Object>} Results summary
 */
async function executeBatch({
  scheduleId,
  userId,
  brandId,
  reportDate,
  prompts
}) {
  
  console.log('\n' + '='.repeat(70));
  console.log(`🚀 CHATGPT BATCH EXECUTOR - ${prompts.length} PROMPTS`);
  console.log('='.repeat(70));
  console.log(`Schedule ID: ${scheduleId}`);
  console.log(`User ID: ${userId}`);
  console.log(`Brand ID: ${brandId}`);
  console.log(`Report Date: ${reportDate}`);
  console.log(`Batch Size: ${prompts.length}`);
  console.log('='.repeat(70) + '\n');
  
  const startTime = new Date();
  
  try {
    // 1. Update schedule status to 'running'
    await updateScheduleStatus(scheduleId, 'running', startTime);
    
    // 2. Per-brand daily report cache (fixes cross-contamination in mixed-brand batches)
    const dailyReportCache = {};
    async function getDailyReportForBrand(promptBrandId) {
      if (!dailyReportCache[promptBrandId]) {
        dailyReportCache[promptBrandId] = await getOrCreateDailyReport(promptBrandId, reportDate);
      }
      return dailyReportCache[promptBrandId];
    }
    // Pre-warm cache with the batch-level brandId
    const defaultDailyReportId = await getDailyReportForBrand(brandId);
    console.log(`✅ Default Daily Report ID: ${defaultDailyReportId}`);
    
    // 3. Load ChatGPT account and connect to persistent session
    const browser = await connectToPersistentSession();
    console.log('✅ Connected to persistent session');
    
    const context = browser.contexts()[0];
    const page = context.pages()[0] || await context.newPage();
    
    // 4. Navigate to ChatGPT if needed
    await ensureOnChatGPT(page);
    
    // 5. Verify login status
    const isLoggedIn = await verifyLoginStatus(page);
    if (!isLoggedIn) {
      throw new Error('Session not logged in - requires re-initialization');
    }
    
    // 6. Process each prompt
    const results = [];
    
    for (let i = 0; i < prompts.length; i++) {
      const prompt = prompts[i];
      console.log('\n' + '─'.repeat(70));
      console.log(`📝 PROMPT ${i + 1}/${prompts.length}`);
      console.log('─'.repeat(70));
      console.log(`ID: ${prompt.promptId}`);
      console.log(`Text: "${prompt.promptText.substring(0, 80)}..."`);
      
      const promptStartTime = new Date();
      
      try {
        // Type prompt into textarea
        const textarea = page.locator('#prompt-textarea').first();
        await textarea.waitFor({ state: 'visible', timeout: 5000 });
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
              console.log(`✅ Response stable at ${currentLength} chars`);
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
        
        console.log(`✅ Response received: ${responseText.length} characters`);
        
        // Extract citations
        const citations = await extractCitations(page);
        console.log(`✅ Extracted ${citations.length} citations`);
        
        const promptEndTime = new Date();
        const responseTime = promptEndTime - promptStartTime;
        
        // Resolve correct brand for this prompt (fixes cross-contamination)
        const promptBrandId = prompt.brandId || brandId;
        const dailyReportId = await getDailyReportForBrand(promptBrandId);

        // Save result to database
        await savePromptResult({
          dailyReportId,
          brandPromptId: prompt.promptId,
          promptText: prompt.promptText,
          responseText,
          citations,
          responseTime
        });

        results.push({
          promptId: prompt.promptId,
          dailyReportId,
          success: true,
          responseLength: responseText.length,
          citationCount: citations.length,
          responseTime
        });

        console.log(`✅ Prompt ${i + 1} completed successfully!`);

        // Start new conversation for next prompt (skip for last prompt)
        if (i < prompts.length - 1) {
          console.log('🔄 Starting new conversation...');
          await page.keyboard.press('Control+Shift+KeyO');
          await page.waitForTimeout(2000);
        }

      } catch (error) {
        console.error(`❌ Error processing prompt ${i + 1}:`, error.message);

        // Resolve correct brand for this prompt (fixes cross-contamination)
        const promptBrandId = prompt.brandId || brandId;
        const dailyReportId = await getDailyReportForBrand(promptBrandId);

        // Save error result to database
        await savePromptResult({
          dailyReportId,
          brandPromptId: prompt.promptId,
          promptText: prompt.promptText,
          responseText: '',
          citations: [],
          responseTime: 0,
          error: error.message
        });

        results.push({
          promptId: prompt.promptId,
          dailyReportId,
          success: false,
          error: error.message
        });

        // Continue with next prompt (don't fail entire batch)
      }
    }
    
    // 7. Close browser connection
    await browser.close();
    console.log('\n🔌 Disconnected from session');
    
    // 8. Update schedule status to 'completed'
    const endTime = new Date();
    await updateScheduleStatus(scheduleId, 'completed', startTime, endTime);
    
    // 9. Update daily_report aggregates - per-report for mixed-brand batches
    const allReportIds = [...new Set(results.map(r => r.dailyReportId || defaultDailyReportId))];
    for (const reportId of allReportIds) {
      const aggregateResults = await updateDailyReportAggregates(reportId);

      // 10. Process citations through unified processor (if any successful results)
      if (aggregateResults && aggregateResults.ok > 0) {
        console.log(`\n🔗 [PROCESSOR] Starting citation processing for report ${reportId}...`);
        try {
          const { processDailyReportCitations } = require('../process-daily-report-citations.js');
          await processDailyReportCitations(reportId);
        } catch (processorError) {
          console.error('⚠️  [PROCESSOR] Failed to process citations:', processorError.message);
          console.error('   Citations will need to be processed manually or on next run');
        }
      } else {
        console.log(`\n⚠️  [PROCESSOR] Skipping citation processing for report ${reportId} (no successful results)`);
        await supabase
          .from('daily_reports')
          .update({ url_processing_status: 'complete', urls_total: 0 })
          .eq('id', reportId);
      }
    }
    
    // 11. Display results summary
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;
    const totalCitations = results.reduce((sum, r) => sum + (r.citationCount || 0), 0);
    
    console.log('\n' + '='.repeat(70));
    console.log('📊 BATCH EXECUTION SUMMARY');
    console.log('='.repeat(70));
    console.log(`Total prompts: ${prompts.length}`);
    console.log(`Successful: ${successCount}`);
    console.log(`Failed: ${failureCount}`);
    console.log(`Total citations: ${totalCitations}`);
    console.log(`Execution time: ${Math.round((endTime - startTime) / 1000)}s`);
    console.log('='.repeat(70) + '\n');
    
    return {
      success: true,
      totalPrompts: prompts.length,
      successCount,
      failureCount,
      totalCitations,
      executionTime: endTime - startTime,
      results
    };
    
  } catch (error) {
    console.error('\n❌ Batch execution failed:', error.message);
    
    // Update schedule status to 'failed'
    await updateScheduleStatus(scheduleId, 'failed', startTime, new Date(), error.message);
    
    return {
      success: false,
      error: error.message
    };
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Connect to existing Browserless persistent session
 */
async function connectToPersistentSession() {
  console.log('🔌 Connecting to persistent session...');
  
  const { data: account, error } = await supabase
    .from('chatgpt_accounts')
    .select('*')
    .eq('email', CHATGPT_ACCOUNT_EMAIL)
    .single();

  if (error || !account || !account.browserless_connect_url) {
    throw new Error('No persistent session found - run initialization first');
  }
  
  console.log(`   Account: ${account.email}`);
  console.log(`   Session ID: ${account.browserless_session_id}`);
  
  const browser = await playwright.chromium.connectOverCDP(account.browserless_connect_url);
  
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
  console.log(`   Current URL: ${currentUrl}`);
  
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
 */
async function verifyLoginStatus(page) {
  const isLoggedOut = await page.locator('button:has-text("Log in")').count() > 0;
  const hasTextarea = await page.locator('#prompt-textarea').count() > 0;
  
  console.log('📊 Login Status:');
  console.log(`   Logged out: ${isLoggedOut}`);
  console.log(`   Has textarea: ${hasTextarea}`);
  
  return !isLoggedOut && hasTextarea;
}

/**
 * Extract citations from Sources panel
 */
async function extractCitations(page) {
  const sourcesButton = page.locator('button').filter({ hasText: /sources/i }).first();
  const hasSourcesButton = await sourcesButton.count() > 0;
  
  if (!hasSourcesButton) {
    console.log('⚠️  No Sources button found');
    return [];
  }
  
  await sourcesButton.click({ force: true });
  await page.waitForTimeout(1000);
  
  const citationLinks = await page.locator('[role="dialog"] a[href^="http"]').all();
  
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
          return href; // Just return URL string for database storage
        }
      }
    } catch (e) {
      // Skip invalid links
    }
    return null;
  });
  
  const linkResults = await Promise.all(linkPromises);
  const citations = linkResults.filter(c => c !== null);
  
  // Close the Links panel
  const closeButton = page.locator('[role="dialog"] button[aria-label="Close"]').first();
  if (await closeButton.count() > 0) {
    await closeButton.click();
    await page.waitForTimeout(500);
  }
  
  return citations;
}

/**
 * Update daily_schedules status
 */
async function updateScheduleStatus(scheduleId, status, startedAt, completedAt = null, errorMessage = null) {
  const updateData = { 
    status,
    started_at: startedAt.toISOString()
  };
  
  if (completedAt) {
    updateData.completed_at = completedAt.toISOString();
  }
  
  if (errorMessage) {
    updateData.error_message = errorMessage;
  }
  
  const { error } = await supabase
    .from('daily_schedules')
    .update(updateData)
    .eq('id', scheduleId);
  
  if (error) {
    console.error('⚠️  Failed to update schedule status:', error);
  } else {
    console.log(`✅ Schedule status updated: ${status}`);
  }
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
    throw new Error(`Failed to create daily report: ${createError.message}`);
  }
  
  return newReport.id;
}

/**
 * Save prompt result to database
 */
async function savePromptResult({
  dailyReportId,
  brandPromptId,
  promptText,
  responseText,
  citations,
  responseTime,
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
      provider_status: error ? 'error' : (citations.length > 0 ? 'ok' : 'no_result'),
      provider_error_message: error
    });
  
  if (saveError) {
    console.error('⚠️  Failed to save prompt result:', saveError);
  } else {
    console.log('✅ Saved to database');
  }
}

/**
 * Update daily_report aggregate counts and mark ChatGPT as complete
 */
async function updateDailyReportAggregates(dailyReportId) {
  // Get all results for this report
  const { data: results, error } = await supabase
    .from('prompt_results')
    .select('provider_status')
    .eq('daily_report_id', dailyReportId)
    .eq('provider', 'chatgpt');
  
  if (error || !results) {
    console.error('⚠️  Failed to fetch results for aggregation:', error);
    return;
  }
  
  const attempted = results.length;
  const ok = results.filter(r => r.provider_status === 'ok').length;
  const noResult = results.filter(r => r.provider_status === 'no_result').length;
  const errors = results.filter(r => r.provider_status === 'error').length;
  
  // Determine ChatGPT completion status
  // Mark as 'complete' if we have at least 1 successful result, 'failed' if all failed
  let chatgptStatus = 'complete';
  if (ok === 0 && attempted > 0) {
    chatgptStatus = 'failed';
  }
  
  // Update daily_report
  const { error: updateError } = await supabase
    .from('daily_reports')
    .update({
      chatgpt_attempted: attempted,
      chatgpt_ok: ok,
      chatgpt_no_result: noResult,
      chatgpt_status: chatgptStatus // ← NOW UPDATES STATUS
    })
    .eq('id', dailyReportId);
  
  if (updateError) {
    console.error('⚠️  Failed to update daily report aggregates:', updateError);
  } else {
    console.log(`✅ Updated aggregates: ${ok}/${attempted} successful (status: ${chatgptStatus})`);
  }
  
  return { ok, attempted, status: chatgptStatus };
}

module.exports = {
  executeBatch
};

