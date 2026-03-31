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

// NOTE: declared as `let` so executeBatch can re-read process.env at call time.
// The caller (run-6-prompts-persistent.js) sets process.env.CHATGPT_ACCOUNT_EMAIL
// AFTER requiring this module, so a module-level const would always be stale.
let CHATGPT_ACCOUNT_EMAIL = process.env.CHATGPT_ACCOUNT_EMAIL || 'ididitforkik1000@gmail.com';

// CONVERSATION REUSE: max prompts before opening a new ChatGPT conversation.
// Spans multiple Browserless connections — URL stored in chatgpt_accounts.
const MAX_PROMPTS_PER_CONVERSATION = 10;

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

// AUTO-RECOVERY: Session reinit on any connection failure + Make alert on login failure
// ============================================================================

function classifyConnectionError(errorMessage) {
  const msg = errorMessage || '';
  if (msg.includes('429') || msg.includes('already being accessed')) return 'session_busy';
  if (msg.toLowerCase().includes('timeout')) return 'session_timeout';
  if (msg.includes('Failed to navigate')) return 'navigation_failed';
  if (msg.includes('Target page') || msg.includes('browser has been closed')) return 'browser_crashed';
  if (msg.includes('No persistent session')) return 'no_session';
  return 'connection_error';
}

async function tryKillZombieSession(stopUrl) {
  if (!stopUrl) return;
  try {
    console.log('[AUTO-RECOVERY] Killing zombie Browserless session via stop URL...');
    await Promise.race([
      fetch(stopUrl, { method: 'GET' }),
      new Promise(resolve => setTimeout(resolve, 5000))
    ]);
    console.log('[AUTO-RECOVERY] Stop URL called — waiting 3s for session to fully close...');
    await new Promise(resolve => setTimeout(resolve, 3000));
  } catch (err) {
    console.warn('[AUTO-RECOVERY] tryKillZombieSession error (non-fatal):', err.message);
  }
}

