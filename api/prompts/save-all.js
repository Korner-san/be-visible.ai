/**
 * Vercel Serverless Function: /api/prompts/save-all
 *
 * Applies a full diff of ManagePrompts changes in one call:
 *   toDelete  — prompt IDs to hard-delete
 *   toAdd     — new prompts to insert (includes tempId so client can remap)
 *   toUpdate  — prompts whose text / status / category changed
 *
 * Body: { brandId, toDelete, toAdd, toUpdate }
 * Returns: { success, deleted, added: [{tempId, id}], updated }
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

  const { brandId, toDelete = [], toAdd = [], toUpdate = [] } = req.body || {};

  if (!brandId) {
    return res.status(400).json({ success: false, error: 'Missing brandId' });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  let deleted = 0;
  let updated = 0;
  const added = [];

  // ── 1. Delete ─────────────────────────────────────────────────────────────
  if (toDelete.length > 0) {
    // Verify ownership before deleting
    const { data: owned } = await supabase
      .from('brand_prompts')
      .select('id')
      .eq('brand_id', brandId)
      .in('id', toDelete);

    const ownedIds = (owned || []).map(r => r.id);

    if (ownedIds.length > 0) {
      const { error } = await supabase
        .from('brand_prompts')
        .delete()
        .in('id', ownedIds);

      if (error) {
        console.error('[save-all] Delete error:', error.message);
        return res.status(500).json({ success: false, error: 'Delete failed: ' + error.message });
      }
      deleted = ownedIds.length;
    }
  }

  // ── 2. Insert new prompts (respecting active limit) ──────────────────────
  const insertedAsInactive = []; // tempIds auto-downgraded due to active limit
  const skippedDuplicates = [];  // tempIds skipped due to unique constraint

  if (toAdd.length > 0) {
    // Determine how many active slots remain after deletes
    const { data: brandData } = await supabase
      .from('brands')
      .select('owner_user_id')
      .eq('id', brandId)
      .single();

    const { data: userData } = await supabase
      .from('users')
      .select('subscription_plan')
      .eq('id', brandData?.owner_user_id)
      .single();

    const planLimits = { free_trial: 5, basic: 10, advanced: 15, business: 20, corporate: 30 };
    const maxActive = planLimits[userData?.subscription_plan] ?? 30;

    const { count: currentActive } = await supabase
      .from('brand_prompts')
      .select('id', { count: 'exact', head: true })
      .eq('brand_id', brandId)
      .eq('is_active', true);

    let activeSlots = maxActive - (currentActive || 0);

    for (const p of toAdd) {
      const wantsActive = p.isActive !== false;
      let insertActive = false;
      if (wantsActive && activeSlots > 0) {
        insertActive = true;
        activeSlots--;
      } else if (wantsActive) {
        // Would exceed limit — insert as inactive
        insertedAsInactive.push(p.tempId);
      }

      const { data, error } = await supabase
        .from('brand_prompts')
        .insert({
          brand_id: brandId,
          raw_prompt: p.text.trim(),
          improved_prompt: p.text.trim(),
          category: p.category || 'General',
          status: insertActive ? 'active' : 'inactive',
          is_active: insertActive,
        })
        .select('id')
        .single();

      if (error) {
        // Unique constraint violation — prompt already exists, skip silently
        if (error.code === '23505') {
          console.log('[save-all] Skipping duplicate prompt:', p.text.trim().slice(0, 60));
          skippedDuplicates.push(p.tempId);
          // Undo the active slot we reserved for this one
          if (insertActive) activeSlots++;
          continue;
        }
        console.error('[save-all] Insert error:', error.message);
        return res.status(500).json({ success: false, error: 'Insert failed: ' + error.message });
      }

      added.push({ tempId: p.tempId, id: data.id, isActive: insertActive });
    }
  }

  // ── 3. Update changed prompts ─────────────────────────────────────────────
  if (toUpdate.length > 0) {
    // Verify ownership
    const { data: owned } = await supabase
      .from('brand_prompts')
      .select('id')
      .eq('brand_id', brandId)
      .in('id', toUpdate.map(p => p.id));

    const ownedIds = new Set((owned || []).map(r => r.id));

    for (const p of toUpdate) {
      if (!ownedIds.has(p.id)) continue;

      const { error } = await supabase
        .from('brand_prompts')
        .update({
          improved_prompt: p.text.trim(),
          raw_prompt: p.text.trim(),
          category: p.category,
          status: p.isActive ? 'active' : 'inactive',
          is_active: p.isActive,
        })
        .eq('id', p.id);

      if (error) {
        console.error('[save-all] Update error for', p.id, error.message);
        return res.status(500).json({ success: false, error: 'Update failed: ' + error.message });
      }
      updated++;
    }
  }

  console.log(`[save-all] brand=${brandId} deleted=${deleted} added=${added.length} updated=${updated} insertedAsInactive=${insertedAsInactive.length} skippedDuplicates=${skippedDuplicates.length}`);
  return res.status(200).json({ success: true, deleted, added, updated, insertedAsInactive, skippedDuplicates });
};
