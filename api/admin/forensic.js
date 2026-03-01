/**
 * Vercel Serverless Function: /api/admin/forensic
 *
 * Returns all forensic data globally using the service role key (bypasses RLS).
 * Password-protected via x-forensic-password header.
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-forensic-password');
}

module.exports = async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const password = req.headers['x-forensic-password'];
  if (password !== 'Korneret') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Service role key bypasses all RLS — global visibility
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    // ── Table A: Storage State Health ─────────────────────────────────────────
    const { data: accounts } = await supabase
      .from('chatgpt_accounts')
      .select('email, proxy_host, proxy_port, cookies_created_at, is_eligible, source_pc, status')
      .order('email');

    const storageStateHealth = await Promise.all(
      (accounts || []).map(async (account) => {
        const now = new Date();
        const cookiesCreated = account.cookies_created_at ? new Date(account.cookies_created_at) : null;
        const ageInDays = cookiesCreated
          ? Math.floor((now.getTime() - cookiesCreated.getTime()) / (1000 * 60 * 60 * 24))
          : null;

        const { data: lastSuccessData } = await supabase
          .from('automation_forensics')
          .select('timestamp')
          .eq('chatgpt_account_email', account.email)
          .eq('connection_status', 'Connected')
          .eq('visual_state', 'Logged_In')
          .order('timestamp', { ascending: false })
          .limit(1)
          .single();

        const { data: recentStates } = await supabase
          .from('automation_forensics')
          .select('visual_state')
          .eq('chatgpt_account_email', account.email)
          .order('timestamp', { ascending: false })
          .limit(10);

        const visualStates = (recentStates || []).map((s) => s.visual_state).filter(Boolean);
        const loggedInCount = visualStates.filter((s) => s === 'Logged_In').length;
        const totalStates = visualStates.length;
        let visualStateTrend = 'Unknown';
        if (totalStates > 0) {
          const pct = Math.round((loggedInCount / totalStates) * 100);
          visualStateTrend = `${visualStates[0]} (${pct}%)`;
        }
        let status = 'Active';
        if (totalStates >= 3 && visualStates.slice(0, 3).filter((s) => s !== 'Logged_In').length >= 2) {
          status = 'Failed';
        }

        return {
          extractionPc: account.source_pc || '-',
          chatgptAccount: account.email,
          isEligible: account.is_eligible === true && account.status === 'active',
          proxy: `${account.proxy_host}:${account.proxy_port}`,
          age: ageInDays,
          status,
          lastSuccess: lastSuccessData?.timestamp || null,
          visualStateTrend,
        };
      })
    );

    // ── Table B: Session Matrix ───────────────────────────────────────────────
    const { data: sessionMatrix } = await supabase
      .from('v_forensic_session_attempts_24h')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(100);

    // ── Table C: Citation Trace (global — service role bypasses brand_prompts RLS) ──
    const { data: rawCitations } = await supabase
      .from('prompt_results')
      .select(`
        id, created_at, brand_prompt_id, prompt_text,
        chatgpt_response, chatgpt_citations,
        brand_prompts(id, brands(id, name))
      `)
      .order('created_at', { ascending: false })
      .limit(50);

    const uniquePromptIds = [...new Set((rawCitations || []).map((r) => r.brand_prompt_id))];
    const citationRates = {};
    for (const promptId of uniquePromptIds) {
      const { data: last5 } = await supabase
        .from('prompt_results')
        .select('chatgpt_citations')
        .eq('brand_prompt_id', promptId)
        .order('created_at', { ascending: false })
        .limit(5);
      if (last5 && last5.length > 0) {
        const withCits = last5.filter((r) => r.chatgpt_citations && r.chatgpt_citations.length > 0).length;
        citationRates[promptId] = Math.round((withCits / last5.length) * 100);
      } else {
        citationRates[promptId] = 0;
      }
    }

    const citationTrace = (rawCitations || []).map((row) => ({
      id: row.id,
      timestamp: row.created_at,
      brandName: row.brand_prompts?.brands?.name || 'Unknown',
      promptText: row.prompt_text || '',
      responseLength: (row.chatgpt_response || '').length,
      citationsExtracted: row.chatgpt_citations?.length || 0,
      citationRate: citationRates[row.brand_prompt_id] || 0,
    }));

    // ── Table D: Scheduling Queue (global — service role bypasses brand_prompts RLS) ──
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const today = new Date().toISOString().split('T')[0];

    const { data: schedules } = await supabase
      .from('daily_schedules')
      .select(`
        id, schedule_date, batch_number, execution_time, status, batch_size, prompt_ids,
        chatgpt_accounts(email, proxy_host, proxy_port, last_visual_state, browserless_session_id)
      `)
      .gte('schedule_date', yesterday)
      .lte('schedule_date', today)
      .order('execution_time', { ascending: true });

    const schedulingQueue = await Promise.all(
      (schedules || []).map(async (schedule) => {
        const { data: prompts } = await supabase
          .from('brand_prompts')
          .select('id, improved_prompt, raw_prompt, brand_id, brands(id, name, owner_user_id)')
          .in('id', schedule.prompt_ids || []);

        const userIds = [...new Set((prompts || []).map((p) => p.brands?.owner_user_id).filter(Boolean))];
        let userMap = {};
        if (userIds.length > 0) {
          const { data: users } = await supabase.from('users').select('id, email').in('id', userIds);
          (users || []).forEach((u) => { userMap[u.id] = u.email; });
        }

        return {
          id: schedule.id,
          schedule_date: schedule.schedule_date,
          batch_number: schedule.batch_number,
          execution_time: schedule.execution_time,
          status: schedule.status,
          batch_size: schedule.batch_size,
          account_assigned: schedule.chatgpt_accounts?.email || null,
          proxy_assigned: `${schedule.chatgpt_accounts?.proxy_host}:${schedule.chatgpt_accounts?.proxy_port}`,
          account_last_visual_state: schedule.chatgpt_accounts?.last_visual_state || null,
          session_id_assigned: schedule.chatgpt_accounts?.browserless_session_id || null,
          prompts: (prompts || []).map((p) => ({
            id: p.id,
            prompt_text: p.improved_prompt || p.raw_prompt || '',
            brand_name: p.brands?.name || 'Unknown',
            brand_id: p.brands?.id || p.brand_id,
            user_email: userMap[p.brands?.owner_user_id] || 'Unknown',
          })),
        };
      })
    );

    return res.status(200).json({
      storageStateHealth,
      sessionMatrix: sessionMatrix || [],
      citationTrace,
      schedulingQueue,
    });
  } catch (err) {
    console.error('[forensic] Error:', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
};
