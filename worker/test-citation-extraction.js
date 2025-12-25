/**
 * TEST: Citation Extraction from ChatGPT
 *
 * This script mimics the production executor flow but:
 * - Doesn't save anything to the database
 * - Uses a test prompt about AI project management tools
 * - Shows detailed output of each step
 * - Uses the existing persistent session
 */

require('dotenv').config();
const playwright = require('playwright-core');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const CHATGPT_ACCOUNT_EMAIL = 'ididitforkik1000@gmail.com';

// TEST PROMPT
const TEST_PROMPT = 'How do AI-driven project management tools help software teams? please search the web and give me the sources that you based your answer from';

/**
 * Main test function
 */
async function runTest() {
  console.log('\n' + '='.repeat(80));
  console.log('🧪 CITATION EXTRACTION TEST');
  console.log('='.repeat(80));
  console.log('Test Prompt: "' + TEST_PROMPT + '"');
  console.log('='.repeat(80) + '\n');

  const startTime = Date.now();

  try {
    // STEP 1: Load ChatGPT account from database
    console.log('📋 STEP 1: Loading ChatGPT account...');
    const { data: account, error } = await supabase
      .from('chatgpt_accounts')
      .select('*')
      .eq('email', CHATGPT_ACCOUNT_EMAIL)
      .single();

    if (error || !account) {
      throw new Error('Account not found');
    }

    console.log('✅ Account loaded:');
    console.log('   Email:', account.email);
    console.log('   Session ID:', account.browserless_session_id);
    console.log('   Proxy:', `${account.proxy_host}:${account.proxy_port}`);
    console.log('   Last Visual State:', account.last_visual_state);

    // STEP 2: Connect to persistent Browserless session
    console.log('\n📋 STEP 2: Connecting to Browserless persistent session...');

    if (!account.browserless_connect_url) {
      throw new Error('No persistent session URL found - run initialization first');
    }

    console.log('   Connect URL:', account.browserless_connect_url.substring(0, 50) + '...');

    const browser = await playwright.chromium.connectOverCDP(account.browserless_connect_url);
    console.log('✅ Connected to browser session');

    const context = browser.contexts()[0];
    const page = context.pages()[0] || await context.newPage();
    console.log('✅ Got browser page');

    // STEP 3: Navigate to ChatGPT (if needed)
    console.log('\n📋 STEP 3: Ensuring we\'re on ChatGPT...');
    const currentUrl = page.url();
    console.log('   Current URL:', currentUrl);

    if (!currentUrl.includes('chatgpt.com')) {
      console.log('   Navigating to ChatGPT...');
      await page.goto('https://chatgpt.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(5000);
      console.log('✅ Navigated to ChatGPT');
    } else {
      console.log('✅ Already on ChatGPT');
      await page.waitForTimeout(2000);
    }

    // Check for Cloudflare
    let title = await page.title();
    if (title.includes('Just a moment')) {
      console.log('⏳ Waiting for Cloudflare challenge...');
      let attempts = 0;
      while (title.includes('Just a moment') && attempts < 10) {
        await page.waitForTimeout(3000);
        title = await page.title();
        attempts++;
      }
      console.log('✅ Cloudflare passed');
    }

    // STEP 4: Verify login status
    console.log('\n📋 STEP 4: Verifying login status...');
    const isLoggedOut = await page.locator('button:has-text("Log in")').count() > 0;
    const hasTextarea = await page.locator('#prompt-textarea').count() > 0;
    const hasUserMenu = await page.locator('[data-testid="profile-button"]').count() > 0 ||
                        await page.locator('button[id^="radix-"]').count() > 0;
    const hasCaptcha = title.toLowerCase().includes('captcha') ||
                       await page.locator('[name="cf-turnstile-response"]').count() > 0;

    console.log('   Has login button:', isLoggedOut);
    console.log('   Has textarea:', hasTextarea);
    console.log('   Has user menu:', hasUserMenu);
    console.log('   Has captcha:', hasCaptcha);

    if (isLoggedOut || !hasTextarea) {
      throw new Error('❌ Not logged in! Session needs re-initialization');
    }

    console.log('✅ Logged in successfully');

    // STEP 5: Send the test prompt
    console.log('\n📋 STEP 5: Sending test prompt...');
    console.log('   Prompt: "' + TEST_PROMPT.substring(0, 80) + '..."');

    const textarea = page.locator('#prompt-textarea').first();
    await textarea.waitFor({ state: 'visible', timeout: 5000 });
    await textarea.fill(TEST_PROMPT);
    console.log('✅ Prompt typed into textarea');

    await page.locator('button[data-testid="send-button"]').click();
    console.log('✅ Prompt sent');

    // STEP 6: Wait for response to complete
    console.log('\n📋 STEP 6: Waiting for ChatGPT response...');
    console.log('   Initial wait: 5 seconds');
    await page.waitForTimeout(5000);

    // Wait for response to stabilize (same logic as production)
    let stable = 0;
    let lastLength = 0;
    let checkCount = 0;

    console.log('   Monitoring response stability...');
    for (let i = 0; i < 40; i++) {
      await page.waitForTimeout(1500);
      checkCount++;

      const messages = await page.locator('[data-message-author-role="assistant"]').all();

      if (messages.length === 0) {
        process.stdout.write('.');
        continue;
      }

      const currentLength = (await messages[messages.length - 1]?.textContent() || '').length;

      if (currentLength === lastLength && currentLength > 0) {
        stable++;
        process.stdout.write('✓');
        if (stable >= 3) {
          console.log('\n✅ Response stable at ' + currentLength + ' characters (after ' + checkCount + ' checks)');
          break;
        }
      } else {
        stable = 0;
        process.stdout.write('.');
      }
      lastLength = currentLength;
    }

    // STEP 7: Extract response text
    console.log('\n📋 STEP 7: Extracting response text...');
    const messages = await page.locator('[data-message-author-role="assistant"]').all();
    const lastMessage = messages[messages.length - 1];
    const responseText = await lastMessage?.textContent() || '';

    console.log('✅ Response extracted:');
    console.log('   Length:', responseText.length, 'characters');
    console.log('   Preview:', responseText.substring(0, 200) + '...\n');

    // STEP 8: Extract citations
    console.log('📋 STEP 8: Extracting citations from Sources panel...');

    const sourcesButton = page.locator('button').filter({ hasText: /sources/i }).first();
    const hasSourcesButton = await sourcesButton.count() > 0;

    if (!hasSourcesButton) {
      console.log('⚠️  No Sources button found - response may not have citations');
      console.log('\n' + '='.repeat(80));
      console.log('📊 TEST RESULTS');
      console.log('='.repeat(80));
      console.log('Response Length:', responseText.length, 'characters');
      console.log('Citations Found: 0');
      console.log('Execution Time:', Math.round((Date.now() - startTime) / 1000), 'seconds');
      console.log('='.repeat(80) + '\n');

      await browser.close();
      return;
    }

    console.log('   Clicking Sources button...');
    await sourcesButton.click({ force: true });
    await page.waitForTimeout(1000);
    console.log('✅ Sources panel opened');

    const citationLinks = await page.locator('[role="dialog"] a[href^="http"]').all();
    console.log('   Found', citationLinks.length, 'links in Sources panel');

    const citations = [];
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
            citations.push({
              url: href,
              domain: domain,
              linkText: text.substring(0, 80)
            });
          }
        }
      } catch (e) {
        // Skip invalid links
      }
    }

    console.log('✅ Extracted', citations.length, 'valid citations\n');

    // Close the Sources panel
    const closeButton = page.locator('[role="dialog"] button[aria-label="Close"]').first();
    if (await closeButton.count() > 0) {
      await closeButton.click();
      await page.waitForTimeout(500);
      console.log('✅ Sources panel closed');
    }

    // STEP 9: Display results
    console.log('\n' + '='.repeat(80));
    console.log('📊 TEST RESULTS');
    console.log('='.repeat(80));
    console.log('Response Length:', responseText.length, 'characters');
    console.log('Citations Found:', citations.length);
    console.log('Execution Time:', Math.round((Date.now() - startTime) / 1000), 'seconds');
    console.log('\n🔗 Citation Details:');
    citations.forEach((cit, i) => {
      console.log(`   ${i + 1}. ${cit.domain}`);
      console.log(`      URL: ${cit.url}`);
      console.log(`      Text: ${cit.linkText}`);
    });
    console.log('='.repeat(80) + '\n');

    // STEP 10: Close browser
    console.log('🔌 Disconnecting from session...');
    await browser.close();
    console.log('✅ Disconnected\n');

    console.log('✅ TEST COMPLETED SUCCESSFULLY!\n');

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Run the test
runTest().then(() => {
  console.log('👋 Test script finished\n');
  process.exit(0);
});
