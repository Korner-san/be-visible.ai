require('dotenv').config({ path: '/root/be-visible.ai/worker/.env' });
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const ANISFELD_BRAND_ID = 'a4b358d3-2348-444e-802c-9be129f0699b';
const competitors = ['איקאה', 'ACE', 'שופרסל'];

(async () => {
  // Delete any existing (idempotent)
  const { error: delErr } = await s.from('brand_competitors').delete().eq('brand_id', ANISFELD_BRAND_ID);
  if (delErr) { console.error('Delete error:', delErr.message); process.exit(1); }

  // Insert competitors
  const rows = competitors.map((name, idx) => ({
    brand_id: ANISFELD_BRAND_ID,
    competitor_name: name,
    is_active: true,
    display_order: idx + 1,
  }));
  const { data, error } = await s.from('brand_competitors').insert(rows).select();
  if (error) { console.error('Insert error:', error.message); process.exit(1); }
  console.log('Inserted', data.length, 'competitors for Anisfeld:');
  data.forEach(c => console.log(' ', c.display_order, '-', c.competitor_name, '(id:', c.id + ')'));
})().catch(e => console.error(e.message));
