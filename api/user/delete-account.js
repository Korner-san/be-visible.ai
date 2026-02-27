/**
 * Vercel Serverless Function: /api/user/delete-account
 *
 * Hard-deletes all data for a user account in the correct cascade order,
 * removes the user's prompt IDs from any pending daily_schedules,
 * then deletes the auth.users row so the email can be re-used.
 *
 * Race-condition safety: brand_prompts is deleted BEFORE the schedule cleanup.
 * The cleanup then queries live DB state (which prompt_ids still exist in
 * brand_prompts?) rather than filtering from a pre-fetched set. This means
 * two concurrent account deletions converge to the correct remaining set
 * regardless of interleaving.
 *
 * Requires: Authorization: Bearer <access_token>
 * Body: { userId: string }
 */

const { createClient } = require('@supabase/supabase-js');

const allowedOrigins = [
  process.env.ALLOWED_ORIGIN,
  'http://localhost:3000',
  'http://localhost:5173',
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
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ── 1. Verify token ────────────────────────────────────────────────────────
  const authHeader = req.headers.authorization || '';
  const accessToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!accessToken) {
    return res.status(401).json({ error: 'Missing access token' });
  }

  const { userId } = req.body || {};
  if (!userId) {
    return res.status(400).json({ error: 'Missing userId' });
  }

  // Use service role for all operations (bypasses RLS)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Verify the token belongs to the claimed userId
  const { data: { user: tokenUser }, error: tokenErr } = await supabase.auth.getUser(accessToken);
  if (tokenErr || !tokenUser) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  if (tokenUser.id !== userId) {
    return res.status(403).json({ error: 'Token user does not match userId' });
  }

  try {
    // ── 2. Fetch brand IDs ─────────────────────────────────────────────────
    const { data: brands, error: brandsErr } = await supabase
      .from('brands')
      .select('id')
      .eq('owner_user_id', userId);

    if (brandsErr) throw new Error(`Failed to fetch brands: ${brandsErr.message}`);

    const brandIds = (brands || []).map(b => b.id);

    // ── 3. Fetch prompt IDs (needed to identify which schedules overlap) ───
    let promptIds = [];
    if (brandIds.length > 0) {
      const { data: prompts, error: promptsErr } = await supabase
        .from('brand_prompts')
        .select('id')
        .in('brand_id', brandIds);

      if (promptsErr) throw new Error(`Failed to fetch brand_prompts: ${promptsErr.message}`);
      promptIds = (prompts || []).map(p => p.id);
    }

    // ── 4. Hard-delete user data (brand_prompts deleted FIRST) ────────────
    //
    // brand_prompts is removed before the schedule cleanup below so that the
    // live-DB remaining check is idempotent: our IDs are already gone from
    // brand_prompts by the time we compute what's left in each batch.

    if (brandIds.length > 0) {
      // a. daily_reports (cascades: prompt_results → citation_details,
      //    url_citations; prompt_intent_classifications)
      const { error: drErr } = await supabase
        .from('daily_reports')
        .delete()
        .in('brand_id', brandIds);
      if (drErr) throw new Error(`Failed to delete daily_reports: ${drErr.message}`);

      // b. brand_prompts — deleted BEFORE schedule cleanup (race-condition fix)
      const { error: bpErr } = await supabase
        .from('brand_prompts')
        .delete()
        .in('brand_id', brandIds);
      if (bpErr) throw new Error(`Failed to delete brand_prompts: ${bpErr.message}`);

      // c. brands
      const { error: brErr } = await supabase
        .from('brands')
        .delete()
        .eq('owner_user_id', userId);
      if (brErr) throw new Error(`Failed to delete brands: ${brErr.message}`);
    }

    // d. users (public profile row)
    const { error: usersErr } = await supabase
      .from('users')
      .delete()
      .eq('id', userId);
    if (usersErr) throw new Error(`Failed to delete users row: ${usersErr.message}`);

    // ── 5. Handle pending daily_schedules (today + tomorrow only) ─────────
    //
    // For each batch that contained any of our prompt IDs, we query the live
    // brand_prompts table to compute `remaining`. Since our prompts were
    // deleted in step 4b, they won't appear. If another concurrent deletion
    // has also finished, those IDs are gone too — so both threads converge
    // to the same correct `remaining` set.
    if (promptIds.length > 0) {
      const today = new Date().toISOString().split('T')[0];
      const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

      const { data: schedules, error: schedErr } = await supabase
        .from('daily_schedules')
        .select('id, prompt_ids')
        .eq('status', 'pending')
        .gte('schedule_date', today)
        .lte('schedule_date', tomorrow);

      if (schedErr) throw new Error(`Failed to fetch daily_schedules: ${schedErr.message}`);

      const promptIdSet = new Set(promptIds);
      console.log(`[delete-account] Checking ${(schedules || []).length} pending schedules against ${promptIds.length} prompt IDs`);

      for (const schedule of (schedules || [])) {
        const existing = schedule.prompt_ids || [];
        const overlaps = existing.some(id => promptIdSet.has(id));
        if (!overlaps) continue;

        // Live DB check: which of this batch's prompt_ids still exist in brand_prompts?
        // Our IDs are already deleted (step 4b), so they won't appear here.
        // This makes concurrent account deletions safe — both threads see the
        // same surviving IDs regardless of which ran first.
        const { data: stillExist, error: seErr } = await supabase
          .from('brand_prompts')
          .select('id')
          .in('id', existing);

        if (seErr) throw new Error(`Failed to query surviving prompts for schedule ${schedule.id}: ${seErr.message}`);

        const remaining = (stillExist || []).map(r => r.id);
        console.log(`[delete-account] Schedule ${schedule.id}: ${existing.length} prompts → ${remaining.length} remaining (live DB check)`);

        if (remaining.length === 0) {
          // No prompts left — delete the entire batch
          const { error: delErr } = await supabase
            .from('daily_schedules')
            .delete()
            .eq('id', schedule.id);
          if (delErr) throw new Error(`Failed to delete schedule ${schedule.id}: ${delErr.message}`);
          console.log(`[delete-account] Deleted schedule ${schedule.id} (empty batch)`);
        } else {
          // Shrink the batch — keep only prompts that still exist in brand_prompts
          const { error: updErr } = await supabase
            .from('daily_schedules')
            .update({ prompt_ids: remaining, batch_size: remaining.length })
            .eq('id', schedule.id);
          if (updErr) throw new Error(`Failed to update schedule ${schedule.id}: ${updErr.message}`);
          console.log(`[delete-account] Shrunk schedule ${schedule.id}: ${existing.length} → ${remaining.length} prompts`);
        }
      }
    }

    // ── 6. Delete auth user — allows re-registration with the same email ──
    const { error: authErr } = await supabase.auth.admin.deleteUser(userId);
    if (authErr) throw new Error(`Failed to delete auth user: ${authErr.message}`);

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[delete-account] Error:', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
};
