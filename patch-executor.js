/**
 * patch-executor.js — rewrite Hook 1 (CDP catch) and Hook 2 (login button)
 */
const fs = require('fs');
const filePath = '/root/be-visible.ai/worker/executors/chatgpt-executor.js';
const raw = fs.readFileSync(filePath, 'utf8');
const hasCRLF = raw.includes('\r\n');
let s = hasCRLF ? raw.replace(/\r\n/g, '\n') : raw;

function patch(label, oldStr, newStr) {
  if (!s.includes(oldStr)) {
    console.error('ERROR: Could not find [' + label + ']');
    process.exit(1);
  }
  s = s.replace(oldStr, newStr);
  console.log('\u2705', label);
}

// ── 1. Rewrite Hook 2: login button visible during batch ──────────────────────
// Connection to Browserless was fine — no zombie kill needed.
// Close WebSocket, trigger reinit. Webhook fires inside triggerAutoReinit
// only if reinit result shows Sign_In_Button (cookies truly expired).
patch('Hook 2: login button — close WS + reinit (no zombie kill)',
`    if (!loginResult.isLoggedIn) {
      // Connected to Browserless fine but ChatGPT cookies are expired.
      // NOT a Browserless connection failure \u2014 trigger reinit directly.
      const isOnboarding = scheduleId && String(scheduleId).startsWith('onboarding-');
      if (!isOnboarding) {
        await triggerAutoReinit(CHATGPT_ACCOUNT_EMAIL, 'cookies_expired', String(scheduleId || ''));
      }
      throw new Error('Session not logged in - requires re-initialization');
    }`,
`    if (!loginResult.isLoggedIn) {
      // Connection to Browserless succeeded but ChatGPT shows the login button.
      // Close the WebSocket cleanly then trigger reinit.
      // Webhook fires inside triggerAutoReinit only if reinit also sees Sign_In_Button.
      const isOnboarding = scheduleId && String(scheduleId).startsWith('onboarding-');
      if (!isOnboarding) {
        try { browser._connection._transport.close(); } catch (e) {}
        await triggerAutoReinit(CHATGPT_ACCOUNT_EMAIL, 'login_button_during_batch', String(scheduleId || ''));
      }
      throw new Error('Session not logged in - requires re-initialization');
    }`);

// ── 2. Rewrite Hook 1: CDP catch block ───────────────────────────────────────
// session_busy (429): zombie WebSocket is blocking — kill session via stop URL
//   then reinit immediately (no retry possible, session is dead after stop URL).
// other errors: retry connectOverCDP once before escalating to reinit.
//   If retry succeeds, browser is set and execution continues normally.
//   If retry also fails, trigger reinit then throw.
patch('Hook 1: CDP catch — session_busy kills zombie+reinit, others retry-first',
`    // AUTO-RECOVERY: any CDP connection failure \u2014 immediately reinit the session (daily batches only).
    // session_busy (429) = zombie WebSocket holding the session \u2014 kill it at Browserless first.
    // After reinit: if ChatGPT shows login button \u2014 fire Make webhook for manual cookie extraction.
    const isOnboarding = scheduleId && String(scheduleId).startsWith('onboarding-');
    if (!isOnboarding && scheduleId) {
      const failureType = classifyConnectionError(connectError.message);
      console.log('[AUTO-RECOVERY] CDP failure (' + failureType + ') \u2014 triggering session reinit...');
      if (failureType === 'session_busy') {
        await tryKillZombieSession(account.browserless_stop_url);
      }
      await triggerAutoReinit(account.email, failureType, String(scheduleId));
    }
    throw connectError;
  }`,
`    // AUTO-RECOVERY: CDP connection failure handling (daily batches only)
    // session_busy (429): zombie WebSocket blocking \u2014 kill session via stop URL + reinit.
    //   No retry after stop URL \u2014 the session is dead and must be re-created.
    // other errors: retry connectOverCDP once \u2014 only reinit if retry also fails.
    const isOnboarding = scheduleId && String(scheduleId).startsWith('onboarding-');
    if (!isOnboarding && scheduleId) {
      const failureType = classifyConnectionError(connectError.message);
      if (failureType === 'session_busy') {
        console.log('[AUTO-RECOVERY] Session busy (zombie WebSocket) \u2014 killing session + reinit...');
        await tryKillZombieSession(account.browserless_stop_url);
        await triggerAutoReinit(account.email, failureType, String(scheduleId));
        throw connectError;
      } else {
        console.log('[AUTO-RECOVERY] CDP failure (' + failureType + ') \u2014 retrying connection once...');
        try {
          browser = await playwright.chromium.connectOverCDP(account.browserless_connect_url);
          console.log('[AUTO-RECOVERY] Retry succeeded \u2014 continuing batch');
          // browser is now set; execution continues past this catch block normally
        } catch (retryError) {
          console.log('[AUTO-RECOVERY] Retry also failed \u2014 triggering reinit...');
          await triggerAutoReinit(account.email, failureType, String(scheduleId));
          throw retryError;
        }
      }
    } else {
      throw connectError;
    }
  }`);

// Write back (restore CRLF if original had it)
const output = hasCRLF ? s.replace(/\n/g, '\r\n') : s;
fs.writeFileSync(filePath, output, 'utf8');
console.log('\n\u2705 All patches applied.');
