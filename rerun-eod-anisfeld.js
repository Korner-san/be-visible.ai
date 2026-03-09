require('dotenv').config();
const { processEndOfDay } = require('./end-of-day-processor');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ANISFELD_BRAND_ID = 'a4b358d3-2348-444e-802c-9be129f0699b';
const ANISFELD_REPORT_ID = '07e7725a-dc18-4415-bc85-1869399a89ae';

(async () => {
  console.log('=== Re-running End-of-Day for Anisfeld ===');
  console.log('Brand ID:', ANISFELD_BRAND_ID);
  console.log('Report ID:', ANISFELD_REPORT_ID);

  // Check current state
  const { data: report } = await supabase
    .from('daily_reports')
    .select('*')
    .eq('id', ANISFELD_REPORT_ID)
    .single();
  console.log('Current report status:', report?.status, '| total_prompts:', report?.total_prompts);

  const { count: completedPrompts } = await supabase
    .from('brand_prompts')
    .select('id', { count: 'exact', head: true })
    .eq('brand_id', ANISFELD_BRAND_ID)
    .eq('onboarding_status', 'completed');
  console.log('Completed prompts:', completedPrompts);

  const { data: competitors } = await supabase
    .from('brand_competitors')
    .select('competitor_name')
    .eq('brand_id', ANISFELD_BRAND_ID);
  console.log('Competitors:', (competitors || []).map(c => c.competitor_name).join(', '));

  // Re-run end-of-day processor
  console.log('\nRunning processEndOfDay...');
  try {
    await processEndOfDay(ANISFELD_REPORT_ID);
    console.log('✅ processEndOfDay completed');
  } catch (err) {
    console.error('❌ processEndOfDay error:', err.message);
    process.exit(1);
  }

  // Mark report completed
  await supabase
    .from('daily_reports')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', ANISFELD_REPORT_ID);
  console.log('✅ daily_report marked completed');

  // Mark brand succeeded
  await supabase
    .from('brands')
    .update({ first_report_status: 'succeeded', chatgpt_account_id: null })
    .eq('id', ANISFELD_BRAND_ID);
  console.log('✅ brand marked succeeded');

  // Show results
  const { data: visScores } = await supabase
    .from('visibility_scores')
    .select('score, mention_rate, report_date')
    .eq('brand_id', ANISFELD_BRAND_ID)
    .order('report_date', { ascending: false })
    .limit(3);
  console.log('\nVisibility scores:', JSON.stringify(visScores));

  const { data: reportAfter } = await supabase
    .from('daily_reports')
    .select('status, visibility_score, total_mentions, total_prompts')
    .eq('id', ANISFELD_REPORT_ID)
    .single();
  console.log('Report after:', JSON.stringify(reportAfter));

})().catch(e => { console.error(e.message); process.exit(1); });
