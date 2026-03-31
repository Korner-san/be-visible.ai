#!/usr/bin/env node
/**
 * test-conversation-reuse.js
 *
 * Standalone test for the conversation-reuse architecture.
 * Verifies that multiple Browserless connections can share a single ChatGPT conversation
 * by storing and retrieving the conversation URL in chatgpt_accounts.
 *
 * Test flow:
 *   Connection 1: Start a NEW conversation, send 3 test prompts, save URL, disconnect
 *   Connection 2: Navigate to saved URL, send 3 more prompts in the SAME conversation, disconnect
 *
 * Expected result: both connections share one conversation URL (/c/UUID)
 * Run: node test-conversation-reuse.js
 * Cleanup: resets current_conversation_url and current_conversation_prompt_count after test
 */

require('dotenv').config();
const playwright = require('playwright-core');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const TEST_ACCOUNT_EMAIL = process.env.TEST_ACCOUNT_EMAIL || 'bluecjamie1@gmail.com';
const MAX_PROMPTS_PER_CONVERSATION = 10;
const TEST_PROMPTS = [
  'Say "test message 1" and nothing else.',
  'Say "test message 2" and nothing else.',
  'Say "test message 3" and nothing else.',
  'Say "test message 4" and nothing else.',
  'Say "test message 5" and nothing else.',
  'Say "test message 6" and nothing else.',
];

// ─── helpers ──────────────────────────────────────────────────────────────────

async function loadConversationState() {
  const { data, error } = await supabase
    .from('chatgpt_accounts')
    .select('current_conversation_url, current_conversation_prompt_count, browserless_connect_url, browserless_session_id')
    .eq('email', TEST_ACCOUNT_EMAIL)
    .single();
  if (error) throw new Error('Failed to load account: ' + error.message);
  return data;
}

async function saveConversationState(url, count) {
  const { error } = await supabase
    .from('chatgpt_accounts')
    .update({
      current_conversation_url: url,
      current_conversation_prompt_count: count,
    })
    .eq('email', TEST_ACCOUNT_EMAIL);
  if (error) throw new Error('Failed to save conversation state: ' + error.message);
  console.log(`[STATE] Saved url=${url ? url.slice(-12) : 'null'} count=${count}`);
}

async function resetConversationState() {
  await saveConversationState(null, 0);
  console.log('[CLEANUP] Conversation state reset to null/0');
}

async function connectBrowser() {
  const account = await loadConversationState();
  if (!account.browserless_connect_url) throw new Error('No browserless_connect_url — run initialization first');
  console.log('[BROWSER] Connecting via CDP...');
  const browser = await playwright.chromium.connectOverCDP(account.browserless_connect_url);
  console.log('[BROWSER] Connected. Session:', account.browserless_session_id?.slice(0, 12));
  return browser;
}

function disconnectBrowser(browser) {
  try {
    browser._connection._transport.close();
    console.log('[BROWSER] WebSocket closed (browser kept alive by processKeepAlive)');
  } catch (e) {
    console.warn('[BROWSER] Disconnect error (non-fatal):', e.message);
  }
}

async function ensureLoggedIn(page) {
  const url = page.url();
  console.log('[PAGE] Current URL:', url);
  if (!url.includes('chatgpt.com')) {
    console.log('[PAGE] Navigating to chatgpt.com...');
    await page.goto('https://chatgpt.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);
  }
  const hasTextarea = await page.locator('#prompt-textarea').count() > 0;
  const hasLoginBtn = await page.locator('button:has-text("Log in")').count() > 0;
  if (hasLoginBtn) throw new Error('Not logged in — reinitialize session first');
  if (!hasTextarea) throw new Error('Textarea not found — page may be broken');
  console.log('[PAGE] Logged in and textarea visible ✓');
}

async function waitForResponseStable(page) {
  let stable = 0;
  let lastLength = 0;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(1500);
    const messages = await page.locator('[data-message-author-role="assistant"]').all();
    if (messages.length === 0) continue;
    const currentLength = (await messages[messages.length - 1]?.textContent() || '').length;
    if (currentLength === lastLength && currentLength > 0) {
      stable++;
      if (stable >= 3) {
        console.log(`[PROMPT] Response stable at ${currentLength} chars`);
        return;
      }
    } else {
      stable = 0;
    }
    lastLength = currentLength;
  }
  console.warn('[PROMPT] Response stabilization timeout — continuing anyway');
}

async function sendPrompt(page, text, promptIndex) {
  console.log(`\n[PROMPT ${promptIndex}] Sending: "${text}"`);
  const textarea = page.locator('#prompt-textarea').first();
  await textarea.waitFor({ state: 'visible', timeout: 15000 });

  // Enable search mode
  await textarea.fill('/search');
  await textarea.press('Enter');
  await page.waitForTimeout(1000);

  // Fill the actual prompt
  await textarea.fill(text);
  await page.waitForTimeout(500);

  // Click send
  await page.locator('button[data-testid="send-button"]').click();
  console.log(`[PROMPT ${promptIndex}] Sent — waiting for response...`);

  // Wait for initial response
  await page.waitForTimeout(4000);
  await waitForResponseStable(page);
  console.log(`[PROMPT ${promptIndex}] Done ✓`);
}

async function captureConversationUrl(page) {
  await page.waitForTimeout(1500);
  const url = page.url();
  if (!url.includes('/c/')) {
    console.warn('[CONV] URL does not contain /c/ yet:', url);
    return null;
  }
  return url;
}

// ─── test runs ────────────────────────────────────────────────────────────────

