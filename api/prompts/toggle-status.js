/**
 * Vercel Serverless Function: /api/prompts/toggle-status
 *
 * Sets brand_prompts.status to 'active' or 'inactive' for given promptIds.
 * Validates all promptIds belong to brandId before updating.
 *
 * Body: { promptIds: string[], brandId: string, active: boolean }
 * Returns: { success, updated }
 */

const { createClient } = require('@supabase/supabase-js');

const allowedOrigins = [
  process.env.ALLOWED_ORIGIN,
  'http://localhost:5173',
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

module.exports = async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const { promptIds, brandId, active } = req.body || {};

  if (!brandId || !Array.isArray(promptIds) || promptIds.length === 0 || typeof active !== 'boolean') {
    return res.status(400).json({ success: false, error: 'Missing brandId, promptIds, or active flag' });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Security: verify all promptIds belong to this brandId
  const { data: owned, error: verifyError } = await supabase
    .from('brand_prompts')
    .select('id')
    .eq('brand_id', brandId)
    .in('id', promptIds);

  if (verifyError) {
    console.error('[prompts/toggle-status] Verify error:', verifyError.message);
    return res.status(500).json({ success: false, error: verifyError.message });
  }

  const ownedIds = (owned || []).map(r => r.id);
  if (ownedIds.length !== promptIds.length) {
    return res.status(403).json({ success: false, error: 'One or more prompts do not belong to this brand' });
  }

  const newStatus = active ? 'active' : 'inactive';

  const { error: updateError } = await supabase
    .from('brand_prompts')
    .update({ status: newStatus, is_active: active })
    .in('id', ownedIds);

  if (updateError) {
    console.error('[prompts/toggle-status] Update error:', updateError.message);
    return res.status(500).json({ success: false, error: updateError.message });
  }

  console.log(`[prompts/toggle-status] Set ${ownedIds.length} prompt(s) to ${newStatus} for brand ${brandId}`);
  return res.status(200).json({ success: true, updated: ownedIds.length, status: newStatus });
};
