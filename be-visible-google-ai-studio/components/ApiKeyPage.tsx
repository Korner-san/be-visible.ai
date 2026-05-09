import React, { useState, useCallback } from 'react';
import {
  Key, Copy, RefreshCw, ExternalLink, Check, Bot,
  Zap, BarChart2, Link2, TrendingUp, ChevronRight,
} from 'lucide-react';
import { Terminal, TypingAnimation, AnimatedSpan } from './ui/terminal';

// ── Timing map (all delays in ms) ────────────────────────────────────────────
// Each entry's delay is chosen so it appears just after the previous one
// finishes typing. Typing speed is 15ms/char (set in terminal.tsx).
// cmd_done ≈ delay + len(text) * 15
// ─────────────────────────────────────────────────────────────────────────────

const D = {
  cmd1: 300,        // `> bevisible auth verify ...`   ~49 chars → done ≈ 1035ms
  r1a:  1150,
  r1b:  1350,
  cmd2: 1900,       // `> bevisible reports list ...`  ~40 chars → done ≈ 2500ms
  r2a:  2600,
  r2b:  2800,
  r2c:  3000,
  cmd3: 3600,       // `> bevisible visibility get ...` ~51 chars → done ≈ 4365ms
  r3a:  4500,
  r3b:  4700,
  r3c:  4900,
  cmd4: 5450,       // `> bevisible entities rank ...`  ~38 chars → done ≈ 6020ms
  r4a:  6100,
  r4b:  6300,
  r4c:  6500,
  cmd5: 7000,       // `> bevisible citations list ...` ~41 chars → done ≈ 7615ms
  r5a:  7750,
  r5b:  7950,
  r5c:  8150,
  cmd6: 8650,       // `> bevisible insights generate ...` ~44 chars → done ≈ 9310ms
  r6a:  9450,
  r6b:  9750,
  r6c:  10100,
  r6d:  10500,
};

// ── Mock API key (UI-only) ────────────────────────────────────────────────────
const MOCK_KEY = 'sk_live_bv_a8f3d2c1e9b7f4a2d6c8e0f1b3a5d7c9';

// ── Use cases ─────────────────────────────────────────────────────────────────
const USE_CASES = [
  {
    icon: <BarChart2 size={15} className="text-indigo-500" />,
    prompt: '"Analyze my latest visibility report."',
    detail: 'Pull the most recent daily report, break down mention rates per AI model, and surface what changed.',
  },
  {
    icon: <Link2 size={15} className="text-amber-600" />,
    prompt: '"Which citation sources influence my visibility the most?"',
    detail: 'Rank domains by mention frequency and brand co-occurrence across all tracked prompts.',
  },
  {
    icon: <TrendingUp size={15} className="text-emerald-600" />,
    prompt: '"Compare my brand against the top 10 entities this week."',
    detail: 'Fetch SOV data, compute visibility indices, and output a ranked comparison table.',
  },
  {
    icon: <Zap size={15} className="text-brand-brown" />,
    prompt: '"Summarize visibility changes over the last 30 days."',
    detail: 'Read the full date range, compute trend lines, and write an executive summary.',
  },
];

