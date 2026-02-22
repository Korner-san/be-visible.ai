/**
 * Vercel Serverless Function: /api/onboarding/create-brand
 *
 * Creates (or finds existing pending) brand for the authenticated user.
 * Uses service role key to bypass all RLS restrictions.
 * Accepts userId from the client (user is already authenticated client-side).
 */

const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { userId, brandName, website } = req.body || {};

  if (!userId) {
    return res.status(400).json({ success: false, error: 'Missing userId' });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error('[create-brand] Missing Supabase env vars:', { hasUrl: !!supabaseUrl, hasKey: !!serviceKey });
    return res.status(500).json({ success: false, error: 'Server configuration error: missing Supabase credentials' });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    // Reuse existing pending brand if one exists for this user
    const { data: pending, error: selectError } = await supabase
      .from('brands')
      .select('id')
      .eq('owner_user_id', userId)
      .eq('is_demo', false)
      .eq('onboarding_completed', false)
      .order('created_at', { ascending: false })
      .limit(1);

    if (selectError) {
      console.error('[create-brand] Select error:', selectError.message);
      return res.status(500).json({ success: false, error: 'DB select failed: ' + selectError.message });
    }

    if (pending && pending.length > 0) {
      const id = pending[0].id;
      if (brandName || website) {
        await supabase
          .from('brands')
          .update({ name: brandName, domain: website })
          .eq('id', id);
      }
      console.log('[create-brand] Reusing existing brand:', id, 'for user:', userId);
      return res.status(200).json({ success: true, brandId: id, existing: true });
    }

    // Create new brand
    const { data: created, error: insertError } = await supabase
      .from('brands')
      .insert({
        owner_user_id: userId,
        name: brandName || 'My Brand',
        domain: website || '',
        onboarding_completed: false,
        first_report_status: null,
        is_demo: false,
      })
      .select('id')
      .single();

    if (insertError || !created) {
      console.error('[create-brand] Insert error:', insertError?.message);
      return res.status(500).json({
        success: false,
        error: 'DB insert failed: ' + (insertError?.message || 'unknown'),
      });
    }

    console.log('[create-brand] Created brand:', created.id, 'for user:', userId);
    return res.status(200).json({ success: true, brandId: created.id, existing: false });

  } catch (err) {
    console.error('[create-brand] Unexpected error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Unexpected error' });
  }
};
