/**
 * stress-test-monitor.js  —  Two-Phase Onboarding Edition
 *
 * Real-time monitor with:
 *   - Onboarding start time shown on EVERY output
 *   - Cumulative growing event log (full history from DB, no limit)
 *   - Per-agent occupation: CHUNK(Np,wN) | DAILY_BATCH(Np) | REINIT | IDLE
 *   - Inline connection errors / forensic failures per agent
 *   - Per-prompt estimated state (connecting / queued / executing / overdue)
 *
 * Run on Hetzner in /root/be-visible.ai/worker/
 *
 * Usage:
 *   node stress-test-monitor.js                          → single snapshot
 *   node stress-test-monitor.js --watch                  → refresh every 20s
 *   node stress-test-monitor.js --watch 30               → refresh every 30s
 *   node stress-test-monitor.js user@email.com           → pin a target user
 *   node stress-test-monitor.js user@email.com --watch 30
 */

require('dotenv').config({ path: '/root/be-visible.ai/worker/.env' });
const { createClient } = require('@supabase/supabase-js');
const { getSystemCapacity } = require('./account-selector');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const watchIdx = args.indexOf('--watch');
const watchMode = watchIdx !== -1;
const watchInterval = watchMode ? (parseInt(args[watchIdx + 1]) || 20) : null;
const targetEmail = args.find(a => a.includes('@')) || null;

// ── Constants ─────────────────────────────────────────────────────────────────
const TIMEOUT_PER_PROMPT_MS = 2.5 * 60 * 1000;
const CONNECT_TIME_MS       = 90 * 1000; // ~90s to reconnect browserless session