// ── Component ─────────────────────────────────────────────────────────────────
export const ApiKeyPage: React.FC = () => {
  const [keyVisible, setKeyVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedInstruction, setCopiedInstruction] = useState(false);
  const [terminalKey, setTerminalKey] = useState(0); // increment to remount & replay

  const displayKey = keyVisible ? MOCK_KEY : MOCK_KEY.slice(0, 12) + '••••••••••••••••••••••';

  const copyKey = useCallback(() => {
    navigator.clipboard.writeText(MOCK_KEY).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  const agentInstruction =
    `You have access to the BeVisible API.\n` +
    `Use my API key to fetch my visibility reports, citation sources, AI responses, ` +
    `entity rankings, and improvement recommendations.\n` +
    `Analyze the data and provide clear, actionable AI-visibility insights.`;

  const copyInstruction = useCallback(() => {
    navigator.clipboard.writeText(agentInstruction).catch(() => {});
    setCopiedInstruction(true);
    setTimeout(() => setCopiedInstruction(false), 2000);
  }, [agentInstruction]);

  return (
    <div className="space-y-6 pb-16 animate-fadeIn">

      {/* ── Header ── */}
      <div className="bg-white rounded-2xl shadow-card overflow-hidden" style={{ border: '1px solid #e8edf4' }}>
        <div className="absolute-0 h-0.5 w-full bg-gradient-to-r from-indigo-500 via-violet-500 to-brand-brown rounded-t-2xl" />
        <div className="px-7 py-6 flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-1">
              <Key size={14} className="text-brand-brown" />
              <span className="text-[9px] font-black tracking-[0.18em] text-slate-400 uppercase">Developer Access</span>
            </div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">API Key</h2>
            <p className="text-xs text-slate-500 font-medium leading-relaxed max-w-xl">
              Connect BeVisible data to Claude, custom agents, automations, or internal dashboards.
              Your API key grants read access to all your reports, citation sources, entities, and visibility metrics.
            </p>
          </div>
          <div className="shrink-0 w-10 h-10 rounded-xl bg-brand-brown/5 flex items-center justify-center">
            <Bot size={20} className="text-brand-brown/60" />
          </div>
        </div>
      </div>

      {/* ── API Key Card ── */}
      <div className="bg-white rounded-2xl shadow-card" style={{ border: '1px solid #e8edf4' }}>
        <div className="px-6 py-5">
          <div className="flex items-center gap-2 mb-4">
            <Key size={13} className="text-slate-400" />
            <span className="text-xs font-bold text-slate-600 uppercase tracking-widest">Your API Key</span>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100">Active</span>
          </div>

          {/* Key display row */}
          <div
            className="flex items-center gap-3 px-4 py-3 rounded-xl"
            style={{ background: '#f8fafc', border: '1px solid #e8edf4', fontFamily: 'monospace' }}
          >
            <span className="text-xs text-slate-600 flex-1 truncate select-all">{displayKey}</span>
            <button
              onClick={() => setKeyVisible(v => !v)}
              className="text-[10px] font-bold text-slate-400 hover:text-slate-600 transition-colors shrink-0 px-2 py-1 rounded-lg hover:bg-slate-100"
            >
              {keyVisible ? 'Hide' : 'Show'}
            </button>
          </div>

          {/* Actions row */}
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={copyKey}
              className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg transition-all"
              style={{ backgroundColor: copied ? '#f0fdf4' : '#f8fafc', color: copied ? '#16a34a' : '#475569', border: '1px solid', borderColor: copied ? '#bbf7d0' : '#e8edf4' }}
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? 'Copied!' : 'Copy Key'}
            </button>
            <button
              className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg bg-slate-50 text-slate-500 border border-slate-200 hover:bg-slate-100 transition-all"
            >
              <RefreshCw size={12} />
              Regenerate
            </button>
            <button
              className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg bg-slate-50 text-slate-500 border border-slate-200 hover:bg-slate-100 transition-all"
            >
              <ExternalLink size={12} />
              View Docs
            </button>
          </div>
        </div>
      </div>

      {/* ── Terminal + Claude instruction (2-col) ── */}
      <div className="grid grid-cols-12 gap-6">

        {/* Terminal demo */}
        <div className="col-span-12 lg:col-span-7 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-slate-700">Agent terminal demo</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Watch an AI agent pull data from your BeVisible workspace</p>
            </div>
            <button
              onClick={() => setTerminalKey(k => k + 1)}
              className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 hover:text-brand-brown border border-slate-200 px-2.5 py-1.5 rounded-lg hover:border-brand-brown/30 transition-all"
            >
              <RefreshCw size={11} />
              Replay
            </button>
          </div>

          <Terminal key={terminalKey} className="h-[480px]">

            {/* Command 1 — auth */}
            <TypingAnimation delay={D.cmd1} className="text-[#79c0ff]">
              {'> bevisible auth verify --api-key sk_live_bv_****'}
            </TypingAnimation>
            <AnimatedSpan delay={D.r1a} className="text-[#3fb950]">
              {'  ✔ API key verified — Workspace: Pro Plan'}
            </AnimatedSpan>
            <AnimatedSpan delay={D.r1b} className="text-[#3fb950]">
              {'  ✔ Connected to brand: Incredibuild'}
            </AnimatedSpan>

            {/* spacer */}
            <AnimatedSpan delay={D.cmd2 - 100} className="text-transparent">{'.'}</AnimatedSpan>

            {/* Command 2 — reports list */}
            <TypingAnimation delay={D.cmd2} className="text-[#79c0ff]">
              {'> bevisible reports list --brand current'}
            </TypingAnimation>
            <AnimatedSpan delay={D.r2a} className="text-[#8b949e]">
              {'  [2025-05-09]  completed   visibility: 82.4'}
            </AnimatedSpan>
            <AnimatedSpan delay={D.r2b} className="text-[#8b949e]">
              {'  [2025-05-08]  completed   visibility: 79.1'}
            </AnimatedSpan>
            <AnimatedSpan delay={D.r2c} className="text-[#8b949e]">
              {'  [2025-05-07]  completed   visibility: 77.8'}
            </AnimatedSpan>

            <AnimatedSpan delay={D.cmd3 - 100} className="text-transparent">{'.'}</AnimatedSpan>

            {/* Command 3 — visibility get */}
            <TypingAnimation delay={D.cmd3} className="text-[#79c0ff]">
              {'> bevisible visibility get --date latest --model all'}
            </TypingAnimation>
            <AnimatedSpan delay={D.r3a} className="text-[#e3b341]">
              {'  Visibility Index:   82.4'}
            </AnimatedSpan>
            <AnimatedSpan delay={D.r3b} className="text-[#e3b341]">
              {'  Trend (7d):         +4.1%'}
            </AnimatedSpan>
            <AnimatedSpan delay={D.r3c} className="text-[#8b949e]">
              {'  Models: ChatGPT / Claude / Google AIO'}
            </AnimatedSpan>

            <AnimatedSpan delay={D.cmd4 - 100} className="text-transparent">{'.'}</AnimatedSpan>

            {/* Command 4 — entities rank */}
            <TypingAnimation delay={D.cmd4} className="text-[#79c0ff]">
              {'> bevisible entities rank --date latest'}
            </TypingAnimation>
            <AnimatedSpan delay={D.r4a} className="text-[#3fb950]">
              {'  #1  Incredibuild   ← YOUR BRAND      82.4'}
            </AnimatedSpan>
            <AnimatedSpan delay={D.r4b} className="text-[#8b949e]">
              {'  #2  GitLab CI                         71.2'}
            </AnimatedSpan>
            <AnimatedSpan delay={D.r4c} className="text-[#8b949e]">
              {'  #3  CircleCI                          58.9'}
            </AnimatedSpan>

            <AnimatedSpan delay={D.cmd5 - 100} className="text-transparent">{'.'}</AnimatedSpan>

            {/* Command 5 — citations */}
            <TypingAnimation delay={D.cmd5} className="text-[#79c0ff]">
              {'> bevisible citations list --date latest'}
            </TypingAnimation>
            <AnimatedSpan delay={D.r5a} className="text-[#8b949e]">
              {'  reddit.com          890 mentions  (35.2%)'}
            </AnimatedSpan>
            <AnimatedSpan delay={D.r5b} className="text-[#8b949e]">
              {'  stackoverflow.com   540 mentions  (21.4%)'}
            </AnimatedSpan>
            <AnimatedSpan delay={D.r5c} className="text-[#8b949e]">
              {'  github.com          320 mentions  (12.7%)'}
            </AnimatedSpan>

            <AnimatedSpan delay={D.cmd6 - 100} className="text-transparent">{'.'}</AnimatedSpan>

            {/* Command 6 — insights generate */}
            <TypingAnimation delay={D.cmd6} className="text-[#79c0ff]">
              {'> bevisible insights generate --type visibility-summary'}
            </TypingAnimation>
            <AnimatedSpan delay={D.r6a} className="text-[#8b949e]">
              {'  Analyzing visibility trends…'}
            </AnimatedSpan>
            <AnimatedSpan delay={D.r6b} className="text-[#8b949e]">
              {'  Comparing against 8 competitors…'}
            </AnimatedSpan>
            <AnimatedSpan delay={D.r6c} className="text-[#8b949e]">
              {'  Ranking citation source influence…'}
            </AnimatedSpan>
            <AnimatedSpan delay={D.r6d} className="text-[#3fb950] font-bold">
              {'  ✔ Insight summary ready. 4 recommendations generated.'}
            </AnimatedSpan>

          </Terminal>
        </div>

        {/* Claude instruction card */}
        <div className="col-span-12 lg:col-span-5 flex flex-col gap-3">
          <div>
            <p className="text-sm font-bold text-slate-700">Claude agent instructions</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Paste this into Claude to give it access to your BeVisible data</p>
          </div>

          <div className="bg-white rounded-2xl shadow-card flex flex-col flex-1" style={{ border: '1px solid #e8edf4' }}>
            {/* instruction text */}
            <div
              className="flex-1 px-5 py-4 text-xs text-slate-600 leading-relaxed font-mono"
              style={{ background: '#fafbfc', borderRadius: '16px 16px 0 0', borderBottom: '1px solid #e8edf4', whiteSpace: 'pre-wrap', minHeight: '120px' }}
            >
              {agentInstruction}
            </div>
            <div className="px-5 py-3 flex items-center justify-between">
              <span className="text-[10px] text-slate-400 font-medium">System prompt snippet</span>
              <button
                onClick={copyInstruction}
                className="flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1.5 rounded-lg transition-all"
                style={{
                  backgroundColor: copiedInstruction ? '#f0fdf4' : '#f8fafc',
                  color: copiedInstruction ? '#16a34a' : '#475569',
                  border: '1px solid',
                  borderColor: copiedInstruction ? '#bbf7d0' : '#e8edf4',
                }}
              >
                {copiedInstruction ? <Check size={11} /> : <Copy size={11} />}
                {copiedInstruction ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>

          {/* What the API can return */}
          <div className="bg-white rounded-2xl shadow-card px-5 py-4" style={{ border: '1px solid #e8edf4' }}>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">What the agent can access</p>
            <div className="space-y-2">
              {[
                'Daily visibility reports by date range',
                'Brand mention rate per AI model',
                'Competitor & entity rankings (SOV)',
                'Citation sources and domain influence',
                'AI response content per prompt',
                'Improvement recommendations',
              ].map((item) => (
                <div key={item} className="flex items-center gap-2">
                  <ChevronRight size={11} className="text-brand-brown shrink-0" />
                  <span className="text-[11px] text-slate-600 font-medium">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Use cases ── */}
      <div>
        <div className="mb-4">
          <p className="text-sm font-bold text-slate-700">Example agent prompts</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Ask Claude these questions once you've given it your API key</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {USE_CASES.map((uc) => (
            <div
              key={uc.prompt}
              className="bg-white rounded-2xl shadow-card hover:shadow-elevated transition-smooth p-5 flex flex-col gap-3"
              style={{ border: '1px solid #e8edf4' }}
            >
              <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center border border-slate-100 shrink-0">
                {uc.icon}
              </div>
              <div className="space-y-1">
                <p className="text-xs font-bold text-slate-800 leading-snug">{uc.prompt}</p>
                <p className="text-[10px] text-slate-400 leading-relaxed">{uc.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};
