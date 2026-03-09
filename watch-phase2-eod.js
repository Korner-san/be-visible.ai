require('dotenv').config({ path: '/root/be-visible.ai/worker/.env' });
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const BRAND_ID = '2bb637fc-3268-4921-b033-e0aeae4202cd';
const REPORT_ID = 'c8c3374f-e0cf-4996-9ba7-ead752bcc8ac';
const POLL_SEC = 20;

async function check() {
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

  const [{ data: brand }, { data: rep }, { data: prompts }] = await Promise.all([
    sb.from('brands').select('first_report_status, onboarding_prompts_sent').eq('id', BRAND_ID).single(),
    sb.from('daily_reports').select('status, is_partial, visibility_score, share_of_voice_data, competitor_metrics').eq('id', REPORT_ID).single(),
    sb.from('brand_prompts').select('onboarding_status, onboarding_wave').eq('brand_id', BRAND_ID),
  ]);

  const w2 = (prompts || []).filter(p => p.onboarding_wave === 2);
  const w2done = w2.filter(p => p.onboarding_status === 'completed').length;
  const w2claimed = w2.filter(p => p.onboarding_status === 'claimed').length;
  const w2pending = w2.filter(p => p.onboarding_status === 'pending').length;

  console.log('\n[' + now + ']');
  console.log('  brand status : ' + brand?.first_report_status);
  console.log('  wave2 prompts: ' + w2done + '/24 done | ' + w2claimed + ' claimed | ' + w2pending + ' pending');
  console.log('  report       : status=' + rep?.status + ' | is_partial=' + rep?.is_partial);
  console.log('  visibility   : ' + rep?.visibility_score);
  console.log('  sov_data     : ' + (rep?.share_of_voice_data ? 'POPULATED' : 'null'));
  console.log('  competitors  : ' + (rep?.competitor_metrics ? 'POPULATED' : 'null'));

  if (brand?.first_report_status === 'succeeded' && rep?.is_partial === false) {
    console.log('\n✅ PHASE 2 EOD COMPLETE — dashboard fully populated!');
    process.exit(0);
  }
}

(async () => {
  console.log('Watching Phase 2 EOD for זוהר פלסט (poll every ' + POLL_SEC + 's)...');
  await check();
  const iv = setInterval(async () => {
    try { await check(); } catch(e) { console.error('Poll error:', e.message); }
  }, POLL_SEC * 1000);
  // Safety exit after 30 min
  setTimeout(() => { console.log('\nTimeout — 30min elapsed'); clearInterval(iv); process.exit(1); }, 30 * 60 * 1000);
})();
