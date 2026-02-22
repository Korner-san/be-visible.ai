/**
 * Vercel Serverless Function: /api/onboarding/complete-final
 *
 * Marks onboarding as complete:
 * - Sets brand.onboarding_completed = true
 * - Sets brand.first_report_status = 'queued'
 * - Marks selected prompts as status = 'selected'
 * - Cleans up any other pending brands for this user
 * Idempotent: safe to call multiple times.
 */

const { createClient } = require('@supabase/supabase-js');

const allowedOrigins = [
  process.env.ALLOWED_ORIGIN,
  'http://localhost:3000',
].filter(Boolean);

function setCorsHeaders(req, res) {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin) || !origin) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

const normalizeDomain = (domain) => {
  if (!domain) return '';
  return domain
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '')
    .toLowerCase();
};

module.exports = async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { brandId, selectedPromptIds = [] } = req.body || {};

  if (!brandId) {
    return res.status(400).json({ success: false, error: 'Missing brandId' });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    // Fetch the brand
    const { data: brand, error: brandError } = await supabase
      .from('brands')
      .select('id, name, domain, onboarding_completed, onboarding_answers, owner_user_id')
      .eq('id', brandId)
      .single();

    if (brandError || !brand) {
      console.error('[complete-final] Brand not found:', brandId, brandError?.message);
      return res.status(404).json({ success: false, error: 'Brand not found' });
    }

    // Idempotency
    if (brand.onboarding_completed) {
      console.log('[complete-final] Already completed:', brandId);
      return res.status(200).json({ success: true, message: 'Already completed', brandId });
    }

    const answers = brand.onboarding_answers || {};
    const normalizedDomain = normalizeDomain(answers.website || brand.domain || '');

    // Mark selected prompts
    if (selectedPromptIds.length > 0) {
      await supabase
        .from('brand_prompts')
        .update({ status: 'selected' })
        .in('id', selectedPromptIds)
        .eq('brand_id', brandId);
    } else {
      // If no specific IDs, mark all improved/inactive prompts as selected
      await supabase
        .from('brand_prompts')
        .update({ status: 'selected' })
        .eq('brand_id', brandId)
        .in('status', ['improved', 'inactive']);
    }

    // Complete the brand — set onboarding_prompts_sent = 0 to signal v2 brand
    const { data: updatedBrand, error: updateError } = await supabase
      .from('brands')
      .update({
        name: answers.brandName || brand.name,
        domain: normalizedDomain || brand.domain,
        onboarding_completed: true,
        first_report_status: 'queued',
        onboarding_prompts_sent: 0,
      })
      .eq('id', brandId)
      .select('id, name, domain, onboarding_completed, first_report_status')
      .single();

    if (updateError || !updatedBrand) {
      console.error('[complete-final] Update error:', updateError?.message);
      return res.status(500).json({ success: false, error: 'Failed to complete onboarding' });
    }

    // Clean up other pending brands for this user
    const { data: otherPending } = await supabase
      .from('brands')
      .select('id')
      .eq('owner_user_id', brand.owner_user_id)
      .eq('is_demo', false)
      .eq('onboarding_completed', false)
      .neq('id', brandId);

    if (otherPending && otherPending.length > 0) {
      await supabase
        .from('brands')
        .delete()
        .in('id', otherPending.map((b) => b.id));
      console.log(`[complete-final] Cleaned up ${otherPending.length} pending brands`);
    }

    console.log('[complete-final] Completed onboarding for brand:', brandId);

    return res.status(200).json({
      success: true,
      brandId: updatedBrand.id,
      brandName: updatedBrand.name,
    });
  } catch (err) {
    console.error('[complete-final] Unexpected error:', err);
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
};
