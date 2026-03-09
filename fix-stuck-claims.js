require('dotenv').config({ path: '/root/be-visible.ai/worker/.env' });
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const BRAND_ID = '2bb637fc-3268-4921-b033-e0aeae4202cd';
const DAILY_REPORT_ID = 'c8c3374f-e0cf-4996-9ba7-ead752bcc8ac';
const BASE_URL = 'http://localhost:3001';
const SECRET = 'forensic-reinit-secret-2024';

(async () => {
  // 1. Find stuck claimed prompts
  const { data: stuck } = await sb.from('brand_prompts')
    .select('id, onboarding_claimed_account_id, chatgpt_accounts!brand_prompts_onboarding_claimed_account_id_fkey(email)')
    .eq('brand_id', BRAND_ID)
    .eq('onboarding_status', 'claimed');

  console.log('Stuck claimed prompts:', stuck?.length || 0);
  if (!stuck || stuck.length === 0) { console.log('Nothing to fix.'); return; }
  stuck.forEach(p => console.log(' ', p.id, '->', p.chatgpt_accounts?.email || '?'));

  const stuckIds = stuck.map(p => p.id);

  // 2. Mark them as failed (keeps account IDs for reinit check)
  const { error: failErr } = await sb.from('brand_prompts')
    .update({ onboarding_status: 'failed' })
    .in('id', stuckIds);
  if (failErr) { console.error('Failed to mark as failed:', failErr.message); return; }
  console.log('Marked', stuckIds.length, 'prompts as failed (account IDs preserved)');

  // 3. Reset them to pending (account IDs preserved for reinit trigger)
  const { error: resetErr } = await sb.from('brand_prompts')
    .update({
      onboarding_status: 'pending',
      onboarding_claimed_at: null,
    })
    .in('id', stuckIds);
  if (resetErr) { console.error('Failed to reset to pending:', resetErr.message); return; }
  console.log('Reset to pending — account IDs kept (reinit check will fire on next dispatch)');

  // 4. Trigger queue-organizer via chunk-complete
  console.log('\nTriggering queue-organizer...');
  const res = await fetch(`${BASE_URL}/chunk-complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: SECRET, brandId: BRAND_ID, dailyReportId: DAILY_REPORT_ID, wave: 1 }),
  });
  const body = await res.json();
  console.log('chunk-complete response:', res.status, JSON.stringify(body));
})().catch(e => console.error('FATAL:', e.message));
