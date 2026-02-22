/**
 * Vercel Serverless Function: /api/onboarding/create-brand
 *
 * Creates (or finds existing pending) brand for the authenticated user.
 * Uses service role key to bypass client-side RLS restrictions.
 * Verifies the caller via their Supabase JWT.
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

  // Verify caller via JWT
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Missing Authorization header' });
  }
  const token = authHeader.slice(7);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Validate JWT and get user
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    console.error('[create-brand] Auth error:', authError?.message);
    return res.status(401).json({ success: false, error: 'Invalid or expired session' });
  }

  const { brandName, website } = req.body || {};

  // Check for any existing pending brand for this user
  const { data: pending } = await supabase
    .from('brands')
    .select('id')
    .eq('owner_user_id', user.id)
    .eq('is_demo', false)
    .eq('onboarding_completed', false)
    .order('created_at', { ascending: false })
    .limit(1);

  if (pending && pending.length > 0) {
    const id = pending[0].id;
    if (brandName || website) {
      await supabase
        .from('brands')
        .update({ name: brandName, domain: website })
        .eq('id', id);
    }
    console.log('[create-brand] Reusing existing pending brand:', id);
    return res.status(200).json({ success: true, brandId: id, existing: true });
  }

  // Create new brand
  const { data: created, error: insertError } = await supabase
    .from('brands')
    .insert({
      owner_user_id: user.id,
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
      error: insertError?.message || 'Failed to create brand',
    });
  }

  console.log('[create-brand] Created new brand:', created.id, 'for user:', user.id);
  return res.status(200).json({ success: true, brandId: created.id, existing: false });
};