async function runConnection1() {
  console.log('\n' + '═'.repeat(60));
  console.log('CONNECTION 1 — Starting a NEW conversation');
  console.log('═'.repeat(60));

  const browser = await connectBrowser();
  const context = browser.contexts()[0];
  const page = context.pages()[0] || await context.newPage();

  try {
    await ensureLoggedIn(page);

    // Reset to fresh state before test
    await saveConversationState(null, 0);

    // Always start a new conversation for this test
    console.log('[CONV] Opening new conversation via Ctrl+Shift+O...');
    await page.keyboard.press('Control+Shift+KeyO');
    await page.waitForTimeout(2500);

    let savedUrl = null;
    let promptCount = 0;

    for (let i = 0; i < 3; i++) {
      await sendPrompt(page, TEST_PROMPTS[i], i + 1);
      promptCount++;

      if (i === 0) {
        // Capture URL after first prompt (ChatGPT creates /c/UUID here)
        savedUrl = await captureConversationUrl(page);
        if (savedUrl) {
          console.log('[CONV] Captured conversation URL:', savedUrl);
          await saveConversationState(savedUrl, promptCount);
        } else {
          console.warn('[CONV] Could not capture /c/ URL — will retry after next prompt');
        }
      } else if (!savedUrl) {
        // Retry URL capture if first attempt missed
        const url = await captureConversationUrl(page);
        if (url) {
          savedUrl = url;
          console.log('[CONV] Captured conversation URL (retry):', savedUrl);
        }
        await saveConversationState(savedUrl, promptCount);
      } else {
        // Just update the count
        await saveConversationState(savedUrl, promptCount);
      }
    }

    console.log('\n[C1 RESULT] Prompts sent: 3');
    console.log('[C1 RESULT] Conversation URL:', savedUrl);
    console.log('[C1 RESULT] Prompt count in DB: 3');

    return savedUrl;

  } finally {
    disconnectBrowser(browser);
  }
}

async function runConnection2(expectedUrl) {
  console.log('\n' + '═'.repeat(60));
  console.log('CONNECTION 2 — Continuing EXISTING conversation');
  console.log('═'.repeat(60));

  // Re-read state from DB to simulate a fresh child process
  const state = await loadConversationState();
  console.log('[STATE] Loaded from DB: url=', state.current_conversation_url?.slice(-12), 'count=', state.current_conversation_prompt_count);

  if (!state.current_conversation_url) {
    throw new Error('No conversation URL in DB — Connection 1 did not save it correctly');
  }

  const browser = await connectBrowser();
  const context = browser.contexts()[0];
  const page = context.pages()[0] || await context.newPage();

  try {
    await ensureLoggedIn(page);

    // Navigate directly to the saved conversation (not chatgpt.com home)
    console.log('[CONV] Navigating to saved conversation:', state.current_conversation_url);
    await page.goto(state.current_conversation_url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const currentUrl = page.url();
    console.log('[CONV] Landed at URL:', currentUrl);
    if (!currentUrl.includes('/c/')) {
      throw new Error('Failed to navigate to conversation URL. Landed at: ' + currentUrl);
    }

    const hasTextarea = await page.locator('#prompt-textarea').count() > 0;
    if (!hasTextarea) {
      throw new Error('Textarea not visible after navigating to conversation');
    }

    // Count existing messages to confirm we're in the right conversation
    const assistantMessages = await page.locator('[data-message-author-role="assistant"]').count();
    console.log(`[CONV] Found ${assistantMessages} existing assistant message(s) in conversation ✓`);

    let promptCount = state.current_conversation_prompt_count;

    for (let i = 3; i < 6; i++) {
      await sendPrompt(page, TEST_PROMPTS[i], i + 1);
      promptCount++;
      await saveConversationState(state.current_conversation_url, promptCount);
    }

    const finalUrl = page.url();
    console.log('\n[C2 RESULT] Prompts sent: 3 more (total: 6)');
    console.log('[C2 RESULT] URL stayed same:', finalUrl === state.current_conversation_url);
    console.log('[C2 RESULT] Conversation URL:', finalUrl);
    console.log('[C2 RESULT] Prompt count in DB:', promptCount);

    // Verify URL match
    if (finalUrl !== state.current_conversation_url) {
      console.error('[FAIL] URL changed unexpectedly! Started at:', state.current_conversation_url, 'Ended at:', finalUrl);
    } else {
      console.log('[PASS] Same conversation URL maintained across both connections ✓');
    }

    if (finalUrl === expectedUrl) {
      console.log('[PASS] URL matches expected URL from Connection 1 ✓');
    } else {
      console.error('[FAIL] URL mismatch. Expected:', expectedUrl, 'Got:', finalUrl);
    }

  } finally {
    disconnectBrowser(browser);
  }
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║     CONVERSATION REUSE TEST — be-visible.ai worker       ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('Account:', TEST_ACCOUNT_EMAIL);
  console.log('MAX_PROMPTS_PER_CONVERSATION:', MAX_PROMPTS_PER_CONVERSATION);

  let savedUrl;
  try {
    savedUrl = await runConnection1();
    console.log('\n[PAUSE] Waiting 5s before Connection 2...');
    await new Promise(r => setTimeout(r, 5000));
    await runConnection2(savedUrl);

    console.log('\n' + '═'.repeat(60));
    console.log('TEST COMPLETE');
    console.log('═'.repeat(60));
  } catch (err) {
    console.error('\n[ERROR] Test failed:', err.message);
  } finally {
    console.log('\n[CLEANUP] Resetting conversation state in DB...');
    await resetConversationState();
    console.log('[CLEANUP] Done. DB state restored to null/0.');
  }

  process.exit(0);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
