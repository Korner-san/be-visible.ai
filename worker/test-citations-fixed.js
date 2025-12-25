require('dotenv').config();
const playwright = require('playwright-core');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const TEST_PROMPT = 'How do AI-driven project management tools help software teams? please search the web and give me the sources that you based your answer from';

async function runTest() {
  console.log('\n🧪 FIXED CITATION EXTRACTION TEST\n');

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
          console.log('✅ Response ready:', currentLength, 'chars');
          break;
        }
      } else {
        stable = 0;
      }
      lastLength = currentLength;
    }

    // DEBUG: List ALL buttons
    console.log('\n🔍 DEBUG: Listing all buttons on page...');
    const allButtons = await page.locator('button').all();
    console.log('   Found ' + allButtons.length + ' total buttons');

    for (let i = 0; i < allButtons.length; i++) {
      const text = await allButtons[i].textContent();
      const textClean = (text || '').trim().replace(/\n/g, ' ').substring(0, 50);
      if (textClean) {
        console.log('   Button ' + (i + 1) + ': "' + textClean + '"');
      }
    }

    // Look for Sources button using EXACT production code
    console.log('\n🔍 Looking for Sources button (exact production code)...');
    const sourcesButton = page.locator('button').filter({ hasText: /sources/i }).first();
    const hasSourcesButton = await sourcesButton.count() > 0;

    console.log('   Sources button found: ' + hasSourcesButton);

    if (!hasSourcesButton) {
      console.log('❌ No Sources button found!');
      await page.screenshot({ path: 'no-sources-button.png', fullPage: true });
      console.log('📸 Screenshot saved: no-sources-button.png');
      await browser.close();
      return;
    }

    console.log('✅ Found Sources button - clicking...');
    await sourcesButton.click({ force: true });
    await page.waitForTimeout(2000);

    await page.screenshot({ path: 'after-sources-click.png', fullPage: true });
    console.log('📸 Screenshot saved: after-sources-click.png');

    // Extract citations using EXACT production code
    console.log('\n🔗 Extracting citations (exact production code)...');
    const citationLinks = await page.locator('[role="dialog"] a[href^="http"]').all();
    console.log('   Found ' + citationLinks.length + ' links in dialog');

    // Also try without the dialog constraint
    const allLinks = await page.locator('a[href^="http"]').all();
    console.log('   Found ' + allLinks.length + ' total links on page');

    const citations = [];
    for (const link of citationLinks) {
      try {
        let href = await link.getAttribute('href');
        const text = (await link.textContent() || '').trim();

        if (href && href.includes('chatgpt.com/link')) {
          const url = new URL(href);
          const actualUrl = url.searchParams.get('url');
          if (actualUrl) href = actualUrl;
        }

        if (href) {
          const urlObj = new URL(href);
          const domain = urlObj.hostname;

          if (!domain.includes('chatgpt.com') && text.length > 0) {
            citations.push({ url: href, domain: domain, text: text.substring(0, 80) });
          }
        }
      } catch (e) {}
    }

    console.log('\n✅ Extracted ' + citations.length + ' citations:');
    citations.forEach((c, i) => {
      console.log('   ' + (i + 1) + '. ' + c.domain);
      console.log('      ' + c.url);
    });

    await browser.close();

  } catch (error) {
    console.error('❌ ERROR:', error.message);
  }
}

runTest().then(() => process.exit(0));