async function triggerAutoReinit(accountEmail, trigger, batchId) {
  const webhookBaseUrl = process.env.WEBHOOK_BASE_URL || 'http://127.0.0.1:3001';
  const webhookSecret = process.env.WEBHOOK_SECRET || 'forensic-reinit-secret-2024';
  const REINIT_TIMEOUT_MS = 5 * 60 * 1000;
  console.log('[AUTO-RECOVERY] Triggering session reinit for', accountEmail, '— reason:', trigger);
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), REINIT_TIMEOUT_MS);
    try {
      await fetch(`${webhookBaseUrl}/initialize-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: webhookSecret, accountEmail }),
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    const { data: account } = await supabase
      .from('chatgpt_accounts')
      .select('id, last_initialization_result, last_visual_state, browserless_session_id, proxy_host, proxy_port, browserless_stop_url, source_pc')
      .eq('email', accountEmail)
      .single();
    const reinitSucceeded = account?.last_initialization_result === 'success';
    const visualState = account?.last_visual_state || 'Unknown';
    if (reinitSucceeded) {
      console.log('[AUTO-RECOVERY] Reinit SUCCEEDED for', accountEmail, '— session restored, next batch will work');
    } else {
      console.log('[AUTO-RECOVERY] Reinit FAILED for', accountEmail, '— visual_state:', visualState);
      const { data: recentForensics } = await supabase
        .from('automation_forensics')
        .select('timestamp, connection_status, connection_error_raw, visual_state, operation_type, batch_id')
        .eq('chatgpt_account_email', accountEmail)
        .eq('connection_status', 'Error')
        .order('timestamp', { ascending: false })
        .limit(3);
      const context = trigger.includes('onboarding') ? 'onboarding' : 'daily_batch';
      await sendMakeWebhook({
        account: accountEmail,
        action_required: 'manual_cookie_extraction',
        context,
        trigger,
        source_pc: account?.source_pc || 'unknown',
        reinit_result: account?.last_initialization_result || 'unknown',
        reinit_visual_state: visualState,
        consecutive_failures: 0,
        session_id: account?.browserless_session_id || 'unknown',
        proxy: account ? `${account.proxy_host}:${account.proxy_port}` : 'unknown',
        failing_batch_id: batchId,
        recent_errors: (recentForensics || []).map(f => ({
          timestamp: f.timestamp,
          error: (f.connection_error_raw || '').substring(0, 200),
          visual_state: f.visual_state,
          batch_id: f.batch_id,
        })),
        timestamp: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.error('[AUTO-RECOVERY] triggerAutoReinit error:', err.message);
  }
}

async function sendMakeWebhook(payload) {
  const makeUrl = process.env.MAKE_WEBHOOK_URL;
  if (!makeUrl) {
    console.warn('[AUTO-RECOVERY] MAKE_WEBHOOK_URL not set — skipping Make notification');
    return;
  }
  try {
    console.log('[AUTO-RECOVERY] Sending Make webhook for', payload.account, '...');
    const res = await fetch(makeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      console.log('[AUTO-RECOVERY] Make webhook sent successfully');
    } else {
      console.warn('[AUTO-RECOVERY] Make webhook returned HTTP', res.status);
    }
  } catch (err) {
    console.error('[AUTO-RECOVERY] Make webhook failed:', err.message);
  }
}

// ============================================================================
// CONVERSATION REUSE HELPERS
// ============================================================================

/**
 * At the start of each executeBatch call, decide whether to continue the existing
 * ChatGPT conversation or open a new one.
 *
 * Decision rule: if count + batchSize > MAX_PROMPTS_PER_CONVERSATION, start new.
 * If no URL is stored yet, also start new.
 *
 * On continue: navigates to the stored /c/UUID conversation URL.
 * On new: presses Ctrl+Shift+O. URL is captured and saved after the first prompt.
 *
 * Returns: { isNew: boolean }
 */
async function manageConversationStart(page, batchSize) {
  const { data: account } = await supabase
    .from('chatgpt_accounts')
    .select('current_conversation_url, current_conversation_prompt_count')
    .eq('email', CHATGPT_ACCOUNT_EMAIL)
    .single();

  const storedUrl = account?.current_conversation_url || null;
  const storedCount = account?.current_conversation_prompt_count || 0;
  const wouldExceed = storedCount + batchSize > MAX_PROMPTS_PER_CONVERSATION;
  const shouldStartNew = !storedUrl || wouldExceed;

  if (shouldStartNew) {
    console.log(`[CONV] New conversation (count=${storedCount}, batch=${batchSize}, wouldExceed=${wouldExceed})`);
    try {
      await page.keyboard.press('Control+Shift+KeyO');
      await page.waitForTimeout(2500);
    } catch (e) {
      console.warn('[CONV] Ctrl+Shift+O failed (non-fatal):', e.message);
    }
    // Clear state — URL captured after first prompt via recordPromptSent()
    await supabase
      .from('chatgpt_accounts')
      .update({ current_conversation_url: null, current_conversation_prompt_count: 0 })
      .eq('email', CHATGPT_ACCOUNT_EMAIL);
    return { isNew: true };
  }

  // Continue existing conversation
  console.log(`[CONV] Continuing conversation (count=${storedCount}, url=...${storedUrl.slice(-12)})`);
  try {
    await page.goto(storedUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    const hasTextarea = await page.locator('#prompt-textarea').count() > 0;
    if (!hasTextarea) {
      console.warn('[CONV] Textarea missing after navigating to conversation — falling back to new conv');
      await page.keyboard.press('Control+Shift+KeyO');
      await page.waitForTimeout(2500);
      await supabase
        .from('chatgpt_accounts')
        .update({ current_conversation_url: null, current_conversation_prompt_count: 0 })
        .eq('email', CHATGPT_ACCOUNT_EMAIL);
      return { isNew: true };
    }
  } catch (navErr) {
    console.warn('[CONV] Navigate to conversation URL failed — starting new:', navErr.message);
    await page.keyboard.press('Control+Shift+KeyO');
    await page.waitForTimeout(2500);
    await supabase
      .from('chatgpt_accounts')
      .update({ current_conversation_url: null, current_conversation_prompt_count: 0 })
      .eq('email', CHATGPT_ACCOUNT_EMAIL);
    return { isNew: true };
  }
  return { isNew: false };
}

/**
 * After each successfully sent prompt:
 * - If this is the first prompt of a NEW conversation: wait for /c/UUID URL, save it, set count=1
 * - Otherwise: increment the count in DB
 */
async function recordPromptSent(page, isFirstOfNewConversation) {
  if (isFirstOfNewConversation) {
    // ChatGPT creates the /c/UUID URL after the first message is sent
    await page.waitForTimeout(1500);
    const url = page.url();
    if (url.includes('/c/')) {
      await supabase
        .from('chatgpt_accounts')
        .update({ current_conversation_url: url, current_conversation_prompt_count: 1 })
        .eq('email', CHATGPT_ACCOUNT_EMAIL);
      console.log('[CONV] Saved new conversation URL:', url.slice(-20), '(count=1)');
      return;
    }
    // URL not yet /c/UUID — just bump count and try again next prompt
    console.warn('[CONV] /c/ URL not yet visible after first prompt — skipping URL capture');
  }
  // Increment count
  const { data: account } = await supabase
    .from('chatgpt_accounts')
    .select('current_conversation_prompt_count')
    .eq('email', CHATGPT_ACCOUNT_EMAIL)
    .single();
  const newCount = (account?.current_conversation_prompt_count || 0) + 1;
  await supabase
    .from('chatgpt_accounts')
    .update({ current_conversation_prompt_count: newCount })
    .eq('email', CHATGPT_ACCOUNT_EMAIL);
  console.log('[CONV] Prompt count now:', newCount);
}

/**
 * Execute a batch of prompts using ChatGPT via Browserless
 * Returns raw execution results - NO PROCESSING
 */
async function executeBatch({ scheduleId, userId, brandId, reportDate, prompts, onPromptComplete = null }) {

  // Re-read at call time — the caller sets process.env.CHATGPT_ACCOUNT_EMAIL before calling us
  CHATGPT_ACCOUNT_EMAIL = process.env.CHATGPT_ACCOUNT_EMAIL || 'ididitforkik1000@gmail.com';

  console.log('\n' + '='.repeat(70));
  console.log('🤖 CHATGPT EXECUTOR - ' + prompts.length + ' PROMPTS (+ FORENSIC)');
  console.log('='.repeat(70));
  console.log('Schedule ID: ' + scheduleId);
  console.log('Brand ID: ' + brandId);
  console.log('Batch Size: ' + prompts.length);
  console.log('='.repeat(70) + '\n');

  const startTime = new Date();

  try {
    // 1. Per-brand daily report cache (fixes cross-contamination in mixed-brand batches)
    const dailyReportCache = {};
    async function getDailyReportForBrand(promptBrandId) {
      if (!dailyReportCache[promptBrandId]) {
        dailyReportCache[promptBrandId] = await getOrCreateDailyReport(promptBrandId, reportDate);
      }
      return dailyReportCache[promptBrandId];
    }
    // Pre-warm cache with the batch-level brandId
    const defaultDailyReportId = await getDailyReportForBrand(brandId);
    console.log('✅ Default Daily Report ID: ' + defaultDailyReportId);

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
      // Connection to Browserless succeeded but ChatGPT shows the login button.
      // Close the WebSocket cleanly then trigger reinit.
      // Webhook fires inside triggerAutoReinit only if reinit also sees Sign_In_Button.
      const isOnboarding = scheduleId && String(scheduleId).startsWith('onboarding-');
      if (!isOnboarding) {
        try { browser._connection._transport.close(); } catch (e) {}
        await triggerAutoReinit(CHATGPT_ACCOUNT_EMAIL, 'login_button_during_batch', String(scheduleId || ''));
      }
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


    // Manage conversation reuse: continue existing /c/UUID conversation or start new one.
    // Decision is based on current_conversation_prompt_count stored per account in DB.
    const convState = await manageConversationStart(page, prompts.length);
    let isFirstOfNewConversation = convState.isNew;

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
        try {
          await textarea.waitFor({ state: 'visible', timeout: 10000 });
        } catch (textareaErr) {
          // Textarea not visible after 10s — page didn't load properly, reload it
          console.warn('   ⚠️  Textarea not visible after 10s — reloading page...');
          await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });
          await page.waitForTimeout(4000);
          // One more check after reload
          await textarea.waitFor({ state: 'visible', timeout: 10000 });
        }

        console.log('   🔍 Enabling search mode...');
        await textarea.fill('/search');
        await textarea.press('Enter');
        await page.waitForTimeout(1000);
        console.log('   ✅ Search mode enabled');

        // Type actual prompt into textarea
        await textarea.fill(prompt.promptText);

        // Check for conversation rate limit modal BEFORE clicking send.
        // ChatGPT shows this modal when an account sends too many prompts in a session.
        // It blocks pointer events on the send button, causing a 30s timeout otherwise.
        // We detect it early (500ms), fire a Make webhook alert, dismiss via Escape, then fail fast.
        const rateLimitModal = page.locator('[data-testid="modal-conversation-history-rate-limit"]');
        const hasRateLimit = await rateLimitModal.isVisible({ timeout: 500 }).catch(() => false);
        if (hasRateLimit) {
          console.warn('[RATE-LIMIT] Conversation rate limit modal detected for', CHATGPT_ACCOUNT_EMAIL);
          // Try to dismiss the modal so next reconnect starts clean
          try { await page.keyboard.press('Escape'); await page.waitForTimeout(1000); } catch (_) {}
          await sendMakeWebhook({
            event: 'conversation_rate_limit',
            account: CHATGPT_ACCOUNT_EMAIL,
            brand_id: prompt.brandId || brandId,
            prompt_id: prompt.promptId,
            message: 'ChatGPT showed "you are making requests too quickly" modal — account temporarily rate-limited. Prompts will be retried once limit clears.',
            timestamp: new Date().toISOString(),
          });
          throw new Error('conversation_rate_limit: ChatGPT rate limit modal blocked send button');
        }

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

        // Extract response — use innerHTML → markdown to preserve bold, bullets, headings
        const messages = await page.locator('[data-message-author-role="assistant"]').all();
        const lastMessage = messages[messages.length - 1];
        const rawHtml = await lastMessage?.innerHTML() || '';
        const responseText = rawHtml ? htmlToMarkdown(rawHtml) : '';

        console.log('✅ Response received: ' + responseText.length + ' characters');

        // Extract citations (RAW)
        const citations = await extractCitations(page);
        console.log('✅ Extracted ' + citations.length + ' citations');

        const promptEndTime = new Date();
        const responseTime = promptEndTime - promptStartTime;

        // Resolve correct brand for this prompt (fixes cross-contamination)
        const promptBrandId = prompt.brandId || brandId;
        const dailyReportId = await getDailyReportForBrand(promptBrandId);

        // Save RAW result to database (NO ANALYSIS)
        await saveRawPromptResult({
          dailyReportId,
          brandPromptId: prompt.promptId,
          brandId: promptBrandId,
          promptText: prompt.promptText,
          responseText,
          citations,
          responseTime,
          scheduleId
        });

        results.push({
          promptId: prompt.promptId,
          dailyReportId,
          success: true,
          responseLength: responseText.length,
          citationCount: citations.length,
          responseTime
        });

        console.log('✅ Prompt ' + (i + 1) + ' completed successfully!');

        // Notify batch runner so it can update the live progress counter
        if (typeof onPromptComplete === "function") {
          await onPromptComplete(i, true);
        }

        // Record prompt sent: save /c/UUID URL on first prompt of new conv, increment count otherwise
        await recordPromptSent(page, isFirstOfNewConversation && i === 0).catch(e =>
          console.warn('[CONV] recordPromptSent error (non-fatal):', e.message)
        );
        if (isFirstOfNewConversation && i === 0) isFirstOfNewConversation = false;

      } catch (error) {
        console.error('❌ Error processing prompt ' + (i + 1) + ':', error.message);

        // Fallback: if rate limit modal was missed by pre-check (e.g. appeared mid-send),
        // detect it here and fire Make webhook if not already fired above.
        if (error.message.includes('modal-conversation-history-rate-limit') && !error.message.startsWith('conversation_rate_limit:')) {
          console.warn('[RATE-LIMIT] Rate limit modal caught in error handler for', CHATGPT_ACCOUNT_EMAIL);
          await sendMakeWebhook({
            event: 'conversation_rate_limit',
            account: CHATGPT_ACCOUNT_EMAIL,
            brand_id: prompt.brandId || brandId,
            prompt_id: prompt.promptId,
            message: 'ChatGPT showed "you are making requests too quickly" modal (caught in error handler).',
            timestamp: new Date().toISOString(),
          }).catch(() => {});
        }

        // Resolve correct brand for this prompt (fixes cross-contamination)
        const promptBrandId = prompt.brandId || brandId;
        const dailyReportId = await getDailyReportForBrand(promptBrandId);

        // Save error result to database
        await saveRawPromptResult({
          dailyReportId,
          brandPromptId: prompt.promptId,
          brandId: promptBrandId,
          promptText: prompt.promptText,
          responseText: '',
          citations: [],
          responseTime: 0,
          scheduleId,
          error: error.message
        });

        results.push({
          promptId: prompt.promptId,
          dailyReportId,
          success: false,
          error: error.message
        });

        // Notify batch runner even on error so the progress counter advances
        if (typeof onPromptComplete === "function") {
          await onPromptComplete(i, false);
        }
      }
    }

    // 6. Disconnect WebSocket transport (does NOT send Browser.close CDP command).
    //
    // HOW SESSIONS API WORKS (per https://docs.browserless.io/baas/session-management):
    //   Sessions created with processKeepAlive keep the browser process running for
    //   that many ms after the last WebSocket client disconnects. The next batch
    //   reconnects to the SAME original session URL and finds the browser still running.
    //
    //   NOTE: The `Browserless.reconnect` CDP command is for standard BaaS sessions,
    //   NOT for the Sessions API (30-day TTL). Using it on a Sessions API session
    //   locks the session in "reconnect-pending" mode (returns 429 on the original URL).
    //   Do NOT call Browserless.reconnect for Sessions API sessions.
    try {
      const conn = browser._connection;
      if (conn?._ws) {
        // _ws is the raw WebSocket — close only the WS, not the browser process.
        // processKeepAlive keeps the browser alive after this disconnect.
        conn._ws.close();
      } else if (conn?._transport) {
        conn._transport.close();
      }
    } catch (e) { /* ignore ws close errors */ }
    console.log('   Disconnected (WebSocket only — browser kept alive by processKeepAlive)');

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

    // 8. Update daily_reports status - per-report for mixed-brand batches
    console.log('📋 Updating daily_reports status...');
    try {
      // Group results by dailyReportId
      const resultsByReport = {};
      for (const r of results) {
        const reportId = r.dailyReportId || defaultDailyReportId;
        if (!resultsByReport[reportId]) resultsByReport[reportId] = [];
        resultsByReport[reportId].push(r);
      }

      // Update each daily_report with its own stats
      for (const [reportId, reportResults] of Object.entries(resultsByReport)) {
        const reportOk = reportResults.filter(r => r.success).length;
        const reportFail = reportResults.filter(r => !r.success).length;
        const reportTotal = reportResults.length;
        // Onboarding runs pre-set total_prompts=30 at report creation — don't overwrite with chunk size
        const isOnboarding = scheduleId && String(scheduleId).startsWith('onboarding-');

        const { error: updateError } = await supabase
          .from('daily_reports')
          .update({
            chatgpt_status: 'complete',
            status: 'running',
            completed_prompts: reportOk,
            ...(isOnboarding ? {} : { total_prompts: reportTotal }),
            chatgpt_attempted: reportTotal,
            chatgpt_ok: reportOk,
            chatgpt_no_result: reportFail
          })
          .eq('id', reportId)
          .neq('status', 'completed');

        if (updateError) {
          console.error('⚠️  Failed to update daily_report ' + reportId + ':', updateError);
        } else {
          console.log('✅ Updated daily_report ' + reportId + ': ' + reportOk + '/' + reportTotal);
        }
      }
    } catch (aggregationError) {
      console.error('⚠️  Update error:', aggregationError);
    }

    return {
      success: true,
      dailyReportId: defaultDailyReportId,
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


  } catch (connectError) {
    // FORENSIC: Log connection failure
    await logForensic({
      chatgpt_account_id: currentAccountId,
      chatgpt_account_email: account.email,
      browserless_session_id: currentSessionId,
      proxy_used: currentProxyUsed,
      connection_status: 'Error',
      connection_error_raw: 'CDP Handshake Failed: ' + connectError.message,
      visual_state: 'Unknown',
      operation_type: 'batch_execution',
      batch_id: scheduleId,
      playwright_cdp_url: account.browserless_connect_url,
      response_time_ms: Date.now() - connectStartTime
    });

    // AUTO-RECOVERY: CDP connection failure handling (daily batches only)
    // session_busy (429): zombie WebSocket blocking — kill session via stop URL + reinit.
    //   No retry after stop URL — the session is dead and must be re-created.
    // other errors: retry connectOverCDP once — only reinit if retry also fails.
    const isOnboarding = scheduleId && String(scheduleId).startsWith('onboarding-');
    if (!isOnboarding && scheduleId) {
      const failureType = classifyConnectionError(connectError.message);
      if (failureType === 'session_busy') {
        console.log('[AUTO-RECOVERY] Session busy (zombie WebSocket) — killing session + reinit...');
        await tryKillZombieSession(account.browserless_stop_url);
        await triggerAutoReinit(account.email, failureType, String(scheduleId));
        throw connectError;
      } else {
        console.log('[AUTO-RECOVERY] CDP failure (' + failureType + ') — retrying connection once...');
        try {
          browser = await playwright.chromium.connectOverCDP(account.browserless_connect_url);
          console.log('[AUTO-RECOVERY] Retry succeeded — continuing batch');
          // browser is now set; execution continues past this catch block normally
        } catch (retryError) {
          console.log('[AUTO-RECOVERY] Retry also failed — triggering reinit...');
          await triggerAutoReinit(account.email, failureType, String(scheduleId));
          throw retryError;
        }
      }
    } else {
      throw connectError;
    }
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

  if (currentUrl.includes('chatgpt.com')) {
    console.log('   Already on ChatGPT — checking UI health...');
    await page.waitForTimeout(2000);
    // If textarea is missing the page may be in a broken state — reload to recover
    const hasTextarea = await page.locator('#prompt-textarea').count() > 0;
    if (!hasTextarea) {
      console.log('   ⚠️  Textarea missing on existing page — reloading...');
      try {
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForTimeout(4000);
      } catch (reloadErr) {
        console.warn('   Reload failed:', reloadErr.message.slice(0, 80));
      }
    }
  } else {
    // Navigate with up to 2 attempts — on timeout try reload then retry goto
    let navigated = false;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(`   Navigating to ChatGPT (attempt ${attempt})...`);
        await page.goto('https://chatgpt.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(4000);
        navigated = true;
        break;
      } catch (navErr) {
        console.warn(`   ⚠️  Navigation attempt ${attempt} failed: ${navErr.message.slice(0, 80)}`);
        if (attempt < 2) {
          // Try a reload of whatever is currently loaded before next goto attempt
          try {
            console.log('   Trying page.reload() before retry...');
            await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.waitForTimeout(3000);
            // If reload landed on chatgpt.com we're done
            if (page.url().includes('chatgpt.com')) {
              console.log('   ✅ Reload landed on ChatGPT');
              navigated = true;
              break;
            }
          } catch (reloadErr) {
            console.warn('   Reload also failed:', reloadErr.message.slice(0, 60));
          }
        }
      }
    }
    if (!navigated) {
      throw new Error('Failed to navigate to ChatGPT after 2 attempts');
    }
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

/**
 * Convert ChatGPT response innerHTML to markdown.
 * Preserves: bold, italic, headings, bullet lists, numbered lists,
 * links, inline code, code blocks, horizontal rules.
 * Strips all remaining HTML tags and decodes entities.
 */
function htmlToMarkdown(html) {
  if (!html) return '';
  let md = html;

  // Strip script/style noise
  md = md.replace(/<script[\s\S]*?<\/script>/gi, '');
  md = md.replace(/<style[\s\S]*?<\/style>/gi, '');

  // Fenced code blocks (before inline code)
  md = md.replace(/<pre[^>]*>[\s\S]*?<code[^>]*>([\s\S]*?)<\/code>[\s\S]*?<\/pre>/gi, (_, code) => {
    return '\n```\n' + decodeEntities(stripTags(code)) + '\n```\n';
  });

  // Headings
  md = md.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_, c) => '\n# ' + stripTags(c).trim() + '\n');
  md = md.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_, c) => '\n## ' + stripTags(c).trim() + '\n');
  md = md.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_, c) => '\n### ' + stripTags(c).trim() + '\n');
  md = md.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, (_, c) => '\n#### ' + stripTags(c).trim() + '\n');

  // Bold / italic (keep markers, strip tags after)
  md = md.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**');
  md = md.replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '**$1**');
  md = md.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '*$1*');
  md = md.replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, '*$1*');

  // Links — preserve href + visible text
  md = md.replace(/<a[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, text) => {
    const cleanText = stripTags(text).trim();
    // Skip empty anchors or pure-image anchors
    if (!cleanText) return '';
    return '[' + cleanText + '](' + href + ')';
  });

  // Inline code
  md = md.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_, c) => '`' + decodeEntities(stripTags(c)) + '`');

  // Horizontal rule
  md = md.replace(/<hr[^>]*\/?>/gi, '\n---\n');

  // Ordered lists — number items sequentially within each <ol>
  md = md.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_, content) => {
    let n = 0;
    const items = content.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (__, item) => {
      n++;
      return '\n' + n + '. ' + stripTags(item).trim();
    });
    return '\n' + items + '\n';
  });

  // Unordered lists
  md = md.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_, content) => {
    const items = content.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (__, item) => {
      return '\n- ' + stripTags(item).trim();
    });
    return '\n' + items + '\n';
  });

  // Paragraphs → text + blank line
  md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '$1\n\n');

  // Line breaks
  md = md.replace(/<br\s*\/?>/gi, '\n');

  // Strip remaining HTML tags
  md = stripTags(md);

  // Decode HTML entities
  md = decodeEntities(md);

  // Collapse 3+ blank lines to 2
  md = md.replace(/\n{3,}/g, '\n\n');

  return md.trim();
}

function stripTags(html) {
  return (html || '').replace(/<[^>]+>/g, '');
}

function decodeEntities(text) {
  return (text || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

module.exports = {
  executeBatch,
  triggerAutoReinit,
};
