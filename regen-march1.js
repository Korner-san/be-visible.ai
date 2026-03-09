require('dotenv').config({ path: '/root/be-visible.ai/worker/.env' });
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const date = '2026-03-01';
  const { data: existing, error } = await s.from('daily_schedules').select('id, status').eq('schedule_date', date);
  if (error) { console.error('Error checking:', error.message); process.exit(1); }
  console.log('Found', (existing||[]).length, 'schedules for', date, '— statuses:', (existing||[]).map(s => s.status).join(', '));
  const running = (existing||[]).filter(s => s.status === 'running');
  if (running.length > 0) { console.error('ABORT: Some batches are already running! Cannot delete.'); process.exit(1); }
  const { error: delErr } = await s.from('daily_schedules').delete().eq('schedule_date', date);
  if (delErr) { console.error('Delete error:', delErr.message); process.exit(1); }
  console.log('Deleted all', (existing||[]).length, 'schedules for', date);
  console.log('Now regenerating...');
})().catch(e => { console.error(e.message); process.exit(1); });