// ── Formatting helpers ────────────────────────────────────────────────────────
function il(dateStr) {
  if (!dateStr) return '--:--:--';
  return new Date(dateStr).toLocaleString('en-IL', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
}
function dur(ms) {
  if (ms == null || isNaN(ms) || ms < 0) return '?';
  const s = Math.round(ms / 1000);
  if (s < 60) return s + 's';
  const m = Math.floor(s / 60), rs = s % 60;
  return m + 'm ' + String(rs).padStart(2, '0') + 's';
}
function ago(dateStr) {
  if (!dateStr) return 'never';
  return dur(Date.now() - new Date(dateStr).getTime()) + ' ago';
}
function minsUntil(dateStr) {
  if (!dateStr) return null;
  const ms = new Date(dateStr).getTime() - Date.now();
  return ms <= 0 ? 0 : Math.round(ms / 60000);
}
function bar(used, total, width) {
  width = width || 20;
  const capped  = Math.min(used, total);
  const filled  = total > 0 ? Math.round((capped / total) * width) : 0;
  const pct     = total > 0 ? Math.round((capped / total) * 100) : 0;
  return '[' + '█'.repeat(filled) + '░'.repeat(width - filled) + '] ' + capped + '/' + total + ' (' + pct + '%)';
}
function sep(label) {
  const line = '─'.repeat(72);
  console.log('\n' + line);
  console.log('  ' + label);
  console.log(line);
}
function statusIcon(s) {
  const icons = {
    queued:         '🟡 queued',
    running:        '🔵 running (Phase 1)',
    phase1_complete:'🟠 phase1_complete → wave-2 running',
    succeeded:      '🟢 succeeded',
    failed:         '🔴 failed',
  };
  return icons[s] || ('❓ ' + s);
}
function shortEmail(email) {
  if (!email) return '?';
  return email.includes('@') ? email.split('@')[0].toUpperCase() : email.substring(0, 12).toUpperCase();
}
function padR(str, len) { return String(str || '').padEnd(len).substring(0, len); }
function padL(str, len) { return String(str || '').padStart(len).substring(0, len); }

// ── Group completed/failed/claimed prompts into dispatch chunks ───────────────
// Prompts in the same chunk share an account and are claimed within a 5-min window.
function groupIntoChunks(prompts) {
  const sorted = [...prompts]
    .filter(p => p.onboarding_claimed_at || p.updated_at)
    .sort((a, b) => {
      const ta = new Date(a.onboarding_claimed_at || a.updated_at).getTime();
      const tb = new Date(b.onboarding_claimed_at || b.updated_at).getTime();
      return ta - tb;
    });

  const chunks = [];
  sorted.forEach(p => {
    const email    = p.chatgpt_accounts?.email || '(unknown)';
    const claimedMs = new Date(p.onboarding_claimed_at || p.updated_at).getTime();
    const existing  = chunks.find(c =>
      c.email === email &&
      claimedMs >= c.startMs &&
      claimedMs - c.lastClaimedMs < 5 * 60 * 1000
    );
    if (existing) {
      existing.prompts.push(p);
      existing.lastClaimedMs = Math.max(existing.lastClaimedMs, claimedMs);
      if (p.updated_at) existing.endMs = Math.max(existing.endMs, new Date(p.updated_at).getTime());
      if (p.onboarding_wave && !existing.waves.includes(p.onboarding_wave)) existing.waves.push(p.onboarding_wave);
    } else {
      chunks.push({
        email,
        short:        shortEmail(email),
        prompts:      [p],
        startMs:      claimedMs,
        lastClaimedMs: claimedMs,
        endMs:        p.updated_at ? new Date(p.updated_at).getTime() : Date.now(),
        waves:        p.onboarding_wave ? [p.onboarding_wave] : [],
      });
    }
  });

  // Mark in-progress chunks (contain at least one claimed prompt with no updated_at finalization)
  chunks.forEach(c => {
    c.inProgress = c.prompts.some(p => p.onboarding_status === 'claimed');
    if (c.inProgress) c.endMs = Date.now();
  });

  return chunks;
}

// ── Build cumulative event log from DB state ──────────────────────────────────
function buildEventLog(brand, allPrompts, forensics) {
  const events = [];

  // 1. Onboarding start
  events.push({
    ms:     new Date(brand.created_at).getTime(),
    time:   brand.created_at,
    agent:  '—',
    type:   'ONBOARDING_START',
    details: '"' + brand.name + '" submitted',
    live:   false,
  });

  // 2. Group ALL prompts (done + failed + claimed) into chunks
  const claimedOrDone = allPrompts.filter(p =>
    p.onboarding_status === 'completed' ||
    p.onboarding_status === 'failed'    ||
    p.onboarding_status === 'claimed'
  );
  const chunks = groupIntoChunks(claimedOrDone);

  chunks.sort((a, b) => a.startMs - b.startMs);

  chunks.forEach(chunk => {
    const waveStr = chunk.waves.length ? 'w' + chunk.waves.sort((a,b)=>a-b).join('+') : '?';

    // CHUNK_START
    events.push({
      ms:      chunk.startMs,
      time:    new Date(chunk.startMs).toISOString(),
      agent:   chunk.short,
      type:    chunk.inProgress ? 'CHUNK_START 🔄' : 'CHUNK_START',
      details: chunk.prompts.length + 'p ' + waveStr + ' claimed',
      live:    chunk.inProgress,
    });

    // Individual prompt completions/failures (sorted by updated_at)
    const finalized = chunk.prompts
      .filter(p => (p.onboarding_status === 'completed' || p.onboarding_status === 'failed') && p.updated_at)
      .sort((a, b) => new Date(a.updated_at) - new Date(b.updated_at));

    finalized.forEach((p, idx) => {
      const prevMs = idx === 0
        ? chunk.startMs
        : new Date(finalized[idx - 1].updated_at).getTime();
      const execMs = new Date(p.updated_at).getTime() - prevMs;
      const isDone = p.onboarding_status === 'completed';
      events.push({
        ms:      new Date(p.updated_at).getTime(),
        time:    p.updated_at,
        agent:   chunk.short,
        type:    isDone ? 'PROMPT_DONE  ✅' : 'PROMPT_FAIL  ❌',
        details: 'w' + (p.onboarding_wave || '?') + ' #' + (idx + 1) + ' in ' + dur(execMs),
        live:    false,
      });
    });

    // CHUNK_COMPLETE (only if fully done)
    if (!chunk.inProgress && finalized.length > 0) {
      const doneCount = finalized.filter(p => p.onboarding_status === 'completed').length;
      events.push({
        ms:      chunk.endMs,
        time:    new Date(chunk.endMs).toISOString(),
        agent:   chunk.short,
        type:    'CHUNK_DONE   ✅',
        details: doneCount + '/' + chunk.prompts.length + ' prompts in ' + dur(chunk.endMs - chunk.startMs),
        live:    false,
      });
    }

    // Live in-progress claimed prompts
    if (chunk.inProgress) {
      const chunkAgeMs   = Date.now() - chunk.startMs;
      const doneInChunk  = finalized.length;
      const claimedNow   = chunk.prompts.filter(p => p.onboarding_status === 'claimed');
      claimedNow.forEach((p, i) => {
        const posInChunk          = doneInChunk + i;
        const promptExpectedStart = CONNECT_TIME_MS + (posInChunk * TIMEOUT_PER_PROMPT_MS);
        const promptExpectedEnd   = promptExpectedStart + TIMEOUT_PER_PROMPT_MS;
        let state;
        if      (chunkAgeMs < CONNECT_TIME_MS)       state = i === 0 ? '⏳ connecting...' : '⌚ queued';
        else if (chunkAgeMs < promptExpectedStart)   state = '⌚ queued';
        else if (chunkAgeMs < promptExpectedEnd)     state = '⚙️  executing';
        else                                          state = '⚠️  overdue';
        const elapsed = chunkAgeMs >= CONNECT_TIME_MS && chunkAgeMs >= promptExpectedStart
          ? '  +' + dur(chunkAgeMs - promptExpectedStart)
          : '';
        events.push({
          ms:      Date.now() + i, // keep ordering stable
          time:    new Date().toISOString(),
          agent:   chunk.short,
          type:    '  > LIVE',
          details: 'w' + (p.onboarding_wave || '?') + ' prompt #' + (posInChunk + 1) + '  ' + state + elapsed,
          live:    true,
        });
      });
    }
  });

  // 3. Forensics events — errors and reinits only (filter noise)
  (forensics || []).forEach(f => {
    const isError  = f.connection_status && f.connection_status !== 'Connected';
    const isReinit = (f.event_type || '').toLowerCase().includes('init') ||
                     (f.notes || '').toLowerCase().includes('reinit') ||
                     (f.notes || '').toLowerCase().includes('session_init');
    const isStateChange = f.event_type && !isReinit;

    if (!isError && !isReinit && !isStateChange) return;

    const typeStr = isReinit
      ? 'REINIT       🔄'
      : isError
      ? 'CONN_ERROR   ⚠️ '
      : 'STATE_CHANGE   ';

    const noteStr = [f.visual_state, f.notes ? f.notes.substring(0, 50) : '']
      .filter(Boolean).join('  ').trim();

    events.push({
      ms:      new Date(f.timestamp).getTime(),
      time:    f.timestamp,
      agent:   shortEmail(f.chatgpt_account_email),
      type:    typeStr,
      details: noteStr || f.connection_status || '',
      live:    false,
    });
  });

  // Sort chronologically
  events.sort((a, b) => a.ms - b.ms);
  return events;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const now   = new Date();
  const today = now.toISOString().split('T')[0];

  // ── Resolve target user (early, needed for header) ─────────────────────────
  let authUser    = null;
  let targetBrand = null;
  let allTargetPrompts = [];
  let targetForensics  = [];

  const resolvedEmail = targetEmail || 'bluecjamie1@gmail.com';
  const { data: authList } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  authUser = (authList?.users || []).find(u => u.email === resolvedEmail);

  if (authUser) {
    const { data: targetBrands } = await supabase.from('brands')
      .select('id, name, first_report_status, onboarding_phase, onboarding_prompts_sent, onboarding_daily_report_id, chatgpt_account_id, chatgpt_accounts(email, id), created_at, updated_at')
      .eq('owner_user_id', authUser.id)
      .eq('is_demo', false)
      .order('created_at', { ascending: false });

    // Prefer in-progress brand; fallback to most recent
    targetBrand = (targetBrands || []).find(b =>
      ['queued','running','phase1_complete'].includes(b.first_report_status)
    ) || (targetBrands || [])[0] || null;

    if (targetBrand) {
      // Fetch ALL prompts for this brand — NO LIMIT — to build full event log
      const [{ data: allPrompts }, { data: forensicsData }] = await Promise.all([
        supabase.from('brand_prompts')
          .select('id, onboarding_claimed_at, updated_at, onboarding_wave, onboarding_status, onboarding_claimed_account_id, chatgpt_accounts!brand_prompts_onboarding_claimed_account_id_fkey(email), raw_prompt, improved_prompt')
          .eq('brand_id', targetBrand.id)
          .order('updated_at', { ascending: true }),
        targetBrand.chatgpt_accounts?.email
          ? supabase.from('automation_forensics')
              .select('timestamp, chatgpt_account_email, connection_status, visual_state, event_type, notes')
              .eq('chatgpt_account_email', targetBrand.chatgpt_accounts.email)
              .gte('timestamp', targetBrand.created_at)
              .order('timestamp', { ascending: true })
          : Promise.resolve({ data: [] }),
      ]);
      allTargetPrompts = allPrompts || [];
      targetForensics  = forensicsData || [];
    }
  }

  // ── Parallel global fetch ──────────────────────────────────────────────────
  const [
    capacityResult,
    { data: schedulesToday },
    { data: claimedPrompts },
    { data: activeBrands },
  ] = await Promise.all([
    getSystemCapacity(),
    supabase.from('daily_schedules')
      .select('id, batch_number, execution_time, status, batch_size, chatgpt_accounts(email, id)')
      .eq('schedule_date', today)
      .order('execution_time'),
    supabase.from('brand_prompts')
      .select('id, onboarding_claimed_at, onboarding_claimed_account_id, onboarding_wave, brand_id, raw_prompt, improved_prompt, brands(name), chatgpt_accounts!brand_prompts_onboarding_claimed_account_id_fkey(email)')
      .eq('onboarding_status', 'claimed'),
    supabase.from('brands')
      .select('id, name, first_report_status, onboarding_phase, onboarding_prompts_sent, onboarding_daily_report_id, chatgpt_account_id, chatgpt_accounts(email), updated_at, created_at')
      .in('first_report_status', ['queued', 'running', 'phase1_complete'])
      .eq('is_demo', false),
  ]);

  const capacity = capacityResult;

  // ══════════════════════════════════════════════════════════════════════════
  //  GLOBAL HEADER
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(72));
  console.log('  ONBOARDING MONITOR  —  ' + il(now) + ' IL  —  ' + today);
  if (watchMode) console.log('  Auto-refresh every ' + watchInterval + 's  |  Ctrl+C to stop');
  console.log('  Target: ' + resolvedEmail);

  if (targetBrand) {
    const elapsedMs = Date.now() - new Date(targetBrand.created_at).getTime();
    const sentCount = targetBrand.onboarding_prompts_sent || 0;
    const completedCount = allTargetPrompts.filter(p => p.onboarding_status === 'completed').length;
    const failedCount    = allTargetPrompts.filter(p => p.onboarding_status === 'failed').length;
    const claimedCount   = allTargetPrompts.filter(p => p.onboarding_status === 'claimed').length;
    console.log('═'.repeat(72));
    console.log('  BRAND:    "' + targetBrand.name + '"');
    console.log('  STARTED:  ' + il(targetBrand.created_at) + ' IL  (' + dur(elapsedMs) + ' total elapsed)');
    console.log('  STATUS:   ' + statusIcon(targetBrand.first_report_status));
    console.log('  PROMPTS:  ✅ ' + completedCount + ' done  |  🔄 ' + claimedCount + ' running  |  ❌ ' + failedCount + ' failed  |  ' + sentCount + '/30 sent');
    if (targetBrand.chatgpt_accounts?.email) {
      console.log('  AGENT:    ' + targetBrand.chatgpt_accounts.email);
    }
  }
  console.log('═'.repeat(72));

  // ══════════════════════════════════════════════════════════════════════════
  //  SECTION 1: ONBOARDING PIPELINE
  // ══════════════════════════════════════════════════════════════════════════
  sep('1. ONBOARDING PIPELINE');

  if (!activeBrands || activeBrands.length === 0) {
    console.log('  No brands in pipeline (queued/running/phase1_complete)');
  }

  for (const brand of (activeBrands || [])) {
    const [
      { count: w1Pending }, { count: w1Claimed }, { count: w1Completed }, { count: w1Failed },
      { count: w2Pending }, { count: w2Claimed }, { count: w2Completed }, { count: w2Failed },
      { data: dailyReport },
    ] = await Promise.all([
      supabase.from('brand_prompts').select('id', { count: 'exact', head: true }).eq('brand_id', brand.id).eq('onboarding_wave', 1).eq('onboarding_status', 'pending'),
      supabase.from('brand_prompts').select('id', { count: 'exact', head: true }).eq('brand_id', brand.id).eq('onboarding_wave', 1).eq('onboarding_status', 'claimed'),
      supabase.from('brand_prompts').select('id', { count: 'exact', head: true }).eq('brand_id', brand.id).eq('onboarding_wave', 1).eq('onboarding_status', 'completed'),
      supabase.from('brand_prompts').select('id', { count: 'exact', head: true }).eq('brand_id', brand.id).eq('onboarding_wave', 1).eq('onboarding_status', 'failed'),
      supabase.from('brand_prompts').select('id', { count: 'exact', head: true }).eq('brand_id', brand.id).eq('onboarding_wave', 2).eq('onboarding_status', 'pending'),
      supabase.from('brand_prompts').select('id', { count: 'exact', head: true }).eq('brand_id', brand.id).eq('onboarding_wave', 2).eq('onboarding_status', 'claimed'),
      supabase.from('brand_prompts').select('id', { count: 'exact', head: true }).eq('brand_id', brand.id).eq('onboarding_wave', 2).eq('onboarding_status', 'completed'),
      supabase.from('brand_prompts').select('id', { count: 'exact', head: true }).eq('brand_id', brand.id).eq('onboarding_wave', 2).eq('onboarding_status', 'failed'),
      brand.onboarding_daily_report_id
        ? supabase.from('daily_reports').select('id, status, is_partial, report_date, visibility_score').eq('id', brand.onboarding_daily_report_id).single()
        : Promise.resolve({ data: null }),
    ]);

    const w1Total   = (w1Pending||0) + (w1Claimed||0) + (w1Completed||0) + (w1Failed||0);
    const w2Total   = (w2Pending||0) + (w2Claimed||0) + (w2Completed||0) + (w2Failed||0);
    const grandDone = (w1Completed||0) + (w2Completed||0);
    const grandTotal = w1Total + w2Total;
    const elapsed   = brand.created_at ? '  started ' + ago(brand.created_at) : '';

    console.log('\n  ▶ ' + brand.name.toUpperCase() + '  [' + statusIcon(brand.first_report_status) + ']  phase=' + (brand.onboarding_phase || 1) + elapsed);
    console.log('    OVERALL : ' + bar(grandDone, grandTotal, 25));

    const w1EODDone = ['phase1_complete','succeeded'].includes(brand.first_report_status);
    const w1EODStr  = w1EODDone ? '  ✅ EOD done' : ((w1Completed||0) >= 6 ? '  ⏳ EOD pending...' : '');
    console.log('    WAVE 1  : ' + bar(w1Completed||0, Math.max(w1Total,6), 18) +
      '  ✅' + (w1Completed||0) + ' done  🔄' + (w1Claimed||0) + '  ⏳' + (w1Pending||0) + '  ❌' + (w1Failed||0) + w1EODStr);

    const w2NotStarted = ['running','queued'].includes(brand.first_report_status);
    const w2EODStr     = brand.first_report_status === 'succeeded' ? '  ✅ EOD done' : ((w2Completed||0) >= 24 ? '  ⏳ EOD pending...' : '');
    console.log('    WAVE 2  : ' + bar(w2Completed||0, Math.max(w2Total,24), 18) +
      '  ✅' + (w2Completed||0) + ' done  🔄' + (w2Claimed||0) + '  ⏳' + (w2Pending||0) + '  ❌' + (w2Failed||0) + w2EODStr +
      (w2NotStarted ? '  (starts after Phase 1 EOD)' : ''));

    if (dailyReport) {
      const score = dailyReport.visibility_score != null ? '  score=' + dailyReport.visibility_score.toFixed(1) : '';
      console.log('    REPORT  : ' + dailyReport.report_date + '  ' + dailyReport.status + '  ' + (dailyReport.is_partial ? '⚠ PARTIAL' : '✅ COMPLETE') + score);
    } else {
      console.log('    REPORT  : ❌ no anchored daily_report yet');
    }
  }

  const { data: recentSucceeded } = await supabase.from('brands')
    .select('id, name, updated_at')
    .eq('first_report_status', 'succeeded')
    .eq('is_demo', false)
    .gte('updated_at', new Date(Date.now() - 30 * 60 * 1000).toISOString())
    .order('updated_at', { ascending: false })
    .limit(3);
  if (recentSucceeded && recentSucceeded.length > 0) {
    console.log('\n  Recently succeeded (last 30 min):');
    for (const b of recentSucceeded) console.log('    🟢 ' + b.name + '  — ' + ago(b.updated_at));
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  SECTION 2: CUMULATIVE EVENT LOG  (grows with each poll)
  // ══════════════════════════════════════════════════════════════════════════
  sep('2. CUMULATIVE EVENT LOG  ← grows with each poll  |  brand: "' + (targetBrand?.name || resolvedEmail) + '"');

  if (!targetBrand) {
    console.log('  (no active/recent brand found for target user — event log unavailable)');
  } else {
    const events = buildEventLog(targetBrand, allTargetPrompts, targetForensics);

    // Column widths
    const W_TIME  = 8;
    const W_AGENT = 16;
    const W_TYPE  = 16;
    const header  = '  ' + padR('TIME', W_TIME) + '  ' + padR('AGENT', W_AGENT) + '  ' + padR('EVENT', W_TYPE) + '  DETAILS';
    console.log(header);
    console.log('  ' + '─'.repeat(70));

    events.forEach(ev => {
      // Strip emoji from type for width calc, then add it back
      const timeStr  = il(ev.time);
      const agentStr = padR(ev.agent, W_AGENT);
      const typeStr  = padR(ev.type, W_TYPE + 3); // +3 for emoji bytes
      const row = '  ' + timeStr + '  ' + agentStr + '  ' + typeStr + '  ' + ev.details;
      if (ev.live) {
        console.log('\x1b[36m' + row + '\x1b[0m'); // cyan for live
      } else {
        console.log(row);
      }
    });

    const totalEvents = events.filter(e => !e.live).length;
    const liveEvents  = events.filter(e => e.live).length;
    console.log('\n  Total: ' + totalEvents + ' historical events' + (liveEvents > 0 ? ' + ' + liveEvents + ' live (cyan)' : ''));
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  SECTION 3: LIVE AGENT STATUS
  // ══════════════════════════════════════════════════════════════════════════
  sep('3. LIVE AGENT STATUS  (occupation + inline errors)');

  const runningBatches = (schedulesToday || []).filter(s => s.status === 'running');
  const pendingBatches = (schedulesToday || []).filter(s => s.status === 'pending');

  // Build claimed map per account
  const claimedByAccount = {};
  (claimedPrompts || []).forEach(p => {
    const email = p.chatgpt_accounts?.email || p.onboarding_claimed_account_id || 'unknown';
    if (!claimedByAccount[email]) claimedByAccount[email] = [];
    claimedByAccount[email].push(p);
  });

  // Get recent forensics for error display (last 30 min per account)
  const recentForensicsAll = {};
  await Promise.all(capacity.accounts.map(async a => {
    const { data: af } = await supabase.from('automation_forensics')
      .select('timestamp, connection_status, visual_state, event_type, notes')
      .eq('chatgpt_account_email', a.email)
      .gte('timestamp', new Date(Date.now() - 30 * 60 * 1000).toISOString())
      .order('timestamp', { ascending: false })
      .limit(5);
    recentForensicsAll[a.email] = af || [];
  }));

  let anyConcurrent = false;

  capacity.accounts.forEach(a => {
    const myBatch     = runningBatches.find(s => s.chatgpt_accounts?.email === a.email);
    const nextBatch   = pendingBatches.find(s => s.chatgpt_accounts?.email === a.email);
    const myPrompts   = claimedByAccount[a.email] || [];
    const myForensics = recentForensicsAll[a.email] || [];
    const errors      = myForensics.filter(f => f.connection_status && f.connection_status !== 'Connected');
    const lastReinit  = myForensics.find(f =>
      (f.event_type || '').toLowerCase().includes('init') ||
      (f.notes || '').toLowerCase().includes('reinit')
    );

    // Determine occupation
    let occupation;
    if (myBatch && myPrompts.length > 0) {
      occupation = 'DAILY_BATCH(' + myBatch.batch_size + 'p) + CHUNK(' + myPrompts.length + 'p,w' + ([...new Set(myPrompts.map(p => p.onboarding_wave))].sort().join('+') || '?') + ')';
      anyConcurrent = true;
    } else if (myBatch) {
      const batchElapsedMs = myBatch.execution_time ? Date.now() - new Date(myBatch.execution_time).getTime() : null;
      occupation = 'DAILY_BATCH(' + myBatch.batch_size + 'p)  running ' + (batchElapsedMs != null ? dur(batchElapsedMs) : '?');
    } else if (myPrompts.length > 0) {
      const waves = [...new Set(myPrompts.map(p => p.onboarding_wave))].sort().join('+');
      const startMs = Math.min(...myPrompts.map(p => new Date(p.onboarding_claimed_at || Date.now()).getTime()));
      const chunkAgeMs = Date.now() - startMs;
      const chunkTimeoutMs = CONNECT_TIME_MS + (myPrompts.length * TIMEOUT_PER_PROMPT_MS);
      const timeoutPct = Math.round((chunkAgeMs / chunkTimeoutMs) * 100);
      const warn = timeoutPct >= 80 ? '  ⚠️ TIMEOUT IMMINENT' : timeoutPct >= 60 ? '  ⚠️ approaching timeout' : '';
      occupation = 'CHUNK(' + myPrompts.length + 'p,w' + (waves||'?') + ')  ' + dur(chunkAgeMs) + ' / ' + dur(chunkTimeoutMs) + ' (' + timeoutPct + '%)' + warn;
    } else if (lastReinit && (Date.now() - new Date(lastReinit.timestamp).getTime()) < 10 * 60 * 1000) {
      occupation = 'REINIT  (session init ' + ago(lastReinit.timestamp) + ')';
    } else {
      occupation = 'IDLE';
    }

    const icon = myPrompts.length > 0 || myBatch ? '🔵' : a.state === 'FREE' ? '✅' : '⏳';
    const nextStr = nextBatch
      ? '  |  next batch #' + nextBatch.batch_number + ' in ' + minsUntil(nextBatch.execution_time) + 'min'
      : '';
    console.log('\n  ' + icon + ' ' + a.email.split('@')[0].toUpperCase() + '  [' + a.state + ']  →  ' + occupation + nextStr);

    // Per-prompt detail for onboarding chunks
    if (myPrompts.length > 0) {
      const sorted = [...myPrompts].sort((a, b) =>
        new Date(a.onboarding_claimed_at || 0) - new Date(b.onboarding_claimed_at || 0)
      );
      const chunkStartMs = new Date(sorted[0].onboarding_claimed_at || Date.now()).getTime();
      const chunkAgeMs   = Date.now() - chunkStartMs;

      sorted.forEach((p, i) => {
        const text     = (p.improved_prompt || p.raw_prompt || '(no text)').substring(0, 60);
        const ellipsis = (p.improved_prompt || p.raw_prompt || '').length > 60 ? '…' : '';
        const wTag     = p.onboarding_wave ? ' [w' + p.onboarding_wave + ']' : '';
        const promptExpectedStart = CONNECT_TIME_MS + (i * TIMEOUT_PER_PROMPT_MS);
        const promptExpectedEnd   = promptExpectedStart + TIMEOUT_PER_PROMPT_MS;
        let state;
        if      (chunkAgeMs < CONNECT_TIME_MS)         state = i === 0 ? '⏳ connecting...' : '⌚ queued';
        else if (chunkAgeMs < promptExpectedStart)     state = '⌚ queued';
        else if (chunkAgeMs < promptExpectedEnd)       state = '⚙️  executing';
        else                                            state = '⚠️  overdue';
        console.log('     #' + (i + 1) + wTag + '  ' + state + '  "' + text + ellipsis + '"');
      });
    }

    // Inline errors (last 30 min)
    if (errors.length > 0) {
      console.log('     🔴 Errors (last 30 min): ' + errors.length);
      errors.slice(0, 3).forEach(f => {
        console.log('       ' + il(f.timestamp) + '  ' + (f.visual_state || '').padEnd(14) + '  ' + (f.notes || f.connection_status || '').substring(0, 55));
      });
    }

    if (!myBatch && myPrompts.length === 0 && errors.length === 0) {
      console.log('     💤 idle — no errors in last 30 min');
    }
  });

  if (anyConcurrent) console.log('\n  ⚡⚡⚡ WARNING: concurrent daily + onboarding detected!');

  // ══════════════════════════════════════════════════════════════════════════
  //  SECTION 4: PHASE GATE CHECKS
  // ══════════════════════════════════════════════════════════════════════════
  sep('4. PHASE GATE CHECKS');

  const { count: wave0Count } = await supabase.from('brand_prompts')
    .select('id', { count: 'exact', head: true })
    .is('onboarding_wave', null)
    .neq('onboarding_status', 'completed');
  console.log('  NULL-wave prompts (should be 0): ' + (wave0Count || 0) + (wave0Count > 0 ? '  ⚠️  wave assignment may not have run!' : '  ✅'));

  for (const brand of (activeBrands || [])) {
    const { count: w1ClaimedCheck } = await supabase.from('brand_prompts').select('id', { count: 'exact', head: true }).eq('brand_id', brand.id).eq('onboarding_wave', 1).eq('onboarding_status', 'claimed');
    const { count: w1TotalCheck }   = await supabase.from('brand_prompts').select('id', { count: 'exact', head: true }).eq('brand_id', brand.id).eq('onboarding_wave', 1);
    if ((w1ClaimedCheck || 0) > 6) {
      console.log('  ⚠️  ' + brand.name + ': wave-1 over-claimed! ' + w1ClaimedCheck + ' (max 6)');
    } else {
      console.log('  Wave-1 "' + brand.name + '": ' + (w1ClaimedCheck||0) + ' claimed / ' + (w1TotalCheck||0) + ' total  ✅');
    }
    if (['running','queued'].includes(brand.first_report_status)) {
      const { count: w2Early } = await supabase.from('brand_prompts').select('id', { count: 'exact', head: true }).eq('brand_id', brand.id).eq('onboarding_wave', 2).eq('onboarding_status', 'claimed');
      if ((w2Early || 0) > 0) {
        console.log('  ⚠️  ' + brand.name + ': wave-2 claimed during Phase 1! (' + w2Early + ') — gate broken');
      } else {
        console.log('  Wave-2 gate "' + brand.name + '" (Phase 1): 0 claimed  ✅ gate holding');
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  SECTION 5: TODAY BATCH OVERVIEW
  // ══════════════════════════════════════════════════════════════════════════
  sep('5. TODAY BATCH OVERVIEW  (' + today + ')');

  const totalDone    = (schedulesToday || []).filter(s => s.status === 'completed').reduce((s, b) => s + b.batch_size, 0);
  const totalRunning = (schedulesToday || []).filter(s => s.status === 'running').reduce((s, b) => s + b.batch_size, 0);
  const totalPending = (schedulesToday || []).filter(s => s.status === 'pending').reduce((s, b) => s + b.batch_size, 0);
  console.log('  Batches: ' + (schedulesToday||[]).length + ' total  |  prompts: ✅' + totalDone + ' done  🔄' + totalRunning + ' running  ⏳' + totalPending + ' pending');

  const next5 = (schedulesToday || []).filter(s => ['pending','running'].includes(s.status)).slice(0, 5);
  if (next5.length > 0) {
    console.log('\n  Next 5:');
    next5.forEach(s => {
      const icon = s.status === 'running' ? '🔄' : '⏳';
      const mins = minsUntil(s.execution_time);
      const agent = (s.chatgpt_accounts?.email || '?').split('@')[0];
      console.log('    ' + icon + ' #' + String(s.batch_number).padStart(2) + '  ' + il(s.execution_time) + '  (' + (mins === 0 ? 'NOW' : 'in ' + mins + 'min') + ')  ' + s.batch_size + 'p  →  ' + agent);
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  SECTION 6: TARGET USER DETAILS
  // ══════════════════════════════════════════════════════════════════════════
  sep('6. TARGET USER: ' + resolvedEmail);

  if (!authUser) {
    console.log('  ❌ Not found in auth.users');
  } else {
    const [{ data: userRow }, { data: brands }] = await Promise.all([
      supabase.from('users').select('id, email, subscription_plan, reports_enabled').eq('id', authUser.id).single(),
      supabase.from('brands')
        .select('id, name, first_report_status, onboarding_completed, onboarding_prompts_sent, onboarding_phase, onboarding_daily_report_id, chatgpt_accounts(email), created_at, updated_at')
        .eq('owner_user_id', authUser.id).eq('is_demo', false).order('created_at', { ascending: false }),
    ]);
    console.log('  Auth confirmed: ' + (authUser.email_confirmed_at ? '✅ ' + il(authUser.email_confirmed_at) : '❌ NOT confirmed'));
    console.log('  Users table   : ' + (userRow ? '✅ plan=' + userRow.subscription_plan + '  reports_enabled=' + userRow.reports_enabled : '❌ NOT IN TABLE'));
    console.log('  Auth ID       : ' + authUser.id);

    for (const b of (brands || [])) {
      const elapsedMs = Date.now() - new Date(b.created_at).getTime();
      console.log('\n  Brand: "' + b.name + '"  id=' + b.id);
      console.log('    status  : ' + statusIcon(b.first_report_status));
      console.log('    started : ' + il(b.created_at) + '  (' + dur(elapsedMs) + ' ago)');
      console.log('    updated : ' + il(b.updated_at));
      console.log('    phase   : ' + (b.onboarding_phase || '(null)') + '  |  sent=' + (b.onboarding_prompts_sent || 0) + '/30');
      console.log('    account : ' + (b.chatgpt_accounts?.email || '(none)'));

      const [
        { count: w1p }, { count: w1cl }, { count: w1co }, { count: w1f },
        { count: w2p }, { count: w2cl }, { count: w2co }, { count: w2f },
      ] = await Promise.all([
        supabase.from('brand_prompts').select('id', { count: 'exact', head: true }).eq('brand_id', b.id).eq('onboarding_wave', 1).eq('onboarding_status', 'pending'),
        supabase.from('brand_prompts').select('id', { count: 'exact', head: true }).eq('brand_id', b.id).eq('onboarding_wave', 1).eq('onboarding_status', 'claimed'),
        supabase.from('brand_prompts').select('id', { count: 'exact', head: true }).eq('brand_id', b.id).eq('onboarding_wave', 1).eq('onboarding_status', 'completed'),
        supabase.from('brand_prompts').select('id', { count: 'exact', head: true }).eq('brand_id', b.id).eq('onboarding_wave', 1).eq('onboarding_status', 'failed'),
        supabase.from('brand_prompts').select('id', { count: 'exact', head: true }).eq('brand_id', b.id).eq('onboarding_wave', 2).eq('onboarding_status', 'pending'),
        supabase.from('brand_prompts').select('id', { count: 'exact', head: true }).eq('brand_id', b.id).eq('onboarding_wave', 2).eq('onboarding_status', 'claimed'),
        supabase.from('brand_prompts').select('id', { count: 'exact', head: true }).eq('brand_id', b.id).eq('onboarding_wave', 2).eq('onboarding_status', 'completed'),
        supabase.from('brand_prompts').select('id', { count: 'exact', head: true }).eq('brand_id', b.id).eq('onboarding_wave', 2).eq('onboarding_status', 'failed'),
      ]);
      console.log('    wave-1  : ✅' + (w1co||0) + ' done  🔄' + (w1cl||0) + ' claimed  ⏳' + (w1p||0) + ' pending  ❌' + (w1f||0) + ' failed');
      console.log('    wave-2  : ✅' + (w2co||0) + ' done  🔄' + (w2cl||0) + ' claimed  ⏳' + (w2p||0) + ' pending  ❌' + (w2f||0) + ' failed');

      if (b.onboarding_daily_report_id) {
        const { data: dr } = await supabase.from('daily_reports').select('id, status, is_partial, report_date, visibility_score').eq('id', b.onboarding_daily_report_id).single();
        if (dr) {
          const score = dr.visibility_score != null ? '  score=' + dr.visibility_score.toFixed(1) : '';
          console.log('    report  : ' + dr.report_date + '  ' + dr.status + '  ' + (dr.is_partial ? '⚠ PARTIAL' : '✅ COMPLETE') + score);
        } else {
          console.log('    report  : ❌ ID set but row missing');
        }
      } else {
        console.log('    report  : (none)');
      }
    }
    if (!brands || brands.length === 0) console.log('  No non-demo brands found');
  }

  console.log('\n' + '═'.repeat(72) + '\n');
}

// ── Entry point ───────────────────────────────────────────────────────────────
if (watchMode) {
  main().catch(e => console.error('ERROR:', e.message));
  setInterval(() => {
    main().catch(e => console.error('ERROR:', e.message));
  }, watchInterval * 1000);
} else {
  main().catch(e => console.error('ERROR:', e.message, e.stack));
}
