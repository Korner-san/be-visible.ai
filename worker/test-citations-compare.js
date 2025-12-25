require('dotenv').config();
const playwright = require('playwright-core');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const TEST_PROMPT = 'How do AI-driven project management tools help software teams? please search the web and give me the sources that you based your answer from';

async function runTest() {
  console.log('\n🧪 COMPARING LINKS BEFORE/AFTER Sources Click\n');

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

    // Get links BEFORE clicking Sources
    console.log('📊 Getting links BEFORE clicking Sources...');
    const linksBefore = await page.locator('a[href^="http"]').all();
    const hrefsBefore = new Set();
    for (const link of linksBefore) {
      const href = await link.getAttribute('href');
      if (href) hrefsBefore.add(href);
    }
    console.log('   Found ' + hrefsBefore.size + ' unique links before\n');

    // Click Sources button
    console.log('🔍 Clicking Sources button...');
    const sourcesButton = page.locator('button').filter({ hasText: /sources/i }).first();
    await sourcesButton.click({ force: true });
    await page.waitForTimeout(3000); // Wait longer for panel to fully load

    // Get links AFTER clicking Sources
    console.log('📊 Getting links AFTER clicking Sources...');
    const linksAfter = await page.locator('a[href^="http"]').all();
    const hrefsAfter = new Set();
    for (const link of linksAfter) {
      const href = await link.getAttribute('href');
      if (href) hrefsAfter.add(href);
    }
    console.log('   Found ' + hrefsAfter.size + ' unique links after\n');

    // Find NEW links that appeared
    const newLinks = [];
    for (const href of hrefsAfter) {
      if (!hrefsBefore.has(href)) {
        newLinks.push(href);
      }
    }

    console.log('🆕 NEW LINKS that appeared after clicking Sources:');
    console.log('   Total new links: ' + newLinks.length + '\n');

    if (newLinks.length > 0) {
      console.log('   These are likely the citations:\n');
      const citations = [];
      for (let i = 0; i < newLinks.length; i++) {
        let href = newLinks[i];

        // Extract actual URL from ChatGPT redirect
        if (href.includes('chatgpt.com/link')) {
          try {
            const url = new URL(href);
            const actualUrl = url.searchParams.get('url');
            if (actualUrl) href = actualUrl;
          } catch (e) {}
        }

        try {
          const urlObj = new URL(href);
          const domain = urlObj.hostname;

          if (!domain.includes('chatgpt.com')) {
            citations.push({ url: href, domain: domain });
            console.log('   ' + (citations.length) + '. ' + domain);
            console.log('      ' + href);
          }
        } catch (e) {}
      }

      console.log('\n✅ Found ' + citations.length + ' valid citations!\n');
    } else {
      console.log('   ❌ No new links appeared - Sources panel may not have opened\n');
    }

    await browser.close();

  } catch (error) {
    console.error('❌ ERROR:', error.message);
  }
}

runTest().then(() => process.exit(0));
