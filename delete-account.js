#!/usr/bin/env node
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const TARGET_EMAIL = 'bluecjamie1@gmail.com';

async function deleteAccount() {
  console.log('Deleting account:', TARGET_EMAIL);

  const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const user = users.find(u => u.email === TARGET_EMAIL);
  if (!user) { console.log('User not found in auth'); return; }
  console.log('Auth user ID:', user.id);

  const { data: brands } = await supabase.from('brands').select('id').eq('owner_user_id', user.id);
  const brandIds = (brands || []).map(b => b.id);
  console.log('Brands:', brandIds);

  for (const brandId of brandIds) {
    await supabase.from('brand_prompts').delete().eq('brand_id', brandId);
    await supabase.from('daily_reports').delete().eq('brand_id', brandId);
    await supabase.from('brand_competitors').delete().eq('brand_id', brandId);
    console.log('Deleted data for brand:', brandId);
  }

  if (brandIds.length) await supabase.from('brands').delete().in('id', brandIds);
  await supabase.from('users').delete().eq('id', user.id);
  await supabase.auth.admin.deleteUser(user.id);
  console.log('Done — account fully deleted.');
}

deleteAccount().catch(console.error);
