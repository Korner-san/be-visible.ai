require('dotenv').config({ path: '/root/be-visible.ai/worker/.env' });
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const EMAIL = 'bluecjamie1@gmail.com';
  const { data: authList } = await sb.auth.admin.listUsers({ perPage: 1000 });
  const user = authList.users.find(u => u.email === EMAIL);
  if (!user) { console.log('User not found in auth — nothing to delete'); return; }
  console.log('Found auth user:', user.id);

  const { data: brands } = await sb.from('brands').select('id').eq('owner_user_id', user.id);
  const brandIds = (brands || []).map(b => b.id);
  console.log('Brands:', brandIds.length);

  if (brandIds.length) {
    const { data: reps } = await sb.from('daily_reports').select('id').in('brand_id', brandIds);
    const repIds = (reps || []).map(r => r.id);
    if (repIds.length) {
      await sb.from('prompt_results').delete().in('daily_report_id', repIds);
      console.log('Deleted prompt_results');
    }
    await sb.from('brand_prompts').delete().in('brand_id', brandIds);
    console.log('Deleted brand_prompts');
    await sb.from('daily_reports').delete().in('brand_id', brandIds);
    console.log('Deleted daily_reports');
    await sb.from('daily_schedules').delete().in('brand_id', brandIds);
    console.log('Deleted daily_schedules');
    await sb.from('brand_competitors').delete().in('brand_id', brandIds);
    console.log('Deleted brand_competitors');
    await sb.from('brands').delete().in('id', brandIds);
    console.log('Deleted brands');
  }

  await sb.from('users').delete().eq('id', user.id);
  console.log('Deleted users row');

  const { error } = await sb.auth.admin.deleteUser(user.id);
  if (error) console.error('Auth delete error:', error.message);
  else console.log('Deleted auth user — DONE');
})().catch(e => console.error('FATAL:', e.message));
