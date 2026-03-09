/**
 * Vercel Serverless Function: /api/prompts/delete
 *
 * Permanently deletes one or more prompts from brand_prompts.
 * Validates that all promptIds belong to the given brandId before deleting.
 *
 * Body: { promptIds: string[], brandId: string }
 * Returns: { success, deleted }
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

  const { promptIds, brandId } = req.body || {};

  if (!brandId || !Array.isArray(promptIds) || promptIds.length === 0) {
    return res.status(400).json({ success: false, error: 'Missing brandId or promptIds' });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Security: verify all promptIds actually belong to this brandId
  const { data: owned, error: verifyError } = await supabase
    .from('brand_prompts')
    .select('id')
    .eq('brand_id', brandId)
    .in('id', promptIds);

  if (verifyError) {
    console.error('[prompts/delete] Verify error:', verifyError.message);
    return res.status(500).json({ success: false, error: verifyError.message });
  }

  const ownedIds = (owned || []).map(r => r.id);
  if (ownedIds.length !== promptIds.length) {
    console.warn('[prompts/delete] Some promptIds do not belong to brandId:', brandId);
    return res.status(403).json({ success: false, error: 'One or more prompts do not belong to this brand' });
  }

  const { error: deleteError } = await supabase
    .from('brand_prompts')
    .delete()
    .in('id', ownedIds);

  if (deleteError) {
    console.error('[prompts/delete] Delete error:', deleteError.message);
    return res.status(500).json({ success: false, error: deleteError.message });
  }

  console.log(`[prompts/delete] Deleted ${ownedIds.length} prompt(s) from brand ${brandId}`);
  return res.status(200).json({ success: true, deleted: ownedIds.length });
};
