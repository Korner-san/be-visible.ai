#!/usr/bin/env node
/**
 * test-conversation-reuse.js
 *
 * Standalone test for the conversation-reuse architecture.
 * Mirrors the production pattern: each "connection" runs as a SEPARATE child
 * process (spawnSync), exactly like queue-organizer spawns run-onboarding-chunk.js.
 * When a child exits the OS force-closes the WebSocket, releasing the Browserless
 * session immediately — same as production.
 *
 * Modes (set by CONV_TEST_MODE env var):
 *   orchestrator  — spawns connection-1 then connection-2, checks result
 *   connection-1  — connect, open new conv, send 3 prompts, save URL+count, exit
 *   connection-2  — connect, navigate to saved conv URL, send 3 more prompts, verify URL, exit
 *
 * Run: node test-conversation-reuse.js
 */

require('dotenv').config();
const { spawnSync } = require('child_process');
const playwright = require('playwright-core');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const TEST_ACCOUNT_EMAIL = process.env.TEST_ACCOUNT_EMAIL || 'ididitforkik1000@gmail.com';
const TEST_BRAND_NAME    = process.env.TEST_BRAND_NAME    || 'Tavily';
const MODE               = process.env.CONV_TEST_MODE     || 'orchestrator';

// ─── DB helpers ───────────────────────────────────────────────────────────────

async function loadAccount() {
  const { data, error } = await supabase
    .from('chatgpt_accounts')
    .select('browserless_connect_url, browserless_session_id, current_conversation_url, current_conversation_prompt_count')
    .eq('email', TEST_ACCOUNT_EMAIL)
    .single();
  if (error || !data?.browserless_connect_url) throw new Error('No account/session: ' + (error?.message || 'missing connect url'));
  return data;
}

async function saveConversationState(url, count) {
  const { error } = await supabase
    .from('chatgpt_accounts')
    .update({ current_conversation_url: url, current_conversation_prompt_count: count })
    .eq('email', TEST_ACCOUNT_EMAIL);
  if (error) throw new Error('saveConversationState: ' + error.message);
  console.log(`[STATE] url=${url ? url.slice(-12) : 'null'} count=${count}`);
}

async function resetConversationState() {
  await saveConversationState(null, 0);
}

async function loadTestPrompts() {
  const { data, error } = await supabase
    .from('brand_prompts')
    .select('improved_prompt, raw_prompt, brands!inner(name)')
    .eq('brands.name', TEST_BRAND_NAME)
    .eq('status', 'active')
    .limit(6);
  if (error || !data || data.length < 6) throw new Error(`Not enough prompts for "${TEST_BRAND_NAME}": ${error?.message}`);
  return data.map(p => p.improved_prompt || p.raw_prompt);
}

// ─── Browser helpers ──────────────────────────────────────────────────────────

async function connectBrowser() {
  const account = await loadAccount();
  console.log('[BROWSER] Connecting to session', account.browserless_session_id?.slice(0, 12), '...');
  const browser = await playwright.chromium.connectOverCDP(account.browserless_connect_url);
  console.log('[BROWSER] Connected.');
  return browser;
}

async function ensureLoggedIn(page) {
  const url = page.url();
  console.log('[PAGE] URL:', url);

  if (!url.includes('chatgpt.com')) {
    console.log('[PAGE] Navigating to chatgpt.com...');
    await page.goto('https://chatgpt.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);
  } else {
    await page.waitForTimeout(3000);
  }

  // Cloudflare guard
  let title = await page.title();
  if (title.includes('Just a moment')) {
    console.log('[PAGE] Cloudflare — waiting up to 30s...');
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(3000);
      title = await page.title();
      if (!title.includes('Just a moment')) break;
    }
    if (title.includes('Just a moment')) throw new Error('Cloudflare not resolved — reinit session');
  }

  if (await page.locator('button:has-text("Log in")').count() > 0)
    throw new Error('Not logged in — reinitialize session first');

  let hasTextarea = await page.locator('#prompt-textarea').count() > 0;
  if (!hasTextarea) {
    console.warn('[PAGE] Textarea missing — reloading...');
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(4000);
    hasTextarea = await page.locator('#prompt-textarea').count() > 0;
    if (!hasTextarea) throw new Error('Textarea still missing after reload');
  }
  console.log('[PAGE] Logged in, textarea visible ✓');
}

async function waitForResponseStable(page) {
  let stable = 0, lastLen = 0;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(1500);
    const msgs = await page.locator('[data-message-author-role="assistant"]').all();
    if (!msgs.length) continue;
    const len = (await msgs[msgs.length - 1].textContent() || '').length;
    if (len === lastLen && len > 0) { if (++stable >= 3) { console.log(`[PROMPT] Stable at ${len} chars`); return; } }
    else stable = 0;
    lastLen = len;
  }
  console.warn('[PROMPT] Stabilization timeout — continuing');
}

async function sendPrompt(page, text, num) {
  console.log(`\n[PROMPT ${num}] "${text.substring(0, 70)}"`);
  const textarea = page.locator('#prompt-textarea').first();
  await textarea.waitFor({ state: 'visible', timeout: 15000 });
  await textarea.fill('/search');
  await textarea.press('Enter');
  await page.waitForTimeout(1000);
  await textarea.fill(text);
  await page.waitForTimeout(500);
  await page.locator('button[data-testid="send-button"]').click();
  console.log(`[PROMPT ${num}] Sent — waiting...`);
  await page.waitForTimeout(4000);
  await waitForResponseStable(page);
  console.log(`[PROMPT ${num}] Done ✓`);
}

