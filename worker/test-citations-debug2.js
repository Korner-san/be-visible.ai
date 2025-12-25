require('dotenv').config();
const playwright = require('playwright-core');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const TEST_PROMPT = 'How do AI-driven project management tools help software teams? please search the web and give me the sources that you based your answer from';

async function runTest() {
  console.log('\n🧪 CITATION DEBUG TEST - Finding the Sources Panel\n');

  try {
    const { data: account } = await supabase
      .from('chatgpt_accounts')
      .select('*')
      .eq('email', 'ididitforkik1000@gmail.com')
      .single();

    console.log('✅ Connecting...');
    const browser = await playwright.chromium.connectOverCDP(account.browserless_connect_url);
    const context = browser.contexts()[0];
    const page = context.pages()[0] || await context.newPage();

    if (!page.url().includes('chatgpt.com')) {
      await page.goto('https://chatgpt.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(5000);
    }

    console.log('✅ Sending prompt...');
    const textarea = page.locator('#prompt-textarea').first();
    await textarea.fill(TEST_PROMPT);
    await page.locator('button[data-testid="send-button"]').click();

    console.log('⏳ Waiting for response...');
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
          console.log('✅ Response ready:', currentLength, 'chars\n');
          break;
        }
      } else {
        stable = 0;
      }
      lastLength = currentLength;
    }

    // Click Sources button
    console.log('🔍 Clicking Sources button...');
    const sourcesButton = page.locator('button').filter({ hasText: /sources/i }).first();
    await sourcesButton.click({ force: true });
    await page.waitForTimeout(2000);

    console.log('✅ Sources panel should be open\n');

    // Try MANY different selectors to find where the citations actually are
    const selectors = [
      '[role="dialog"] a[href^="http"]',
      '[role="dialog"] a',
      'div[role="dialog"] a[href^="http"]',
      '[aria-modal="true"] a[href^="http"]',
      '[class*="modal"] a[href^="http"]',
      '[class*="dialog"] a[href^="http"]',
      '[class*="panel"] a[href^="http"]',
      '[class*="popover"] a[href^="http"]',
      '[class*="source"] a[href^="http"]',
      'aside a[href^="http"]',
      'a[href^="http"]'
    ];

    console.log('🔍 Trying different selectors to find citation links...\n');
    for (const selector of selectors) {
      const links = await page.locator(selector).all();
      console.log('   Selector: ' + selector);
      console.log('   Found: ' + links.length + ' links');

      if (links.length > 0 && links.length < 20) {
        console.log('   Links:');
        for (let i = 0; i < Math.min(links.length, 5); i++) {
          const href = await links[i].getAttribute('href');
          const text = (await links[i].textContent() || '').trim().substring(0, 50);
          console.log('      ' + (i + 1) + '. ' + (href || '').substring(0, 80));
          console.log('         Text: ' + text);
        }
      }
      console.log('');
    }

    await browser.close();

  } catch (error) {
    console.error('❌ ERROR:', error.message);
  }
}

runTest().then(() => process.exit(0));
