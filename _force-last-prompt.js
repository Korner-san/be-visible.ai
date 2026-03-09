require('dotenv').config({ path: '/root/be-visible.ai/worker/.env' });
const { createClient } = require('@supabase/supabase-js');
const { spawn } = require('child_process');
const path = require('path');

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const brandId = '3d4272b1-cccc-4f16-abfc-e66c8ff4a7ad';
const chunkScript = path.join('/root/be-visible.ai/worker', 'run-onboarding-chunk.js');
const today = new Date().toISOString().split('T')[0];

async function run() {
  // Reset any stuck/failed/claimed wave-1 prompts
  await sb.from('brand_prompts')
    .update({ onboarding_status: 'failed', onboarding_claimed_at: null, onboarding_claimed_account_id: null })
    .eq('brand_id', brandId)
    .in('onboarding_status', ['failed','claimed'])
    .eq('onboarding_wave', 1);
  console.log('Reset stuck prompts OK');

  // Get bluecjamie1 account
  const { data: acct } = await sb.from('chatgpt_accounts').select('id,email').eq('email','bluecjamie1@gmail.com').single();
  if (!acct) { console.log('Account not found'); return; }
  console.log('Using account:', acct.email, acct.id);

  // Get the brand details
  const { data: brand } = await sb.from('brands')
    .select('id, owner_user_id, onboarding_daily_report_id')
    .eq('id', brandId).single();
  if (!brand) { console.log('Brand not found'); return; }

  // Get the failed prompt with full data
  const { data: prompts } = await sb.from('brand_prompts')
    .select('id, raw_prompt, improved_prompt')
    .eq('brand_id', brandId)
    .eq('onboarding_wave', 1)
    .eq('onboarding_status', 'failed')
    .limit(1);
  if (!prompts || prompts.length === 0) { console.log('No failed prompts found'); return; }

  const prompt = prompts[0];
  console.log('Prompt:', prompt.id, (prompt.improved_prompt || prompt.raw_prompt || '').substring(0, 60));

  // Claim the prompt for bluecjamie1
  await sb.from('brand_prompts').update({
    onboarding_status: 'claimed',
    onboarding_claimed_account_id: acct.id,
    onboarding_claimed_at: new Date().toISOString(),
  }).eq('id', prompt.id);
  console.log('Claimed OK. Spawning chunk worker...');

  const claimedPrompts = [{ id: prompt.id, raw_prompt: prompt.raw_prompt, improved_prompt: prompt.improved_prompt }];

  const child = spawn('node', [chunkScript], {
    stdio: 'inherit',
    cwd: '/root/be-visible.ai/worker',
    env: {
      ...process.env,
      BRAND_ID: brandId,
      DAILY_REPORT_ID: brand.onboarding_daily_report_id || '',
      REPORT_DATE: today,
      OWNER_USER_ID: brand.owner_user_id || '',
      CHATGPT_ACCOUNT_EMAIL: acct.email,
      CHATGPT_ACCOUNT_ID: acct.id,
      PROMPTS_JSON: JSON.stringify(claimedPrompts),
      TOTAL_PROMPTS: '30',
      ONBOARDING_WAVE: '1',
    },
  });

  child.on('exit', (code) => {
    console.log('Chunk worker exited with code:', code);
    process.exit(code || 0);
  });
}

run().catch(e => { console.error(e); process.exit(1); });
