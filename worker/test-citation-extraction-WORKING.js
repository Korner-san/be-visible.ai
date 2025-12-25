/**
 * WORKING Citation Extraction Test
 *
 * This test successfully extracts citations by comparing links before/after clicking Sources
 * (ChatGPT no longer uses role="dialog" for the Sources panel)
 */

require('dotenv').config();
const playwright = require('playwright-core');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const CHATGPT_ACCOUNT_EMAIL = 'ididitforkik1000@gmail.com';
const TEST_PROMPT = 'How do AI-driven project management tools help software teams? please search the web and give me the sources that you based your answer from';

async function extractCitations(page) {
  console.log('\n📋 STEP 8: Extracting citations from Sources panel...');

  // Find Sources button
  const sourcesButton = page.locator('button').filter({ hasText: /sources/i }).first();
  const hasSourcesButton = await sourcesButton.count() > 0;

  if (!hasSourcesButton) {
    console.log('⚠️  No Sources button found - response may not have citations');
    return [];
  }

  // Get links BEFORE clicking Sources
  const linksBefore = await page.locator('a[href^="http"]').all();
  const hrefsBefore = new Set();
  for (const link of linksBefore) {
    const href = await link.getAttribute('href');
    if (href) hrefsBefore.add(href);
  }

  console.log('   Clicking Sources button...');
  await sourcesButton.click({ force: true });
  await page.waitForTimeout(2000);
  console.log('✅ Sources panel opened');

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
        citations.push({
          url: url,
          domain: domain
        });
      }
    } catch (e) {
      // Skip invalid URLs
    }
  }

  console.log('✅ Extracted ' + citations.length + ' valid citations\n');
  return citations;
}

async function runTest() {
  console.log('\n' + '='.repeat(80));
  console.log('🧪 WORKING CITATION EXTRACTION TEST');
  console.log('='.repeat(80));
  console.log('Test Prompt: "' + TEST_PROMPT + '"');
  console.log('='.repeat(80) + '\n');

  const startTime = Date.now();

  try {
    // STEP 1: Load ChatGPT account
    console.log('📋 STEP 1: Loading ChatGPT account...');
    const { data: account } = await supabase
      .from('chatgpt_accounts')
      .select('*')
      .eq('email', CHATGPT_ACCOUNT_EMAIL)
      .single();

    console.log('✅ Account loaded:');
    console.log('   Email:', account.email);
    console.log('   Session ID:', account.browserless_session_id);
    console.log('   Proxy:', account.proxy_host + ':' + account.proxy_port);

    // STEP 2: Connect to session
    console.log('\n📋 STEP 2: Connecting to Browserless persistent session...');
    const browser = await playwright.chromium.connectOverCDP(account.browserless_connect_url);
    const context = browser.contexts()[0];
    const page = context.pages()[0] || await context.newPage();
    console.log('✅ Connected to browser session');

    // STEP 3: Navigate to ChatGPT
    console.log('\n📋 STEP 3: Ensuring we\'re on ChatGPT...');
    if (!page.url().includes('chatgpt.com')) {
      await page.goto('https://chatgpt.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(5000);
      console.log('✅ Navigated to ChatGPT');
    } else {
      console.log('✅ Already on ChatGPT');
      await page.waitForTimeout(2000);
    }

    // STEP 4: Verify login
    console.log('\n📋 STEP 4: Verifying login status...');
    const hasTextarea = await page.locator('#prompt-textarea').count() > 0;
    if (!hasTextarea) {
      throw new Error('Not logged in!');
    }
    console.log('✅ Logged in successfully');

    // STEP 5: Send prompt
    console.log('\n📋 STEP 5: Sending test prompt...');
    const textarea = page.locator('#prompt-textarea').first();
    await textarea.fill(TEST_PROMPT);
    await page.locator('button[data-testid="send-button"]').click();
    console.log('✅ Prompt sent');

    // STEP 6: Wait for response
    console.log('\n📋 STEP 6: Waiting for ChatGPT response...');
    await page.waitForTimeout(8000);

    let stable = 0, lastLength = 0;
    for (let i = 0; i < 40; i++) {
      await page.waitForTimeout(1500);
      const messages = await page.locator('[data-message-author-role="assistant"]').all();
      if (messages.length === 0) continue;
      const currentLength = (await messages[messages.length - 1]?.textContent() || '').length;
      if (currentLength === lastLength && currentLength > 0) {
        stable++;
        if (stable >= 3) {
          console.log('✅ Response stable at ' + currentLength + ' characters');
          break;
        }
      } else {
        stable = 0;
      }
      lastLength = currentLength;
    }

    // STEP 7: Extract response text
    console.log('\n📋 STEP 7: Extracting response text...');
    const messages = await page.locator('[data-message-author-role="assistant"]').all();
    const lastMessage = messages[messages.length - 1];
    const responseText = await lastMessage?.textContent() || '';
    console.log('✅ Response extracted: ' + responseText.length + ' characters');

    // STEP 8: Extract citations
    const citations = await extractCitations(page);

    // STEP 9: Display results
    console.log('='.repeat(80));
    console.log('📊 TEST RESULTS');
    console.log('='.repeat(80));
    console.log('Response Length:', responseText.length, 'characters');
    console.log('Citations Found:', citations.length);
    console.log('Execution Time:', Math.round((Date.now() - startTime) / 1000), 'seconds');
    console.log('\n🔗 Citation Details:');
    citations.forEach((cit, i) => {
      console.log('   ' + (i + 1) + '. ' + cit.domain);
      console.log('      ' + cit.url);
    });
    console.log('='.repeat(80) + '\n');

    // STEP 10: Close
    await browser.close();
    console.log('✅ TEST COMPLETED SUCCESSFULLY!\n');

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    process.exit(1);
  }
}

runTest().then(() => process.exit(0));
