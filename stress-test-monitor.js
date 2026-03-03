/**
 * stress-test-monitor.js  —  Two-Phase Onboarding Edition
 *
 * Real-time monitor for the event-driven two-phase onboarding system.
 * Shows: wave 1/2 progress, Phase 1/2 EOD status, anchored daily_report,
 * live claimed prompts, concurrent safety, timing analysis, target user.
 *
 * Run on Hetzner in /root/be-visible.ai/worker/
 *
 * Usage:
 *   node stress-test-monitor.js                        → single snapshot
 *   node stress-test-monitor.js --watch                → refresh every 20s
 *   node stress-test-monitor.js --watch 10             → refresh every 10s
 *   node stress-test-monitor.js user@email.com         → pin a target user
 *   node stress-test-monitor.js user@email.com --watch 15
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
const targetEmail = args.find(a => a.includes('@')) || 'bluecjamie1@gmail.com';

// ── Formatting helpers ────────────────────────────────────────────────────────
function il(dateStr) {
  if (!dateStr) return '--:--:--';
  return new Date(dateStr).toLocaleString('en-IL', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
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
function bar(used, total, width = 20) {
  const capped = Math.min(used, total);
  const filled = total > 0 ? Math.round((capped / total) * width) : 0;
  const pct = total > 0 ? Math.round((capped / total) * 100) : 0;
  return '[' + '█'.repeat(filled) + '░'.repeat(width - filled) + '] ' + capped + '/' + total + ' (' + pct + '%)';
}
function sep(label) {
  const line = '─'.repeat(70);
  console.log('\n' + line);
  console.log('  ' + label);
  console.log(line);
}
function statusIcon(s) {
  const icons = {
    queued: '🟡 queued',
    running: '🔵 running (Phase 1)',
    phase1_complete: '🟠 phase1_complete (wave 2 not yet enabled)',
    succeeded: '🟢 succeeded',
    failed: '🔴 failed',
  };
  return icons[s] || ('❓ ' + s);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const now = new Date();
  const today = now.toISOString().split('T')[0];

  console.log('\n' + '═'.repeat(70));
  console.log('  TWO-PHASE ONBOARDING MONITOR  —  ' + il(now) + ' IL  —  ' + today);
  if (watchMode) console.log('  Auto-refresh every ' + watchInterval + 's  |  target: ' + targetEmail + '  |  Ctrl+C to stop');
  console.log('═'.repeat(70));

  // ── Parallel fetch ────────────────────────────────────────────────────────
  const [
    capacityResult,
    { data: schedulesToday },
    { data: claimedPrompts },
    { data: recentCompleted },
    { data: recentForensics },
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
    // Include account email for timeline grouping; fetch last 60 for full history
    supabase.from('brand_prompts')
      .select('id, onboarding_claimed_at, updated_at, brand_id, onboarding_wave, onboarding_claimed_account_id, brands(name), chatgpt_accounts!brand_prompts_onboarding_claimed_account_id_fkey(email)')
      .eq('onboarding_status', 'completed')
      .not('onboarding_claimed_at', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(60),
    supabase.from('automation_forensics')
      .select('timestamp, chatgpt_account_email, connection_status, visual_state, event_type, notes')
      .gte('timestamp', new Date(Date.now() - 60 * 60 * 1000).toISOString())
      .order('timestamp', { ascending: false })
      .limit(80),
    supabase.from('brands')
      .select('id, name, first_report_status, onboarding_phase, onboarding_prompts_sent, onboarding_daily_report_id, chatgpt_account_id, chatgpt_accounts(email), updated_at, created_at')
      .in('first_report_status', ['queued', 'running', 'phase1_complete'])
      .eq('is_demo', false),
  ]);

  const capacity = capacityResult;

  // ── SECTION 1: ONBOARDING PIPELINE ──────────────────────────────────────
  sep('1. ONBOARDING PIPELINE  (wave 1 = 6 prompts → Phase 1 EOD → phase1_complete → wave 2 = 24 → Phase 2 EOD → succeeded)');

  if (!activeBrands || activeBrands.length === 0) {
    console.log('  No brands in the onboarding pipeline right now');
    console.log('  (queued / running / phase1_complete  — will appear here when active)');
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
        ? supabase.from('daily_reports').select('id, status, is_partial, report_date, visibility_score, completed_prompts_chatgpt, total_prompts').eq('id', brand.onboarding_daily_report_id).single()
        : Promise.resolve({ data: null }),
    ]);

    const w1Total = (w1Pending||0) + (w1Claimed||0) + (w1Completed||0) + (w1Failed||0);
    const w2Total = (w2Pending||0) + (w2Claimed||0) + (w2Completed||0) + (w2Failed||0);
    const grandTotal = w1Total + w2Total;
    const grandDone = (w1Completed||0) + (w2Completed||0);
    const timeSinceCreated = brand.created_at
      ? dur(Date.now() - new Date(brand.created_at).getTime()) + ' since onboarding submitted'
      : '';

    console.log('\n  ▶ ' + brand.name.toUpperCase() + '  [' + statusIcon(brand.first_report_status) + ']  phase=' + (brand.onboarding_phase || 1));
    if (timeSinceCreated) console.log('    ' + timeSinceCreated);
    console.log('\n    OVERALL : ' + bar(grandDone, grandTotal, 25));

    const w1Active = (w1Claimed||0) > 0 ? ' 🔄' + (w1Claimed||0) + ' running' : '';
    const w1PendStr = (w1Pending||0) > 0 ? ' ⏳' + (w1Pending||0) + ' pending' : '';
    const w1FailStr = (w1Failed||0) > 0 ? ' ❌' + (w1Failed||0) + ' failed' : '';
    const w1EODDone = brand.first_report_status === 'phase1_complete' || brand.first_report_status === 'succeeded';
    const w1EODStr = w1EODDone ? '  ✅ Phase 1 EOD done' : ((w1Completed||0) >= 6 ? '  ⏳ Phase 1 EOD running...' : '');
    console.log('    WAVE 1  : ' + bar(w1Completed||0, Math.max(w1Total, 6), 18) +
      '  ✅' + (w1Completed||0) + ' done' + w1Active + w1PendStr + w1FailStr + w1EODStr);

    const w2Active = (w2Claimed||0) > 0 ? ' 🔄' + (w2Claimed||0) + ' running' : '';
    const w2PendStr = (w2Pending||0) > 0 ? ' ⏳' + (w2Pending||0) + ' pending' : '';
    const w2FailStr = (w2Failed||0) > 0 ? ' ❌' + (w2Failed||0) + ' failed' : '';
    const w2NotStarted = brand.first_report_status === 'running' || brand.first_report_status === 'queued';
    const w2Suffix = w2NotStarted ? '  (starts after Phase 1 EOD)' : '';
    const w2EODDone = brand.first_report_status === 'succeeded';
    const w2EODStr = w2EODDone ? '  ✅ Phase 2 EOD done' : ((w2Completed||0) >= 24 && !w2EODDone ? '  ⏳ Phase 2 EOD running...' : '');
    console.log('    WAVE 2  : ' + bar(w2Completed||0, Math.max(w2Total, 24), 18) +
      '  ✅' + (w2Completed||0) + ' done' + w2Active + w2PendStr + w2FailStr + w2EODStr + w2Suffix);

    const currentWave = (brand.onboarding_phase || 1);
    const waveRemaining = currentWave === 1
      ? (w1Pending||0) + (w1Claimed||0)
      : (w2Pending||0) + (w2Claimed||0);
    if (waveRemaining > 0) {
      console.log('    ETA Wave ' + currentWave + ': ~' + Math.round(waveRemaining * 2.5) + ' min for remaining ' + waveRemaining + ' prompts');
    }

    if (dailyReport) {
      const drPartial = dailyReport.is_partial ? '⚠ PARTIAL' : '✅ COMPLETE';
      const drScore = dailyReport.visibility_score != null ? '  Visibility: ' + dailyReport.visibility_score.toFixed(1) + '/100' : '  (score not yet written)';
      const drStatus = dailyReport.status === 'completed' ? '✅ completed' : dailyReport.status === 'running' ? '🔵 running' : dailyReport.status;
      console.log('    REPORT  : date=' + dailyReport.report_date + '  status=' + drStatus + '  ' + drPartial + drScore);
      if (dailyReport.completed_prompts_chatgpt != null) {
        console.log('               results=' + dailyReport.completed_prompts_chatgpt + '/' + dailyReport.total_prompts + ' prompt results in DB');
      }
    } else {
      console.log('    REPORT  : ❌ No anchored daily_report yet');
    }
    if (brand.chatgpt_accounts?.email) {
      console.log('    Account : ' + brand.chatgpt_accounts.email);
    }
  }

  const { data: recentSucceeded } = await supabase.from('brands')
    .select('id, name, first_report_status, updated_at')
    .eq('first_report_status', 'succeeded')
    .eq('is_demo', false)
    .gte('updated_at', new Date(Date.now() - 30 * 60 * 1000).toISOString())
    .order('updated_at', { ascending: false })
    .limit(3);
  if (recentSucceeded && recentSucceeded.length > 0) {
    console.log('\n  Recently succeeded (last 30 min):');
    for (const b of recentSucceeded) console.log('    🟢 ' + b.name + '  — completed ' + ago(b.updated_at));
  }

  // ── SECTION 2: AGENT TIMELINE ─────────────────────────────────────────────
  sep('2. AGENT TIMELINE  (chronological — what each agent did, oldest at top)');

  // Group completed prompts into chunks: same account, claimed_at within 5-min window
  const tlSorted = [...(recentCompleted || [])]
    .filter(p => p.onboarding_claimed_at && p.updated_at)
    .sort((a, b) => new Date(a.onboarding_claimed_at) - new Date(b.onboarding_claimed_at));

  const chunks = [];
  tlSorted.forEach(p => {
    const email = p.chatgpt_accounts?.email || '(unknown)';
    const claimedMs = new Date(p.onboarding_claimed_at).getTime();
    const existing = chunks.find(c =>
      c.email === email &&
      claimedMs >= c.startMs &&
      claimedMs - c.lastClaimedMs < 5 * 60 * 1000
    );
    if (existing) {
      existing.prompts.push(p);
      existing.lastClaimedMs = Math.max(existing.lastClaimedMs, claimedMs);
      existing.endMs = Math.max(existing.endMs, new Date(p.updated_at).getTime());
      if (!existing.waves.includes(p.onboarding_wave)) existing.waves.push(p.onboarding_wave);
    } else {
      chunks.push({
        email,
        short: email.includes('@') ? email.split('@')[0].toUpperCase() : email.substring(0, 12).toUpperCase(),
        brand: p.brands?.name || '?',
        prompts: [p],
        startMs: claimedMs,
        lastClaimedMs: claimedMs,
        endMs: new Date(p.updated_at).getTime(),
        waves: p.onboarding_wave ? [p.onboarding_wave] : [],
        inProgress: false,
      });
    }
  });

  // Append currently in-progress claimed chunks
  const inProgressByAcct = {};
  (claimedPrompts || []).forEach(p => {
    const email = p.chatgpt_accounts?.email || '(unknown)';
    if (!inProgressByAcct[email]) inProgressByAcct[email] = [];
    inProgressByAcct[email].push(p);
  });
  Object.entries(inProgressByAcct).forEach(([email, prompts]) => {
    const startMs = Math.min(...prompts.map(p => new Date(p.onboarding_claimed_at).getTime()));
    chunks.push({
      email,
      short: email.includes('@') ? email.split('@')[0].toUpperCase() : email.substring(0, 12).toUpperCase(),
      brand: prompts[0]?.brands?.name || '?',
      prompts,
      startMs,
      lastClaimedMs: startMs,
      endMs: Date.now(),
      waves: [...new Set(prompts.map(p => p.onboarding_wave).filter(Boolean))],
      inProgress: true,
    });
  });

  chunks.sort((a, b) => a.startMs - b.startMs);

  if (chunks.length === 0) {
    console.log('  No onboarding chunks yet — timeline will populate once agents start processing');
  } else {
    // Header
    console.log('  TIME      AGENT            PROMPTS  WAVE    DURATION   STATUS      BRAND');
    console.log('  ' + '─'.repeat(67));
    chunks.forEach(c => {
      const waveTags = c.waves.length > 0 ? 'w' + c.waves.sort((a,b)=>a-b).join('+') : '?  ';
      const durationMs = c.endMs - c.startMs;
      const durationStr = c.inProgress
        ? dur(durationMs) + '…'   // still running — show elapsed
        : dur(durationMs);
      const statusStr  = c.inProgress ? '🔄 IN PROGRESS' : '✅ done';
      const startedAgo = ago(new Date(c.startMs).toISOString());
      const brandShort = c.brand.substring(0, 12).padEnd(12);
      console.log(
        '  ' + il(new Date(c.startMs).toISOString()) +
        '  ' + c.short.padEnd(15) +
        '  ' + String(c.prompts.length).padStart(2) + 'p     ' +
        waveTags.padEnd(6) +
        '  ' + durationStr.padEnd(10) +
        '  ' + statusStr.padEnd(14) +
        '  ' + brandShort +
        ' (' + startedAgo + ')'
      );
    });
    const doneCount = chunks.filter(c => !c.inProgress).length;
    const activeCount = chunks.filter(c => c.inProgress).length;
    const totalDonePrompts = chunks.filter(c => !c.inProgress).reduce((s, c) => s + c.prompts.length, 0);
    console.log('\n  ' + doneCount + ' chunks done (' + totalDonePrompts + ' prompts)' +
      (activeCount > 0 ? '  |  ' + activeCount + ' chunk(s) running now' : '  |  all agents idle'));
  }

  // ── SECTION 3: LIVE AGENT ACTIVITY ──────────────────────────────────────
  sep('3. LIVE AGENT ACTIVITY  (what each agent is doing right now)');

  const TIMEOUT_PER_PROMPT_MS = 2.5 * 60 * 1000;
  const claimedByAccount = {};
  (claimedPrompts || []).forEach(p => {
    const email = p.chatgpt_accounts?.email || p.onboarding_claimed_account_id || 'unknown';
    const short = email.split('@')[0];
    if (!claimedByAccount[short]) claimedByAccount[short] = [];
    claimedByAccount[short].push(p);
  });

  const runningBatches = (schedulesToday || []).filter(s => s.status === 'running');
  let anyConcurrent = false;

  capacity.accounts.forEach(a => {
    const short = a.email.split('@')[0];
    const myBatch = runningBatches.find(s => s.chatgpt_accounts?.email === a.email);
    const myPrompts = claimedByAccount[short] || [];
    const nextBatch = (schedulesToday || []).find(s =>
      s.chatgpt_accounts?.email === a.email && s.status === 'pending'
    );
    const nextBatchStr = nextBatch
      ? 'next batch #' + nextBatch.batch_number + ' in ' + minsUntil(nextBatch.execution_time) + ' min  (' + nextBatch.batch_size + 'p @ ' + il(nextBatch.execution_time) + ')'
      : 'no pending batches today';

    const icon = a.state === 'FREE' ? '✅' : a.state === 'RESERVED' ? '⏳' : '🔴';
    console.log('\n  ' + icon + ' ' + short.toUpperCase() + '  [' + a.state + ']  —  ' + nextBatchStr);

    if (myBatch) {
      const runningForMs = myBatch.execution_time ? Date.now() - new Date(myBatch.execution_time).getTime() : null;
      console.log('    📋 DAILY BATCH #' + myBatch.batch_number + '  |  ' + myBatch.batch_size + ' prompts  |  running for ' + (runningForMs != null ? dur(runningForMs) : '?'));
      if (myPrompts.length > 0) { anyConcurrent = true; console.log('    ⚡ CONCURRENT: daily batch + onboarding running simultaneously!'); }
    }

    if (myPrompts.length > 0) {
      const sorted = [...myPrompts].sort((a, b) => new Date(a.onboarding_claimed_at) - new Date(b.onboarding_claimed_at));
      const chunkStartMs = new Date(sorted[0].onboarding_claimed_at).getTime();
      const chunkAgeMs = Date.now() - chunkStartMs;
      const chunkTimeoutMs = myPrompts.length * TIMEOUT_PER_PROMPT_MS;
      const timeoutPct = Math.round((chunkAgeMs / chunkTimeoutMs) * 100);
      const timeoutWarn = timeoutPct >= 80 ? '  ⚠️  TIMEOUT IMMINENT' : timeoutPct >= 60 ? '  ⚠️  approaching timeout' : '';
      const brands = [...new Set(myPrompts.map(p => p.brands?.name || '?'))].join(', ');
      console.log('    🧠 ONBOARDING CHUNK  |  brand: ' + brands +
        '  |  ' + myPrompts.length + ' prompt' + (myPrompts.length > 1 ? 's' : '') +
        '  |  chunk running ' + dur(chunkAgeMs) + '  /  timeout ' + dur(chunkTimeoutMs) + ' (' + timeoutPct + '%)' + timeoutWarn);
      sorted.forEach((p, i) => {
        const promptAgeMs = Date.now() - new Date(p.onboarding_claimed_at).getTime();
        const text = (p.improved_prompt || p.raw_prompt || '(no text)').substring(0, 65);
        const ellipsis = (p.improved_prompt || p.raw_prompt || '').length > 65 ? '…' : '';
        const waveTag = p.onboarding_wave ? ' [w' + p.onboarding_wave + ']' : '';
        console.log('       #' + (i + 1) + waveTag + '  ' + dur(promptAgeMs) + '  "' + text + ellipsis + '"' + (promptAgeMs > TIMEOUT_PER_PROMPT_MS ? '  ⏱ OVER 2.5min' : ''));
      });
    }

    if (!myBatch && myPrompts.length === 0) console.log('    💤 idle');
  });

  if (anyConcurrent) console.log('\n  ⚡⚡⚡ WARNING: concurrent daily + onboarding detected!');
  else if (capacity.accounts.length > 0) console.log('\n  ✅ No concurrent violations');

  // ── SECTION 4: PHASE GATE CHECKS ────────────────────────────────────────
  sep('4. PHASE GATE CHECKS');

  const { count: wave0Count } = await supabase.from('brand_prompts')
    .select('id', { count: 'exact', head: true })
    .is('onboarding_wave', null)
    .neq('onboarding_status', 'completed');
  console.log('  Prompts with NULL wave (should be 0) : ' + (wave0Count || 0) + (wave0Count > 0 ? '  ⚠️  wave assignment may not have run!' : '  ✅'));

  for (const brand of (activeBrands || [])) {
    const { count: w1ClaimedCheck } = await supabase.from('brand_prompts').select('id', { count: 'exact', head: true }).eq('brand_id', brand.id).eq('onboarding_wave', 1).eq('onboarding_status', 'claimed');
    const { count: w1TotalCheck }   = await supabase.from('brand_prompts').select('id', { count: 'exact', head: true }).eq('brand_id', brand.id).eq('onboarding_wave', 1);
    if ((w1ClaimedCheck || 0) > 6) {
      console.log('  ⚠️  ' + brand.name + ': wave-1 over-claimed! ' + w1ClaimedCheck + ' claimed (max 6)');
    } else {
      console.log('  Wave-1 claim check "' + brand.name + '": ' + (w1ClaimedCheck||0) + ' claimed  (total wave-1=' + (w1TotalCheck||0) + ')  ✅');
    }
    if (brand.first_report_status === 'running' || brand.first_report_status === 'queued') {
      const { count: w2ClaimedEarly } = await supabase.from('brand_prompts').select('id', { count: 'exact', head: true }).eq('brand_id', brand.id).eq('onboarding_wave', 2).eq('onboarding_status', 'claimed');
      if ((w2ClaimedEarly || 0) > 0) {
        console.log('  ⚠️  ' + brand.name + ': wave-2 prompts claimed during Phase 1! (' + w2ClaimedEarly + ' claimed — phase gate broken)');
      } else {
        console.log('  Wave-2 gate "' + brand.name + '" (Phase 1): ' + (w2ClaimedEarly||0) + ' wave-2 claimed  ✅ gate holding');
      }
    }
  }

  // ── SECTION 5: TIMING ANALYSIS ──────────────────────────────────────────
  sep('5. TIMING ANALYSIS  (actual vs assumed 2.5 min/prompt)');

  const timings = (recentCompleted || [])
    .filter(p => p.onboarding_claimed_at && p.updated_at)
    .map(p => ({
      ms: new Date(p.updated_at).getTime() - new Date(p.onboarding_claimed_at).getTime(),
      wave: p.onboarding_wave || '?',
      brand: p.brands?.name || '?',
    }))
    .filter(t => t.ms > 0 && t.ms < 30 * 60 * 1000);

  if (timings.length === 0) {
    console.log('  No completed prompts with timing data yet');
  } else {
    const assumed = 2.5 * 60 * 1000;
    const avgMs = timings.reduce((s, t) => s + t.ms, 0) / timings.length;
    const minMs = Math.min(...timings.map(t => t.ms));
    const maxMs = Math.max(...timings.map(t => t.ms));
    const diff = avgMs - assumed;
    const diffStr = Math.abs(diff) > 10000
      ? '  ← ' + (diff > 0 ? '+' + dur(diff) + ' SLOWER' : dur(-diff) + ' FASTER') + ' than 2.5 min target'
      : '  ← on target ✅';
    const w1Timings = timings.filter(t => t.wave === 1);
    const w2Timings = timings.filter(t => t.wave === 2);
    console.log('  Total sample : ' + timings.length + ' prompts  (' + w1Timings.length + ' wave-1, ' + w2Timings.length + ' wave-2)');
    console.log('  Average      : ' + dur(avgMs) + diffStr);
    console.log('  Range        : ' + dur(minMs) + ' – ' + dur(maxMs));
    if (w1Timings.length > 0) console.log('  Wave-1 avg   : ' + dur(w1Timings.reduce((s,t)=>s+t.ms,0)/w1Timings.length));
    if (w2Timings.length > 0) console.log('  Wave-2 avg   : ' + dur(w2Timings.reduce((s,t)=>s+t.ms,0)/w2Timings.length));
    console.log('\n  Last ' + Math.min(8, timings.length) + ' completed:');
    timings.slice(0, 8).forEach((t, i) => {
      const flag = t.ms > assumed * 1.4 ? ' ⚠️  SLOW' : t.ms < assumed * 0.6 ? ' ⚡ fast' : '';
      console.log('    #' + (i+1) + ' wave' + t.wave + '  ' + t.brand.substring(0,14).padEnd(14) + '  ' + dur(t.ms) + flag);
    });
  }

  // ── SECTION 6: STATE TRANSITIONS ────────────────────────────────────────
  sep('6. STATE TRANSITIONS  (last 60 min, per account)');

  capacity.accounts.forEach(a => {
    const short = a.email.split('@')[0];
    const events = (recentForensics || []).filter(f => f.chatgpt_account_email === a.email).slice(0, 12).reverse();
    if (events.length === 0) { console.log('\n  ' + short + ': no forensic events in last 60 min'); return; }
    console.log('\n  ' + short + ':');
    let prevTime = null;
    events.forEach(f => {
      const sinceLastMs = prevTime ? new Date(f.timestamp).getTime() - new Date(prevTime).getTime() : null;
      const durStr = sinceLastMs !== null ? ' (+' + dur(sinceLastMs) + ')' : '';
      const conn = f.connection_status === 'Connected' ? '🟢' : '🔴';
      console.log('    ' + il(f.timestamp) + durStr + '  ' + conn + '  ' + (f.visual_state||'?').padEnd(16) + '  ' + (f.event_type||'').padEnd(22) + (f.notes ? f.notes.substring(0,35) : ''));
      prevTime = f.timestamp;
    });
  });

  // ── SECTION 7: TARGET USER ───────────────────────────────────────────────
  sep('7. TARGET USER: ' + targetEmail);

  const { data: authList } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const authUser = (authList?.users || []).find(u => u.email === targetEmail);

  if (!authUser) {
    console.log('  ❌ Not found in auth.users');
  } else {
    const [{ data: userRow }, { data: brands }] = await Promise.all([
      supabase.from('users').select('id, email, subscription_plan, reports_enabled').eq('id', authUser.id).single(),
      supabase.from('brands')
        .select('id, name, first_report_status, onboarding_completed, onboarding_prompts_sent, onboarding_phase, onboarding_daily_report_id, chatgpt_account_id, chatgpt_accounts(email), created_at, updated_at')
        .eq('owner_user_id', authUser.id).eq('is_demo', false).order('created_at', { ascending: false }),
    ]);
    console.log('  Auth confirmed : ' + (authUser.email_confirmed_at ? '✅ yes  (' + il(authUser.email_confirmed_at) + ')' : '❌ NOT confirmed'));
    console.log('  Users table    : ' + (userRow ? '✅ plan=' + userRow.subscription_plan + '  reports_enabled=' + userRow.reports_enabled : '❌ NOT IN TABLE'));
    console.log('  Auth ID        : ' + authUser.id);

    for (const b of (brands || [])) {
      console.log('\n  Brand: "' + b.name + '"');
      console.log('    id              : ' + b.id);
      console.log('    onboarding done : ' + (b.onboarding_completed ? '✅ yes' : '❌ no'));
      console.log('    first_report    : ' + statusIcon(b.first_report_status));
      console.log('    onboarding_phase: ' + (b.onboarding_phase || '(null)'));
      console.log('    prompts_sent    : ' + (b.onboarding_prompts_sent || 0) + ' / 30');
      console.log('    account         : ' + (b.chatgpt_accounts?.email || '(none)'));
      console.log('    daily_report_id : ' + (b.onboarding_daily_report_id || '(none)'));
      console.log('    created         : ' + il(b.created_at) + '  (' + ago(b.created_at) + ')');
      console.log('    updated         : ' + il(b.updated_at) + '  (' + ago(b.updated_at) + ')');

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
      console.log('    wave-1 prompts  : ✅' + (w1co||0) + ' done  🔄' + (w1cl||0) + ' claimed  ⏳' + (w1p||0) + ' pending  ❌' + (w1f||0) + ' failed');
      console.log('    wave-2 prompts  : ✅' + (w2co||0) + ' done  🔄' + (w2cl||0) + ' claimed  ⏳' + (w2p||0) + ' pending  ❌' + (w2f||0) + ' failed');

      if (b.onboarding_daily_report_id) {
        const { data: dr } = await supabase.from('daily_reports').select('id, status, is_partial, report_date, visibility_score, completed_prompts_chatgpt, total_prompts').eq('id', b.onboarding_daily_report_id).single();
        if (dr) {
          console.log('    daily_report    : date=' + dr.report_date + '  status=' + dr.status + '  ' + (dr.is_partial ? '⚠ PARTIAL' : '✅ COMPLETE') + (dr.visibility_score != null ? '  score=' + dr.visibility_score.toFixed(1) : '  (no score yet)'));
        } else {
          console.log('    daily_report    : ❌ ID set but row not found!');
        }
      }
    }
    if (!brands || brands.length === 0) console.log('  No non-demo brands found for this user');
  }

  // ── SECTION 8: TODAY BATCH OVERVIEW ─────────────────────────────────────
  sep('8. TODAY BATCH OVERVIEW  (' + today + ')');

  const totalPending = (schedulesToday || []).filter(s => s.status === 'pending').reduce((sum, s) => sum + s.batch_size, 0);
  const totalDone    = (schedulesToday || []).filter(s => s.status === 'completed').reduce((sum, s) => sum + s.batch_size, 0);
  const totalRunning = (schedulesToday || []).filter(s => s.status === 'running').reduce((sum, s) => sum + s.batch_size, 0);
  console.log('  ' + totalDone + ' prompts done  |  ' + totalRunning + ' running  |  ' + totalPending + ' pending  |  ' + (schedulesToday || []).length + ' total batches');

  const next5 = (schedulesToday || []).filter(s => s.status === 'pending' || s.status === 'running').slice(0, 5);
  if (next5.length > 0) {
    console.log('\n  Next 5 batches:');
    next5.forEach(s => {
      const short = (s.chatgpt_accounts?.email || '?').split('@')[0];
      const icon = s.status === 'running' ? '🔄' : '⏳';
      const minsAway = minsUntil(s.execution_time);
      console.log('    ' + icon + ' Batch #' + String(s.batch_number).padStart(2) + '  ' + il(s.execution_time) + '  (' + (minsAway === 0 ? 'NOW' : 'in ' + minsAway + 'min') + ')  ' + s.batch_size + 'p  →  ' + short);
    });
  }

  console.log('\n' + '═'.repeat(70) + '\n');
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
