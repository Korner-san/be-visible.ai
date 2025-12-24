require('dotenv').config();
const playwright = require('playwright-core');
const { createClient } = require('@supabase/supabase-js');

const BROWSERLESS_TOKEN = process.env.BROWSERLESS_TOKEN || '2T8Z935QyjLO2re280e4b9276a8599c39624e5c2b23456367';
const supabaseUrl = 'https://tzfvtofjcvpddqfgxdtn.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Get email from environment variable or use default
const ACCOUNT_EMAIL = process.env.CHATGPT_EMAIL || process.env.EMAIL || 'ididitforkik1000@gmail.com';

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

async function initializePersistentSession() {
  const startTime = Date.now();
  const initStartTimestamp = new Date().toISOString();

  console.log('\n' + '='.repeat(70));
  console.log('🚀 INITIALIZE 30-DAY PERSISTENT SESSION (DATABASE-DRIVEN + FORENSIC)');
  console.log('='.repeat(70) + '\n');

  let accountId = null;
  let sessionId = null;
  let proxyUsed = null;
  let connectionStatus = 'Error';
  let connectionErrorRaw = null;
  let visualState = 'Unknown';
  let visualStateDetails = {};

  try {
    // 1. Load account with proxy config from database
    console.log(`📊 Loading account from database: ${ACCOUNT_EMAIL}...`);
    const { data: account, error } = await supabase
      .from('chatgpt_accounts')
      .select('*')
      .eq('email', ACCOUNT_EMAIL)
      .single();

    if (error || !account) {
      console.error('❌ Failed to fetch account:', error);
      console.error(`   Make sure account ${ACCOUNT_EMAIL} exists in chatgpt_accounts table`);

      // FORENSIC: Log initialization failure
      await logForensic({
        chatgpt_account_email: ACCOUNT_EMAIL,
        connection_status: 'Error',
        connection_error_raw: error?.message || 'Account not found in database',
        visual_state: 'Unknown',
        operation_type: 'initialization',
        response_time_ms: Date.now() - startTime
      });

      return;
    }

    accountId = account.id;
    proxyUsed = `${account.proxy_host}:${account.proxy_port}`;

    console.log(`✅ Loaded account from database:`);
    console.log(`   Email: ${account.email}`);
    console.log(`   Display Name: ${account.display_name}`);
    console.log(`   Account Type: ${account.account_type}`);
    console.log(`   Status: ${account.status}`);

    // FORENSIC: Update last_initialization_attempt
    await supabase
      .from('chatgpt_accounts')
      .update({
        last_initialization_attempt: initStartTimestamp
      })
      .eq('id', accountId);

    // Verify proxy configuration exists
    if (!account.proxy_host || !account.proxy_port) {
      console.error('❌ No proxy configuration found for this account!');
      console.error('   Please assign a proxy to this account in the database.');
      console.error('   Required fields: proxy_host, proxy_port, proxy_username, proxy_password');

      // FORENSIC: Log configuration error
      await logForensic({
        chatgpt_account_id: accountId,
        chatgpt_account_email: ACCOUNT_EMAIL,
        connection_status: 'Error',
        connection_error_raw: 'No proxy configuration found',
        visual_state: 'Unknown',
        operation_type: 'initialization',
        response_time_ms: Date.now() - startTime
      });

      await supabase
        .from('chatgpt_accounts')
        .update({ last_initialization_result: 'failed' })
        .eq('id', accountId);

      return;
    }

    console.log(`   🌎 Proxy: ${account.proxy_host}:${account.proxy_port}`);
    console.log(`   🔐 Proxy Auth: ${account.proxy_username ? 'Configured' : 'Missing'}`);

    // Check for storage_state
    if (!account.storage_state || !account.storage_state.cookies) {
      console.error('❌ No storage_state found in database!');
      console.error('   Make sure you uploaded chatgpt-storage-state.json for this account.');

      // FORENSIC: Log missing cookies error
      await logForensic({
        chatgpt_account_id: accountId,
        chatgpt_account_email: ACCOUNT_EMAIL,
        proxy_used: proxyUsed,
        connection_status: 'Error',
        connection_error_raw: 'No storage_state/cookies found in database',
        visual_state: 'Unknown',
        operation_type: 'initialization',
        response_time_ms: Date.now() - startTime
      });

      await supabase
        .from('chatgpt_accounts')
        .update({ last_initialization_result: 'failed' })
        .eq('id', accountId);

      return;
    }

    const cookieCount = account.storage_state.cookies.length;
    console.log(`   Storage state cookies: ${cookieCount}`);

    if (cookieCount < 5) {
      console.error('❌ Too few cookies in storage_state!');
      console.error(`   Expected at least 5 essential cookies, got ${cookieCount}`);

      // FORENSIC: Log insufficient cookies error
      await logForensic({
        chatgpt_account_id: accountId,
        chatgpt_account_email: ACCOUNT_EMAIL,
        proxy_used: proxyUsed,
        connection_status: 'Error',
        connection_error_raw: `Insufficient cookies: expected >= 5, got ${cookieCount}`,
        visual_state: 'Unknown',
        operation_type: 'initialization',
        response_time_ms: Date.now() - startTime
      });

      await supabase
        .from('chatgpt_accounts')
        .update({ last_initialization_result: 'failed' })
        .eq('id', accountId);

      return;
    }

    console.log(`   ✅ Full storage state loaded (${cookieCount} cookies)`);

    // 2. Create 30-day persistent session with account's assigned proxy
    console.log('\n🔧 Creating 30-day persistent session...');
    console.log(`   🌎 Proxy: ${account.proxy_host}:${account.proxy_port}`);
    console.log('   🔐 Authentication: Enabled');
    console.log('   ⏱️  TTL: 30 days');

    // Build proxy URL with embedded credentials
    const proxyUrl = `http://${account.proxy_username}:${account.proxy_password}@${account.proxy_host}:${account.proxy_port}`;

    const sessionResponse = await fetch(
      `https://production-sfo.browserless.io/session?token=${BROWSERLESS_TOKEN}&--proxy-server=${encodeURIComponent(proxyUrl)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ttl: 2592000000, // 30 days
          stealth: true,
          headless: true
        })
      }
    );

    if (!sessionResponse.ok) {
      const errorText = await sessionResponse.text();
      console.error('❌ Failed to create persistent session:', errorText);

      // FORENSIC: Log Browserless session creation failure
      await logForensic({
        chatgpt_account_id: accountId,
        chatgpt_account_email: ACCOUNT_EMAIL,
        proxy_used: proxyUsed,
        connection_status: 'Error',
        connection_error_raw: `Browserless session creation failed: ${errorText}`,
        visual_state: 'Unknown',
        operation_type: 'initialization',
        response_time_ms: Date.now() - startTime
      });

      await supabase
        .from('chatgpt_accounts')
        .update({ last_initialization_result: 'failed' })
        .eq('id', accountId);

      return;
    }

    const session = await sessionResponse.json();
    sessionId = session.id;

    console.log('✅ Persistent session created!');
    console.log(`   Session ID: ${session.id}`);
    console.log(`   Valid for: 30 days`);
    console.log(`   Expires: ${new Date(Date.now() + 2592000000).toLocaleString()}`);
    console.log(`   Proxy: ${account.proxy_host}:${account.proxy_port}`);

    // 3. Connect to the persistent session
    console.log('\n🌐 Connecting to persistent session...');
    const connectStartTime = Date.now();

    const browser = await playwright.chromium.connectOverCDP(session.connect);
    const connectDuration = Date.now() - connectStartTime;

    console.log(`✅ Connected to persistent session (took ${connectDuration}ms)`);
    connectionStatus = 'Connected';

    const context = browser.contexts()[0];
    const page = context.pages()[0] || await context.newPage();

    // 4. Inject FULL storage_state (all cookies)
    console.log(`\n🍪 Injecting FULL storage state (${cookieCount} cookies)...`);

    // Filter cookies for chatgpt.com domain
    const chatgptCookies = account.storage_state.cookies.filter(c =>
      c.domain.includes('chatgpt.com') || c.domain.includes('openai.com')
    );

    console.log(`   ChatGPT-related cookies: ${chatgptCookies.length}`);

    await context.addCookies(chatgptCookies);
    console.log(`   ✅ ${chatgptCookies.length} cookies injected`);

    // 5. Navigate to ChatGPT
    console.log('\n🌐 Navigating to ChatGPT...');
    console.log(`   Using proxy ${account.proxy_host}...`);

    await page.goto('https://chatgpt.com', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    await page.waitForTimeout(10000);

    let title = await page.title();
    console.log(`   Page title: "${title}"`);

    if (title.includes('Just a moment')) {
      console.log('⏳ Cloudflare challenge detected...');
      await page.waitForTimeout(30000);
      title = await page.title();
      console.log(`   New title: "${title}"`);
    }

    // 6. Verify login - FORENSIC: Capture visual state
    console.log('\n📊 Checking login status...');
    await page.waitForTimeout(3000);

    const isLoggedOut = await page.locator('button:has-text("Log in")').count() > 0;
    const hasTextarea = await page.locator('#prompt-textarea').count() > 0;
    const hasUserMenu = await page.locator('[data-testid="profile-button"]').count() > 0 ||
                        await page.locator('button[id^="radix-"]').count() > 0;
    const hasCaptcha = title.toLowerCase().includes('captcha') ||
                       await page.locator('[name="cf-turnstile-response"]').count() > 0;
    const currentUrl = page.url();

    // FORENSIC: Determine visual state
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

    visualStateDetails = {
      hasTextarea,
      hasLoginButton: isLoggedOut,
      hasUserMenu,
      hasCaptcha,
      url: currentUrl,
      pageTitle: title
    };

    console.log('\n📊 Login Status:');
    console.log(`   - Logged out: ${isLoggedOut}`);
    console.log(`   - Has user menu: ${hasUserMenu}`);
    console.log(`   - Has textarea: ${hasTextarea}`);
    console.log(`   - Has captcha: ${hasCaptcha}`);
    console.log(`   - URL: ${currentUrl}`);
    console.log(`   - Visual state: ${visualState}`);

    // Take screenshot
    const screenshotName = `initialize-${account.email.replace('@', '-at-')}.png`;
    console.log(`\n📸 Taking screenshot: ${screenshotName}...`);
    await page.screenshot({ path: screenshotName, fullPage: false });
    console.log('✅ Screenshot saved');

    // FORENSIC: Log the initialization attempt with visual state
    await logForensic({
      chatgpt_account_id: accountId,
      chatgpt_account_email: ACCOUNT_EMAIL,
      browserless_session_id: sessionId,
      proxy_used: proxyUsed,
      connection_status: connectionStatus,
      connection_error_raw: connectionErrorRaw,
      visual_state: visualState,
      visual_state_details: visualStateDetails,
      operation_type: 'initialization',
      playwright_cdp_url: session.connect,
      response_time_ms: Date.now() - startTime
    });

    if (isLoggedOut || (!hasTextarea && !hasUserMenu)) {
      console.log('\n❌ Login failed!');

      // FORENSIC: Update account with failed initialization
      await supabase
        .from('chatgpt_accounts')
        .update({
          last_visual_state: visualState,
          last_visual_state_at: new Date().toISOString(),
          last_initialization_result: 'failed'
        })
        .eq('id', accountId);

      await browser.close();
      return;
    }

    console.log('✅ Successfully logged in!');

    // 7. Extract updated cookies
    console.log('\n🍪 Extracting updated cookies...');
    const allCookies = await context.cookies('https://chatgpt.com');
    const sessionToken = allCookies.find(c => c.name === '__Secure-next-auth.session-token');
    const cfClearance = allCookies.find(c => c.name === 'cf_clearance');

    console.log(`   Session token: ${sessionToken ? 'YES' : 'NO'}`);
    console.log(`   cf_clearance: ${cfClearance ? 'YES' : 'NO'}`);

    // 8. Save to database with FORENSIC columns
    console.log('\n💾 Saving session details to database...');

    // FORENSIC: Set cookies_created_at if not already set
    const cookiesCreatedAt = account.cookies_created_at || new Date().toISOString();

    const { error: updateError } = await supabase
      .from('chatgpt_accounts')
      .update({
        browserless_session_id: session.id,
        browserless_connect_url: session.connect,
        browserless_stop_url: session.stop,
        session_created_at: new Date().toISOString(),
        browserless_session_expires_at: new Date(Date.now() + 2592000000).toISOString(),
        cf_clearance: cfClearance ? cfClearance.value : account.cf_clearance,
        session_health_status: 'healthy',
        // FORENSIC: Update forensic columns
        cookies_created_at: cookiesCreatedAt,
        last_visual_state: visualState,
        last_visual_state_at: new Date().toISOString(),
        last_initialization_result: 'success',
        updated_at: new Date().toISOString()
      })
      .eq('email', ACCOUNT_EMAIL);

    if (updateError) {
      console.error('❌ Database update failed:', updateError);
      await browser.close();
      return;
    }

    console.log('✅ Database updated!');

    // 9. Wait 2 minutes for session persistence
    console.log('\n⏳ Waiting 2 minutes for session persistence...');
    await page.waitForTimeout(120000);

    // 10. Close
    await browser.close();
    console.log('\n🔌 Disconnected');

    console.log('\n' + '='.repeat(70));
    console.log('🎉 SUCCESS!');
    console.log('='.repeat(70));
    console.log(`\n   Account: ${account.email}`);
    console.log(`   Session ID: ${session.id}`);
    console.log(`   Proxy: ${account.proxy_host}:${account.proxy_port}`);
    console.log(`   Cookies: ${cookieCount}`);
    console.log(`   Visual State: ${visualState}`);
    console.log(`   Expires: ${new Date(Date.now() + 2592000000).toLocaleString()}`);
    console.log('\n' + '='.repeat(70) + '\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    connectionErrorRaw = error.message;

    // FORENSIC: Log exception
    await logForensic({
      chatgpt_account_id: accountId,
      chatgpt_account_email: ACCOUNT_EMAIL,
      browserless_session_id: sessionId,
      proxy_used: proxyUsed,
      connection_status: 'Error',
      connection_error_raw: error.message,
      visual_state: visualState,
      visual_state_details: visualStateDetails,
      operation_type: 'initialization',
      response_time_ms: Date.now() - startTime
    });

    if (accountId) {
      await supabase
        .from('chatgpt_accounts')
        .update({ last_initialization_result: 'failed' })
        .eq('id', accountId);
    }

    throw error;
  }
}

initializePersistentSession()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Fatal:', err);
    process.exit(1);
  });
