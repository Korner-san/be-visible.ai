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

    // Mark prompts as active — set status + is_active together for consistency
    if (selectedPromptIds.length > 0) {
      await supabase
        .from('brand_prompts')
        .update({ status: 'active', is_active: true })
        .in('id', selectedPromptIds)
        .eq('brand_id', brandId);
    } else {
      // If no specific IDs, activate all prompts for this brand
      await supabase
        .from('brand_prompts')
        .update({ status: 'active', is_active: true })
        .eq('brand_id', brandId)
        .eq('status', 'inactive');
    }

    // ── Wave assignment: first 6 prompts → wave 1, rest → wave 2 ──────────
    // Fetch all active prompts ordered by creation time
    const { data: allPrompts } = await supabase
      .from('brand_prompts')
      .select('id')
      .eq('brand_id', brandId)
      .eq('status', 'active')
      .order('created_at', { ascending: true });

    if (allPrompts && allPrompts.length > 0) {
      const wave1Ids = allPrompts.slice(0, 6).map(p => p.id);
      const wave2Ids = allPrompts.slice(6).map(p => p.id);

      if (wave1Ids.length > 0) {
        await supabase.from('brand_prompts')
          .update({ onboarding_wave: 1, onboarding_status: 'pending' })
          .in('id', wave1Ids);
      }
      if (wave2Ids.length > 0) {
        await supabase.from('brand_prompts')
          .update({ onboarding_wave: 2, onboarding_status: 'pending' })
          .in('id', wave2Ids);
      }
      console.log(`[complete-final] Wave assignment: ${wave1Ids.length} wave-1, ${wave2Ids.length} wave-2`);
    }

    // ── Pre-create daily_report row (is_partial=true, total_prompts=6) ────
    const today = new Date().toISOString().split('T')[0];
    const { data: newReport } = await supabase
      .from('daily_reports')
      .insert({
        brand_id: brandId,
        report_date: today,
        status: 'pending',
        is_partial: true,
        total_prompts: 6,
      })
      .select('id')
      .single();

    const dailyReportId = newReport?.id || null;
    if (dailyReportId) {
      await supabase.from('brands')
        .update({ onboarding_daily_report_id: dailyReportId })
        .eq('id', brandId);
      console.log('[complete-final] Pre-created daily_report:', dailyReportId);
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

    // Ensure the brand owner has a row in the users table so nightly scheduler can find them
    const { error: upsertUserError } = await supabase
      .from('users')
      .upsert(
        { id: brand.owner_user_id, subscription_plan: 'free_trial', reports_enabled: true },
        { onConflict: 'id', ignoreDuplicates: true }
      );
    if (upsertUserError) {
      console.warn('[complete-final] Could not upsert users row:', upsertUserError.message);
    }

    // ── Save competitors to brand_competitors table ────────────────────────
    const competitors = answers.competitors || [];
    const validCompetitors = competitors.filter(c => c && c.trim());
    if (validCompetitors.length > 0) {
      const competitorRows = validCompetitors.map(name => ({
        brand_id: brandId,
        competitor_name: name.trim(),
        competitor_domain: name.includes('.') ? name.trim().toLowerCase() : null,
      }));
      await supabase.from('brand_competitors').upsert(competitorRows, { onConflict: 'brand_id,competitor_name' });
      console.log(`[complete-final] Saved ${validCompetitors.length} competitors`);
    }

    // Trigger Hetzner queue-organizer (wave-aware dispatcher)
    try {
      const webhookUrl = process.env.WEBHOOK_SERVER_URL || 'http://135.181.203.202:3001/run-queue-organizer';
      const webhookSecret = process.env.WEBHOOK_SECRET || 'your-secret-key-here';
      const webhookRes = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId: updatedBrand.id, secret: webhookSecret }),
      });
      if (webhookRes.ok) {
        console.log('[complete-final] Hetzner webhook triggered for brand:', updatedBrand.id);
      } else {
        console.warn('[complete-final] Webhook returned', webhookRes.status);
      }
    } catch (webhookErr) {
      console.error('[complete-final] Webhook call failed (non-fatal):', webhookErr.message);
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