// ─── Mode: connection-1 ───────────────────────────────────────────────────────

async function runConnection1() {
  console.log('\n' + '═'.repeat(60));
  console.log('CONNECTION 1 — Starting a NEW conversation');
  console.log('═'.repeat(60));

  const prompts = await loadTestPrompts();
  const browser = await connectBrowser();
  const context = browser.contexts()[0];
  const page = context.pages()[0] || await context.newPage();

  await ensureLoggedIn(page);

  // Reset state then open new conversation
  await saveConversationState(null, 0);
  console.log('[CONV] Ctrl+Shift+O — opening new conversation...');
  await page.keyboard.press('Control+Shift+KeyO');
  await page.waitForTimeout(2500);

  let savedUrl = null;
  let count = 0;

  for (let i = 0; i < 3; i++) {
    await sendPrompt(page, prompts[i], i + 1);
    count++;

    if (i === 0 || !savedUrl) {
      await page.waitForTimeout(1500);
      const url = page.url();
      if (url.includes('/c/')) {
        savedUrl = url;
        console.log('[CONV] Conversation URL:', savedUrl);
      }
    }
    await saveConversationState(savedUrl, count);
  }

  console.log('\n[C1 RESULT] Prompts sent: 3');
  console.log('[C1 RESULT] URL:', savedUrl);
  console.log('[C1 RESULT] Count in DB:', count);
  // Process exits here — OS force-closes WebSocket, Browserless releases session
}

// ─── Mode: connection-2 ───────────────────────────────────────────────────────

async function runConnection2() {
  console.log('\n' + '═'.repeat(60));
  console.log('CONNECTION 2 — Continuing EXISTING conversation');
  console.log('═'.repeat(60));

  const prompts = await loadTestPrompts();
  const account = await loadAccount();

  console.log('[STATE] url=', account.current_conversation_url?.slice(-12), 'count=', account.current_conversation_prompt_count);
  if (!account.current_conversation_url) throw new Error('No conversation URL in DB — Connection 1 failed');

  const browser = await connectBrowser();
  const context = browser.contexts()[0];
  const page = context.pages()[0] || await context.newPage();

  await ensureLoggedIn(page);

  // Navigate to the saved conversation (not chatgpt.com home)
  console.log('[CONV] Navigating to saved conversation...');
  await page.goto(account.current_conversation_url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  const landedUrl = page.url();
  console.log('[CONV] Landed at:', landedUrl);
  if (!landedUrl.includes('/c/')) throw new Error('Failed to land on conversation. Got: ' + landedUrl);

  const existingMsgs = await page.locator('[data-message-author-role="assistant"]').count();
  console.log(`[CONV] Found ${existingMsgs} existing assistant message(s) ✓`);

  let count = account.current_conversation_prompt_count;
  for (let i = 0; i < 3; i++) {
    await sendPrompt(page, prompts[3 + i], 3 + i + 1);
    count++;
    await saveConversationState(account.current_conversation_url, count);
  }

  const finalUrl = page.url();
  console.log('\n[C2 RESULT] Prompts sent: 3 more (total: 6)');
  console.log('[C2 RESULT] URL unchanged:', finalUrl === account.current_conversation_url ? '✓ YES' : '✗ NO — ' + finalUrl);
  if (finalUrl === account.current_conversation_url) {
    console.log('[PASS] Same conversation maintained across both connections ✓');
  } else {
    console.error('[FAIL] URL changed unexpectedly');
    process.exit(1);
  }
  // Process exits — OS closes WebSocket cleanly
}

// ─── Mode: orchestrator ───────────────────────────────────────────────────────

function spawnMode(mode) {
  console.log(`\n[ORCH] Spawning ${mode}...`);
  const result = spawnSync('node', [__filename], {
    stdio: 'inherit',
    cwd: __dirname,
    env: { ...process.env, CONV_TEST_MODE: mode },
  });
  if (result.status !== 0) {
    console.error(`[ORCH] ${mode} exited with code ${result.status}`);
    process.exit(result.status || 1);
  }
  console.log(`[ORCH] ${mode} completed successfully.`);
}

async function orchestrate() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║     CONVERSATION REUSE TEST — be-visible.ai worker       ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('Account:', TEST_ACCOUNT_EMAIL);
  console.log('Brand:  ', TEST_BRAND_NAME);

  try {
    spawnMode('connection-1');
    console.log('\n[ORCH] Connection 1 process exited (OS closed WebSocket). Running Connection 2...');
    spawnMode('connection-2');
    console.log('\n[ORCH] All done.');
  } finally {
    console.log('\n[CLEANUP] Resetting conversation state...');
    await resetConversationState();
    console.log('[CLEANUP] Done.');
  }
}

// ─── Entry point ─────────────────────────────────────────────────────────────

(async () => {
  try {
    if (MODE === 'connection-1')   await runConnection1();
    else if (MODE === 'connection-2') await runConnection2();
    else                           await orchestrate();
    process.exit(0);
  } catch (err) {
    console.error('[FATAL]', err.message);
    process.exit(1);
  }
})();
