const { CONFIG } = require('./config');

async function getActiveOnboardingBrand(supabase) {
  const { data, error } = await supabase
    .from('brands')
    .select('id, name, owner_user_id, first_report_status, onboarding_phase, onboarding_daily_report_id, onboarding_prompts_sent, created_at')
    .in('first_report_status', ['queued', 'running', 'phase1_complete'])
    .eq('onboarding_completed', true)
    .eq('is_demo', false)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch active onboarding brand: ${error.message}`);
  return data || null;
}

async function countPromptsByWave(supabase, brandId, wave) {
  const { count, error } = await supabase
    .from('brand_prompts')
    .select('id', { count: 'exact', head: true })
    .eq('brand_id', brandId)
    .eq('onboarding_wave', wave)
    .in('onboarding_status', ['pending', 'failed']);

  if (error) throw new Error(`Failed to count prompts for wave ${wave}: ${error.message}`);
  return count || 0;
}

async function getClaimablePromptIds(supabase, brandId, wave, limit = CONFIG.promptsPerBatch) {
  let query = supabase
    .from('brand_prompts')
    .select('id')
    .eq('brand_id', brandId)
    .eq('onboarding_wave', wave)
    .in('onboarding_status', ['pending', 'failed'])
    .order('created_at', { ascending: true })
    .limit(limit);

  if (wave === 1) {
    query = query.eq('status', 'active');
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch claimable prompts: ${error.message}`);
  return (data || []).map((p) => p.id);
}

async function getExistingOnboardingSchedules(supabase, brandId, wave) {
  const { data, error } = await supabase
    .from('daily_schedules')
    .select('id, status, prompt_ids, batch_number, execution_time, chatgpt_account_id')
    .eq('brand_id', brandId)
    .eq('batch_type', 'onboarding')
    .eq('onboarding_wave', wave)
    .in('status', ['pending', 'running', 'completed']);

  if (error) {
    // onboarding_wave may not exist yet in the current DB. The architecture requires it,
    // but dry-run can still continue with a fallback query.
    if (error.code !== '42703') throw new Error(`Failed to fetch onboarding schedules: ${error.message}`);

    const fallback = await supabase
      .from('daily_schedules')
      .select('id, status, prompt_ids, batch_number, execution_time, chatgpt_account_id')
      .eq('brand_id', brandId)
      .eq('batch_type', 'onboarding')
      .in('status', ['pending', 'running', 'completed']);
    if (fallback.error) throw new Error(`Failed to fetch onboarding schedules: ${fallback.error.message}`);
    return fallback.data || [];
  }

  return data || [];
}

module.exports = {
  getActiveOnboardingBrand,
  countPromptsByWave,
  getClaimablePromptIds,
  getExistingOnboardingSchedules,
};
