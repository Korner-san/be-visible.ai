require('dotenv').config({ path: '.env.local' });
require('dotenv').config(); // fallback

const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const readline = require('readline');

// ── Config ─────────────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://tzfvtofjcvpddqfgxdtn.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.error('\n❌  SUPABASE_SERVICE_ROLE_KEY not found.');
  console.error('    Create a .env.local file with:');
  console.error('    SUPABASE_SERVICE_ROLE_KEY=your_key_here\n');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, supabaseKey);

// ── Helpers ─────────────────────────────────────────────────────────────────
function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); });
  });
}

async function pickFromList(title, options) {
  console.log('\n' + title);
  options.forEach((opt, i) => console.log(`  [${i}] ${opt}`));
  while (true) {
    const raw = await ask('\nEnter number: ');
    const num = parseInt(raw);
    if (!isNaN(num) && num >= 0 && num < options.length) return num;
    console.log('  ⚠️  Invalid choice — try again.');
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function extractCookies() {
  console.log('\n' + '='.repeat(70));
  console.log('  🍪  ChatGPT Cookie Extractor — be-visible.ai');
  console.log('='.repeat(70) + '\n');

  // ── 1. Fetch existing accounts from DB ─────────────────────────────────
  console.log('🔌  Connecting to database...');
  const { data: accounts, error: fetchErr } = await supabase
    .from('chatgpt_accounts')
    .select('id, email, status, role')
    .order('email', { ascending: true });

  if (fetchErr) {
    console.error('❌  Failed to fetch accounts:', fetchErr.message);
    process.exit(1);
  }

  console.log(`✅  Found ${(accounts || []).length} account(s) in database.\n`);

  // ── 2. Account selection menu ───────────────────────────────────────────
  const existingOptions = (accounts || []).map(
    a => `${a.email}  (${a.role} | ${a.status})`
  );
  const menuOptions = [...existingOptions, '➕  Add a new ChatGPT account'];

  console.log('─'.repeat(70));
  const choice = await pickFromList('Select a ChatGPT account:', menuOptions);
  const isNewFlow = choice === menuOptions.length - 1;

  let targetEmail;
  let proxyHost, proxyPort, proxyUsername, proxyPassword;
  let role;
  let isExistingRow; // true = UPDATE, false = INSERT

  if (!isNewFlow) {
    // ── Existing account: just refresh cookies ───────────────────────────
    const selected = accounts[choice];
    targetEmail = selected.email;
    role = selected.role;
    isExistingRow = true;
    console.log(`\n✅  Will refresh cookies for: ${targetEmail}  (${role})`);

  } else {
    // ── New account flow ─────────────────────────────────────────────────
    console.log('\n' + '─'.repeat(70));
    console.log('  📝  NEW ACCOUNT SETUP');
    console.log('─'.repeat(70));

    targetEmail = await ask('\nChatGPT email address: ');
    if (!targetEmail || !targetEmail.includes('@')) {
      console.error('❌  Invalid email address.');
      process.exit(1);
    }

    // Check if the typed email already exists
    const duplicate = (accounts || []).find(
      a => a.email.toLowerCase() === targetEmail.toLowerCase()
    );

    if (duplicate) {
      console.log(`\n⚠️   This email already exists in the database`);
      console.log(`     (${duplicate.role} | ${duplicate.status})`);
      const overwrite = await ask('Refresh its cookies anyway? (y/n): ');
      if (overwrite.toLowerCase() !== 'y') {
        console.log('\nCancelled.');
        process.exit(0);
      }
      targetEmail = duplicate.email; // normalise casing
      role = duplicate.role;
      isExistingRow = true;
      console.log(`\n✅  Will refresh cookies for: ${targetEmail}  (${role})`);

    } else {
      // Genuinely new — ask proxy + role
      isExistingRow = false;

      console.log('\n🔌  PROXY CONFIGURATION');
      console.log('    Each account needs its own dedicated residential proxy.');
      proxyHost     = await ask('Proxy host (IP address): ');
      proxyPort     = await ask('Proxy port:              ');
      proxyUsername = await ask('Proxy username:          ');
      proxyPassword = await ask('Proxy password:          ');

      console.log('\n🎭  ACCOUNT ROLE');
      const roleChoice = await pickFromList(
        'What will this account be used for?',
        [
          'daily_report  — nightly scheduled batch execution',
          'onboarding    — first report after a new user signs up',
        ]
      );
      role = roleChoice === 0 ? 'daily_report' : 'onboarding';

      console.log(`\n✅  New account: ${targetEmail}  |  role: ${role}`);
    }
  }

  // ── 3. Ask which PC this extraction is running on ───────────────────────
  console.log('\n' + '─'.repeat(70));
  console.log('💻  PC IDENTIFICATION');
  console.log('─'.repeat(70));
  const sourcePc = await ask('Name of this PC (e.g., Koren-Laptop, Koren-Stationary-PC): ');
  if (!sourcePc) {
    console.error('❌  PC name cannot be empty.');
    process.exit(1);
  }

  // ── 4. Launch Edge browser ──────────────────────────────────────────────
  console.log('\n' + '─'.repeat(70));
  console.log('🌐  Launching Microsoft Edge...');
  console.log('─'.repeat(70));

  const browser = await chromium.launch({
    headless: false,
    channel: 'msedge',
    slowMo: 100,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--no-sandbox',
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
    locale: 'en-US',
    timezoneId: 'America/New_York',
  });

  const page = await context.newPage();

  // ── 4. Navigate to ChatGPT ──────────────────────────────────────────────
  console.log('\n📍  Navigating to chatgpt.com...');
  await page.goto('https://chatgpt.com');
  await page.waitForTimeout(3000);

  // ── 5. Instructions + countdown ────────────────────────────────────────
  console.log('\n' + '='.repeat(70));
  console.log('⏳  LOG IN TO CHATGPT NOW');
  console.log('='.repeat(70));
  console.log(`  Account : ${targetEmail}`);
  console.log('');
  console.log('  1. Solve any Cloudflare CAPTCHAs that appear');
  console.log('  2. Click "Log in" and enter your credentials');
  console.log('  3. Complete 2FA / email verification if required');
  console.log('  4. Wait until you see the main ChatGPT chat interface');
  console.log('  ⚠️  DO NOT close the browser manually');
  console.log('='.repeat(70));

  const WAIT_SECS = 90;
  console.log(`\n⏱️   Script continues automatically in ${WAIT_SECS} seconds...\n`);
  for (let left = WAIT_SECS; left > 0; left -= 15) {
    console.log(`   ${left}s remaining...`);
    await page.waitForTimeout(15000);
  }
  console.log('');

  // ── 6. Verify login ─────────────────────────────────────────────────────
  console.log('📊  Verifying login status...');
  const hasTextarea  = await page.locator('#prompt-textarea').count() > 0;
  const hasUserMenu  = await page.locator('[data-testid="profile-button"]').count() > 0;
  const isLoggedOut  = await page.locator('button:has-text("Log in")').count() > 0;

  if (isLoggedOut || (!hasTextarea && !hasUserMenu)) {
    console.error('\n❌  Not logged in! Run the script again and complete login within 90s.');
    await browser.close();
    process.exit(1);
  }
  console.log('✅  Login confirmed!\n');

  // ── 7. Extract storage state ────────────────────────────────────────────
  console.log('🍪  Extracting cookies...');
  const storageState = await context.storageState();
  console.log(`   ${storageState.cookies.length} cookies found across ${storageState.origins.length} origins`);

  // Session token — handle chunked versions (ChatGPT splits large tokens)
  const sessionTokenSingle   = storageState.cookies.find(c => c.name === '__Secure-next-auth.session-token');
  const sessionTokenChunked  = storageState.cookies.filter(c => c.name.startsWith('__Secure-next-auth.session-token.'));
  let sessionTokenValue = null;
  if (sessionTokenSingle) {
    sessionTokenValue = sessionTokenSingle.value;
  } else if (sessionTokenChunked.length > 0) {
    const sorted = [...sessionTokenChunked].sort((a, b) =>
      parseInt(a.name.split('.').pop()) - parseInt(b.name.split('.').pop())
    );
    sessionTokenValue = sorted.map(c => c.value).join('');
    console.log(`   Session token: reassembled from ${sorted.length} chunks (${sessionTokenValue.length} chars)`);
  }

  // CSRF token — handle chunked versions
  const csrfSingle  = storageState.cookies.find(c => c.name === '__Host-next-auth.csrf-token');
  const csrfChunked = storageState.cookies.filter(c => c.name.startsWith('__Host-next-auth.csrf-token.'));
  let csrfTokenValue = null;
  if (csrfSingle) {
    csrfTokenValue = csrfSingle.value;
  } else if (csrfChunked.length > 0) {
    const sorted = [...csrfChunked].sort((a, b) =>
      parseInt(a.name.split('.').pop()) - parseInt(b.name.split('.').pop())
    );
    csrfTokenValue = sorted.map(c => c.value).join('');
  }

  const cfClearance = storageState.cookies.find(c => c.name === 'cf_clearance');
  const oaiSc       = storageState.cookies.find(c => c.name === 'oai-sc');
  const oaiDid      = storageState.cookies.find(c => c.name === 'oai-did');

  console.log('\n   Key cookies:');
  console.log(`   session-token : ${sessionTokenValue ? `✅  (${sessionTokenValue.length} chars)` : '❌  MISSING'}`);
  console.log(`   csrf-token    : ${csrfTokenValue   ? `✅  (${csrfTokenValue.length} chars)`   : '❌  MISSING'}`);
  console.log(`   cf_clearance  : ${cfClearance      ? '✅'                                      : '❌  MISSING'}`);
  console.log(`   oai-sc        : ${oaiSc            ? '✅'                                      : '❌  MISSING'}`);
  console.log(`   oai-did       : ${oaiDid           ? '✅'                                      : '❌  MISSING'}`);

  if (!sessionTokenValue) {
    console.warn('\n⚠️   Session token not found — saving anyway, but login may fail.');
  }

  // ── 8. Save to database ─────────────────────────────────────────────────
  console.log('\n💾  Saving to database...');

  const cookieFields = {
    storage_state:                      storageState,
    cookies_created_at:                 new Date().toISOString(),
    updated_at:                         new Date().toISOString(),
    consecutive_errors:                 0,  // reset error counter on fresh cookies
    source_pc:                          sourcePc,
  };
  if (sessionTokenValue) cookieFields['__Secure-next-auth.session-token'] = sessionTokenValue;
  if (csrfTokenValue)    cookieFields['__Host-next-auth.csrf-token']       = csrfTokenValue;
  if (cfClearance)       cookieFields['cf_clearance']                      = cfClearance.value;
  if (oaiSc)             cookieFields['oai-sc']                            = oaiSc.value;
  if (oaiDid)            cookieFields['oai-did']                           = oaiDid.value;

  if (isExistingRow) {
    // UPDATE — only refresh cookies, leave everything else (role, proxy, is_eligible) intact
    const { error: updateErr } = await supabase
      .from('chatgpt_accounts')
      .update(cookieFields)
      .eq('email', targetEmail);

    if (updateErr) {
      console.error('❌  Update failed:', updateErr.message);
      await browser.close();
      process.exit(1);
    }
    console.log('✅  Cookies refreshed for existing account.');

  } else {
    // INSERT — new account row
    const insertData = {
      email:          targetEmail,
      display_name:   targetEmail.split('@')[0],
      auth_info:      '',
      role,
      status:         'active',
      is_eligible:    false,   // set to true manually after Browserless session is initialized
      proxy_host:     proxyHost     || null,
      proxy_port:     proxyPort     ? parseInt(proxyPort) : null,
      proxy_username: proxyUsername || null,
      proxy_password: proxyPassword || null,
      ...cookieFields,
    };

    const { error: insertErr } = await supabase
      .from('chatgpt_accounts')
      .insert(insertData);

    if (insertErr) {
      console.error('❌  Insert failed:', insertErr.message);
      await browser.close();
      process.exit(1);
    }
    console.log('✅  New account row created.');
    console.log('   ⚠️   is_eligible = false until Browserless session is initialized.');
  }

  // ── 9. Verify ───────────────────────────────────────────────────────────
  const { data: verified } = await supabase
    .from('chatgpt_accounts')
    .select('email, role, status, is_eligible, cookies_created_at')
    .eq('email', targetEmail)
    .single();

  await browser.close();

  // ── 10. Summary ─────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(70));
  console.log('🎉  COOKIE EXTRACTION COMPLETE');
  console.log('='.repeat(70));
  if (verified) {
    console.log(`   Email       : ${verified.email}`);
    console.log(`   Role        : ${verified.role}`);
    console.log(`   Status      : ${verified.status}`);
    console.log(`   is_eligible : ${verified.is_eligible}`);
    console.log(`   Saved at    : ${verified.cookies_created_at}`);
  }
  console.log(`   Cookies     : ${storageState.cookies.length} cookies saved`);

  if (!isExistingRow) {
    console.log('\n   ── NEXT STEPS ────────────────────────────────────────────────');
    console.log('   1. Notify your admin that a new account was added');
    console.log('   2. Admin initializes the Browserless session on Hetzner');
    console.log('   3. Admin sets is_eligible = true in Supabase dashboard');
    console.log('   4. Account will be picked up by the next nightly schedule');
  }
  console.log('='.repeat(70) + '\n');
}

extractCookies().catch(err => {
  console.error('\n❌  Unexpected error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
