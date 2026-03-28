import React, { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw, Loader2, AlertCircle, CheckCircle, Clock,
  ChevronDown, ChevronRight, Lock, Zap, Activity
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface BrandSummary {
  id: string;
  name: string;
  domain: string;
  firstReportStatus: string;
  onboardingPhase: number;
  onboardingCompleted: boolean;
  createdAt: string;
  onboardingDailyReportId: string | null;
  userEmail: string;
}

interface PromptResult {
  hasChat: boolean;
  hasGoogle: boolean;
  hasClaude: boolean;
  brandMentioned: boolean;
  chatCreatedAt: string | null;
  googleCreatedAt: string | null;
}

interface EnrichedPrompt {
  id: string;
  raw_prompt: string;
  improved_prompt: string | null;
  onboarding_wave: number;
  onboarding_status: string;
  onboarding_claimed_account_id: string | null;
  onboarding_claimed_at: string | null;
  claimedAccountEmail: string | null;
  results: PromptResult;
}

interface Chunk {
  key: string;
  wave: number;
  accountEmail: string;
  claimedAt: string;
  prompts: EnrichedPrompt[];
  total: number;
  completed: number;
  failed: number;
  claimed: number;
  chatDone: number;
  googleDone: number;
  claudeDone: number;
  mentionCount: number;
  completedAt: string | null;
  durationMs: number | null;
  status: string;
}

interface Report {
  id: string;
  status: string;
  is_partial: boolean;
  total_prompts: number;
  completed_prompts: number;
  visibility_score: string | null;
  share_of_voice_data: any;
  chatgpt_ok: number;
  chatgpt_attempted: number;
  google_ai_overview_ok: number;
  google_ai_overview_attempted: number;
  claude_ok: number;
  claude_attempted: number;
  chatgpt_status: string | null;
  google_ai_overview_status: string | null;
  claude_status: string | null;
  created_at: string;
  completed_at: string | null;
}

interface Incident {
  time: string;
  event: string;
  detail: string;
}

interface Detail {
  brand: BrandSummary;
  report: Report | null;
  prompts: EnrichedPrompt[];
  chunks: Chunk[];
  scheduleInjection: { schedules: any[]; bmeCount: number };
  incidents: Incident[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'UTC' }) + ' UTC';
}

function fmtDuration(ms: number | null | undefined): string {
  if (!ms || ms <= 0) return '—';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function fmtAgo(iso: string | null | undefined): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m ago`;
}

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const s = status.toLowerCase();
  if (s === 'completed' || s === 'succeeded')
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-700"><CheckCircle size={10} />Done</span>;
  if (s === 'running')
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-700 animate-pulse"><Activity size={10} />Running</span>;
  if (s === 'timed_out')
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-700"><Clock size={10} />Timed Out</span>;
  if (s === 'failed')
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-700"><AlertCircle size={10} />Failed</span>;
  if (s === 'partial')
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-700"><AlertCircle size={10} />Partial</span>;
  if (s === 'phase1_complete')
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-100 text-indigo-700"><Zap size={10} />Phase 1 Done</span>;
  if (s === 'queued')
    return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-gray-100 text-slate-500 border border-gray-200">Queued</span>;
  return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-gray-100 text-slate-500 border border-gray-200">{status}</span>;
};

const PlatformCell: React.FC<{ done: boolean; label: string }> = ({ done, label }) => {
  if (done) return <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-semibold"><CheckCircle size={12} />{label}</span>;
  return <span className="text-slate-300 text-xs">—</span>;
};

// ─── Main Component ───────────────────────────────────────────────────────────

export const OnboardingForensicPage: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState(false);

  const [brands, setBrands] = useState<BrandSummary[]>([]);
  const [selectedBrandId, setSelectedBrandId] = useState<string>('');
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [expandedChunks, setExpandedChunks] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (localStorage.getItem('forensic_authenticated') === 'true') setIsAuthenticated(true);
  }, []);

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === 'Korneret') {
      setIsAuthenticated(true);
      localStorage.setItem('forensic_authenticated', 'true');
    } else {
      setPasswordError(true);
      setPassword('');
    }
  };

  const fetchData = useCallback(async (brandId?: string) => {
    try {
      setLoading(true);
      setError(null);
      const url = `/api/admin/onboarding-forensic${brandId ? `?brand_id=${brandId}` : ''}`;
      const res = await fetch(`${url}&t=${Date.now()}`, {
        headers: { 'x-forensic-password': 'Korneret' },
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setBrands(json.brands || []);
      if (json.detail) setDetail(json.detail);
      setLastRefresh(new Date());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    if (isAuthenticated) fetchData();
  }, [isAuthenticated, fetchData]);

  // Auto-select first brand
  useEffect(() => {
    if (brands.length > 0 && !selectedBrandId) {
      const first = brands[0].id;
      setSelectedBrandId(first);
      fetchData(first);
    }
  }, [brands, selectedBrandId, fetchData]);

  // Auto-refresh while onboarding in progress
  useEffect(() => {
    if (!isAuthenticated || !selectedBrandId || !detail) return;
    const status = detail.brand.firstReportStatus;
    if (status === 'succeeded') return;
    const timer = setInterval(() => fetchData(selectedBrandId), 30000);
    return () => clearInterval(timer);
  }, [isAuthenticated, selectedBrandId, detail, fetchData]);

  const handleBrandChange = (id: string) => {
    setSelectedBrandId(id);
    setDetail(null);
    setExpandedChunks(new Set());
    fetchData(id);
  };

  const toggleChunk = (key: string) => {
    setExpandedChunks(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // ── Auth gate ─────────────────────────────────────────────────────────────
  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-full">
        <form onSubmit={handlePasswordSubmit} className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 w-full max-w-sm">
          <div className="flex items-center gap-2 mb-6">
            <Lock size={18} className="text-slate-400" />
            <h2 className="text-lg font-semibold text-slate-800">Onboarding Forensic</h2>
          </div>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Password"
            className={`w-full px-3 py-2 rounded-lg border text-sm mb-3 outline-none focus:ring-2 focus:ring-indigo-300 ${passwordError ? 'border-red-400' : 'border-gray-200'}`}
            autoFocus
          />
          {passwordError && <p className="text-red-500 text-xs mb-3">Incorrect password</p>}
          <button type="submit" className="w-full bg-indigo-600 text-white text-sm font-semibold py-2 rounded-lg hover:bg-indigo-700 transition-colors">
            Unlock
          </button>
        </form>
      </div>
    );
  }

  // ── Summary cards ─────────────────────────────────────────────────────────
  const renderSummaryCards = () => {
    if (!detail) return null;
    const { brand, report, prompts, chunks } = detail;

    const wave1 = prompts.filter(p => p.onboarding_wave === 1);
    const wave2 = prompts.filter(p => p.onboarding_wave === 2);
    const w1Done = wave1.filter(p => p.onboarding_status === 'completed').length;
    const w2Done = wave2.filter(p => p.onboarding_status === 'completed').length;

    const chatTotal = prompts.filter(p => p.results.hasChat).length;
    const googleTotal = prompts.filter(p => p.results.hasGoogle).length;
    const claudeTotal = prompts.filter(p => p.results.hasClaude).length;
    const totalPrompts = prompts.length;

    const startTime = new Date(brand.createdAt);
    const endTime = report?.completed_at ? new Date(report.completed_at) : null;
    const durationMs = endTime ? endTime.getTime() - startTime.getTime() : Date.now() - startTime.getTime();
    const durationLabel = endTime ? fmtDuration(durationMs) : `${fmtDuration(durationMs)} (ongoing)`;

    const timedOutCount = chunks.filter(c => c.status === 'timed_out').length;

    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-slate-500 mb-1">Duration</div>
          <div className="text-lg font-bold text-slate-800">{durationLabel}</div>
          <div className="text-xs text-slate-400 mt-1">Started {fmtAgo(brand.createdAt)}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-slate-500 mb-1">Prompt Progress</div>
          <div className="text-lg font-bold text-slate-800">{w1Done + w2Done} / {totalPrompts}</div>
          <div className="text-xs text-slate-400 mt-1">Wave 1: {w1Done}/6 · Wave 2: {w2Done}/24</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-slate-500 mb-1">Platform Coverage</div>
          <div className="text-sm font-bold text-slate-800 space-x-2">
            <span className="text-emerald-600">GPT {chatTotal}</span>
            <span className="text-blue-600">AIO {googleTotal}</span>
            <span className={claudeTotal > 0 ? 'text-violet-600' : 'text-slate-300'}>Claude {claudeTotal}</span>
          </div>
          <div className="text-xs text-slate-400 mt-1">of {totalPrompts} prompts</div>
        </div>
        <div className={`rounded-xl border p-4 ${timedOutCount > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200'}`}>
          <div className="text-xs text-slate-500 mb-1">Incidents</div>
          <div className={`text-lg font-bold ${timedOutCount > 0 ? 'text-amber-700' : 'text-slate-800'}`}>
            {timedOutCount > 0 ? `${timedOutCount} timeout${timedOutCount > 1 ? 's' : ''}` : 'None'}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            {report?.visibility_score ? `Score: ${parseFloat(report.visibility_score).toFixed(1)}` : 'No score yet'}
          </div>
        </div>
      </div>
    );
  };

  // ── Table A: Chunks ───────────────────────────────────────────────────────
  const renderChunksTable = () => {
    if (!detail) return null;
    const { chunks } = detail;

    // Group by wave for display
    const wave1Chunks = chunks.filter(c => c.wave === 1);
    const wave2Chunks = chunks.filter(c => c.wave === 2);

    const renderChunkRow = (chunk: Chunk, idx: number) => {
      const isExpanded = expandedChunks.has(chunk.key);
      const isStuck = chunk.status === 'timed_out' || chunk.status === 'running';
      const rowBg = chunk.status === 'timed_out' ? 'bg-amber-50' : chunk.status === 'failed' ? 'bg-red-50' : '';

      return (
        <React.Fragment key={chunk.key}>
          <tr
            className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${rowBg}`}
            onClick={() => toggleChunk(chunk.key)}
          >
            <td className="px-3 py-2 text-xs text-slate-500">
              {isExpanded ? <ChevronDown size={14} className="inline" /> : <ChevronRight size={14} className="inline" />}
              {' '}#{idx + 1}
            </td>
            <td className="px-3 py-2 text-xs text-slate-700">{chunk.accountEmail?.split('@')[0] || '—'}</td>
            <td className="px-3 py-2 text-xs text-slate-500 font-mono">{fmt(chunk.claimedAt)}</td>
            <td className="px-3 py-2 text-xs text-slate-700 text-center">{chunk.total}</td>
            <td className="px-3 py-2"><StatusBadge status={chunk.status} /></td>
            <td className="px-3 py-2 text-xs">
              <span className={chunk.chatDone > 0 ? 'text-emerald-600 font-semibold' : 'text-slate-300'}>GPT {chunk.chatDone}/{chunk.total}</span>
            </td>
            <td className="px-3 py-2 text-xs">
              <span className={chunk.googleDone > 0 ? 'text-blue-600 font-semibold' : 'text-slate-300'}>AIO {chunk.googleDone}/{chunk.total}</span>
            </td>
            <td className="px-3 py-2 text-xs">
              <span className={chunk.claudeDone > 0 ? 'text-violet-600 font-semibold' : 'text-slate-300'}>Claude {chunk.claudeDone}/{chunk.total}</span>
            </td>
            <td className="px-3 py-2 text-xs text-slate-500">{fmtDuration(chunk.durationMs)}</td>
            <td className="px-3 py-2 text-xs text-slate-500">{chunk.mentionCount > 0 ? `${chunk.mentionCount} mention${chunk.mentionCount > 1 ? 's' : ''}` : '—'}</td>
          </tr>
          {isExpanded && (
            <tr>
              <td colSpan={10} className="bg-slate-50 px-6 py-3 border-b border-gray-200">
                <div className="text-xs font-semibold text-slate-500 mb-2">Prompts in this chunk</div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-400">
                      <th className="text-left py-1 pr-4 font-medium">Prompt</th>
                      <th className="text-left py-1 pr-4 font-medium">Status</th>
                      <th className="text-left py-1 pr-4 font-medium">ChatGPT</th>
                      <th className="text-left py-1 pr-4 font-medium">Google AIO</th>
                      <th className="text-left py-1 pr-4 font-medium">Claude</th>
                      <th className="text-left py-1 font-medium">Brand Mentioned</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chunk.prompts.map(p => (
                      <tr key={p.id} className="border-t border-slate-100">
                        <td className="py-1 pr-4 text-slate-700 max-w-xs truncate" title={p.improved_prompt || p.raw_prompt}>
                          {(p.improved_prompt || p.raw_prompt).substring(0, 70)}…
                        </td>
                        <td className="py-1 pr-4"><StatusBadge status={p.onboarding_status} /></td>
                        <td className="py-1 pr-4"><PlatformCell done={p.results.hasChat} label="✓" /></td>
                        <td className="py-1 pr-4"><PlatformCell done={p.results.hasGoogle} label="✓" /></td>
                        <td className="py-1 pr-4"><PlatformCell done={p.results.hasClaude} label="✓" /></td>
                        <td className="py-1">
                          {p.results.brandMentioned
                            ? <span className="text-emerald-600 font-semibold">Yes</span>
                            : <span className="text-slate-300">No</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </td>
            </tr>
          )}
        </React.Fragment>
      );
    };

    const renderWaveSection = (label: string, waveChunks: Chunk[], waveNum: number) => {
      const wavePrompts = detail.prompts.filter(p => p.onboarding_wave === waveNum);
      const done = wavePrompts.filter(p => p.onboarding_status === 'completed').length;
      return (
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-sm font-bold text-slate-700">{label}</h3>
            <span className="text-xs text-slate-400">{done}/{wavePrompts.length} prompts done</span>
            {waveChunks.length === 0 && <span className="text-xs text-slate-300 italic">No chunks yet</span>}
          </div>
          {waveChunks.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold text-slate-500">Chunk</th>
                    <th className="text-left px-3 py-2 font-semibold text-slate-500">Account</th>
                    <th className="text-left px-3 py-2 font-semibold text-slate-500">Claimed At</th>
                    <th className="text-center px-3 py-2 font-semibold text-slate-500">Prompts</th>
                    <th className="text-left px-3 py-2 font-semibold text-slate-500">Status</th>
                    <th className="text-left px-3 py-2 font-semibold text-slate-500">ChatGPT</th>
                    <th className="text-left px-3 py-2 font-semibold text-slate-500">Google AIO</th>
                    <th className="text-left px-3 py-2 font-semibold text-slate-500">Claude</th>
                    <th className="text-left px-3 py-2 font-semibold text-slate-500">Duration</th>
                    <th className="text-left px-3 py-2 font-semibold text-slate-500">Mentions</th>
                  </tr>
                </thead>
                <tbody>
                  {waveChunks.map((chunk, idx) => renderChunkRow(chunk, idx))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      );
    };

    return (
      <div className="mb-6">
        <h2 className="text-sm font-bold text-slate-700 mb-4 uppercase tracking-wide">A — Chunk Timeline</h2>
        {renderWaveSection('Wave 1 — First 6 prompts (ChatGPT gate)', wave1Chunks, 1)}
        {renderWaveSection('Wave 2 — Remaining 24 prompts', wave2Chunks, 2)}
      </div>
    );
  };

  // ── Table B: EOD Events ───────────────────────────────────────────────────
  const renderEodTable = () => {
    if (!detail?.report) return null;
    const { report } = detail;

    const phase1Done = !!report.share_of_voice_data?.calculated_at;
    const phase2Done = !report.is_partial && report.status === 'completed';

    const rows = [
      {
        phase: 'Phase 1',
        triggeredAt: report.share_of_voice_data?.calculated_at || null,
        visibilityScore: phase1Done ? report.visibility_score : null,
        entities: phase1Done ? (report.share_of_voice_data?.entities?.length || 0) : null,
        chatGptOk: phase1Done ? report.chatgpt_ok : null,
        googleOk: phase1Done ? report.google_ai_overview_ok : null,
        claudeOk: phase1Done ? report.claude_ok : null,
        reportStatusAfter: phase1Done ? `${report.status} (partial)` : null,
        done: phase1Done,
      },
      {
        phase: 'Phase 2',
        triggeredAt: report.completed_at,
        visibilityScore: phase2Done ? report.visibility_score : null,
        entities: phase2Done ? (report.share_of_voice_data?.entities?.length || 0) : null,
        chatGptOk: phase2Done ? report.chatgpt_ok : null,
        googleOk: phase2Done ? report.google_ai_overview_ok : null,
        claudeOk: phase2Done ? report.claude_ok : null,
        reportStatusAfter: phase2Done ? 'completed (full)' : null,
        done: phase2Done,
      },
    ];

    return (
      <div className="mb-6">
        <h2 className="text-sm font-bold text-slate-700 mb-3 uppercase tracking-wide">B — EOD Events</h2>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-3 py-2 font-semibold text-slate-500">Phase</th>
                <th className="text-left px-3 py-2 font-semibold text-slate-500">Triggered At</th>
                <th className="text-left px-3 py-2 font-semibold text-slate-500">Visibility Score</th>
                <th className="text-left px-3 py-2 font-semibold text-slate-500">Entities</th>
                <th className="text-left px-3 py-2 font-semibold text-slate-500">GPT OK</th>
                <th className="text-left px-3 py-2 font-semibold text-slate-500">AIO OK</th>
                <th className="text-left px-3 py-2 font-semibold text-slate-500">Claude OK</th>
                <th className="text-left px-3 py-2 font-semibold text-slate-500">Report Status After</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.phase} className="border-b border-gray-100">
                  <td className="px-3 py-2 font-semibold text-slate-700">{row.phase}</td>
                  <td className="px-3 py-2 text-slate-600 font-mono">{row.done ? fmt(row.triggeredAt) : <span className="text-slate-300">Pending</span>}</td>
                  <td className="px-3 py-2">{row.visibilityScore != null ? <span className="font-bold text-indigo-700">{parseFloat(row.visibilityScore).toFixed(1)}</span> : <span className="text-slate-300">—</span>}</td>
                  <td className="px-3 py-2 text-slate-600">{row.entities != null ? row.entities : <span className="text-slate-300">—</span>}</td>
                  <td className="px-3 py-2">{row.chatGptOk != null ? <span className="text-emerald-600 font-semibold">{row.chatGptOk}</span> : <span className="text-slate-300">—</span>}</td>
                  <td className="px-3 py-2">{row.googleOk != null ? <span className="text-blue-600 font-semibold">{row.googleOk}</span> : <span className="text-slate-300">—</span>}</td>
                  <td className="px-3 py-2">{row.claudeOk != null ? <span className="text-violet-600 font-semibold">{row.claudeOk}</span> : <span className="text-slate-300">—</span>}</td>
                  <td className="px-3 py-2 text-slate-600">{row.reportStatusAfter || <span className="text-slate-300">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // ── Table C: Platform summary ─────────────────────────────────────────────
  const renderPlatformTable = () => {
    if (!detail) return null;
    const { prompts, report } = detail;
    const total = prompts.length;

    const rows = [
      {
        platform: 'ChatGPT',
        color: 'text-emerald-600',
        done: prompts.filter(p => p.results.hasChat).length,
        status: report?.chatgpt_status,
      },
      {
        platform: 'Google AIO',
        color: 'text-blue-600',
        done: prompts.filter(p => p.results.hasGoogle).length,
        status: report?.google_ai_overview_status,
      },
      {
        platform: 'Claude',
        color: 'text-violet-600',
        done: prompts.filter(p => p.results.hasClaude).length,
        status: report?.claude_status,
      },
    ];

    return (
      <div className="mb-6">
        <h2 className="text-sm font-bold text-slate-700 mb-3 uppercase tracking-wide">C — Platform Execution</h2>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-3 py-2 font-semibold text-slate-500">Platform</th>
                <th className="text-left px-3 py-2 font-semibold text-slate-500">Prompts Run</th>
                <th className="text-left px-3 py-2 font-semibold text-slate-500">Coverage</th>
                <th className="text-left px-3 py-2 font-semibold text-slate-500">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.platform} className="border-b border-gray-100">
                  <td className={`px-3 py-2 font-semibold ${row.color}`}>{row.platform}</td>
                  <td className="px-3 py-2 text-slate-700">{row.done} / {total}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-current rounded-full" style={{ width: `${total > 0 ? (row.done / total) * 100 : 0}%`, color: 'inherit' }} />
                      </div>
                      <span className="text-slate-500">{total > 0 ? Math.round((row.done / total) * 100) : 0}%</span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {row.status ? <StatusBadge status={row.status} /> : <span className="text-slate-300 text-xs">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // ── Table D: Schedule Injection ───────────────────────────────────────────
  const renderScheduleTable = () => {
    if (!detail) return null;
    const { scheduleInjection, brand } = detail;
    const injected = scheduleInjection.schedules.length > 0;

    return (
      <div className="mb-6">
        <h2 className="text-sm font-bold text-slate-700 mb-3 uppercase tracking-wide">D — Schedule Injection</h2>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {!injected ? (
            <div className="px-4 py-4 text-xs text-slate-400 italic">
              {brand.firstReportStatus !== 'succeeded'
                ? 'Pending — runs after wave 2 finalizes (Phase 2 EOD complete)'
                : 'No schedules injected (check injectBrandIntoTomorrowSchedule logs)'}
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold text-slate-500">Batch</th>
                  <th className="text-left px-3 py-2 font-semibold text-slate-500">Execution Time</th>
                  <th className="text-left px-3 py-2 font-semibold text-slate-500">Batch Size</th>
                  <th className="text-left px-3 py-2 font-semibold text-slate-500">Status</th>
                  <th className="text-left px-3 py-2 font-semibold text-slate-500">BME Rows</th>
                </tr>
              </thead>
              <tbody>
                {scheduleInjection.schedules.map((s: any, i: number) => (
                  <tr key={s.id} className="border-b border-gray-100">
                    <td className="px-3 py-2 text-slate-500">#{i + 1}</td>
                    <td className="px-3 py-2 font-mono text-slate-700">{fmt(s.execution_time)}</td>
                    <td className="px-3 py-2 text-slate-700">{s.batch_size}</td>
                    <td className="px-3 py-2"><StatusBadge status={s.status} /></td>
                    <td className="px-3 py-2 text-slate-600">{i === 0 ? `${scheduleInjection.bmeCount} total` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  };

  // ── Incident log ──────────────────────────────────────────────────────────
  const renderIncidentLog = () => {
    if (!detail?.incidents.length) return null;
    const { incidents } = detail;

    const iconFor = (event: string) => {
      if (event.includes('complete') || event.includes('complete')) return <CheckCircle size={12} className="text-emerald-500 mt-0.5 shrink-0" />;
      if (event.includes('timeout') || event.includes('Timeout')) return <Clock size={12} className="text-amber-500 mt-0.5 shrink-0" />;
      if (event.includes('EOD')) return <Zap size={12} className="text-indigo-500 mt-0.5 shrink-0" />;
      if (event.includes('Onboarding complete')) return <CheckCircle size={12} className="text-emerald-600 mt-0.5 shrink-0" />;
      return <Activity size={12} className="text-slate-400 mt-0.5 shrink-0" />;
    };

    return (
      <div className="mb-6">
        <h2 className="text-sm font-bold text-slate-700 mb-3 uppercase tracking-wide">E — Incident Log</h2>
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {incidents.map((inc, i) => (
            <div key={i} className="flex items-start gap-3 px-4 py-2.5">
              {iconFor(inc.event)}
              <span className="font-mono text-xs text-slate-400 shrink-0 w-20">{fmt(inc.time)}</span>
              <span className="text-xs font-semibold text-slate-700 w-40 shrink-0">{inc.event}</span>
              <span className="text-xs text-slate-500">{inc.detail}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <div className="max-w-[1280px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Onboarding Forensic</h1>
          <p className="text-xs text-slate-400 mt-0.5">Per-brand onboarding timeline, chunk execution, and EOD events</p>
        </div>
        <div className="flex items-center gap-3">
          {lastRefresh && (
            <span className="text-xs text-slate-400">Refreshed {fmtAgo(lastRefresh.toISOString())}</span>
          )}
          <button
            onClick={() => selectedBrandId && fetchData(selectedBrandId)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
          >
            {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            Refresh
          </button>
        </div>
      </div>

      {/* Brand selector */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="flex items-center gap-4 flex-wrap">
          <label className="text-xs font-semibold text-slate-500 shrink-0">Brand</label>
          <select
            value={selectedBrandId}
            onChange={e => handleBrandChange(e.target.value)}
            className="flex-1 min-w-0 px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
          >
            <option value="">Select a brand…</option>
            {brands.map(b => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.domain}) — {b.userEmail} — {new Date(b.createdAt).toLocaleDateString()}
              </option>
            ))}
          </select>
          {detail && (
            <div className="flex items-center gap-2 shrink-0">
              <StatusBadge status={detail.brand.firstReportStatus} />
              {detail.brand.onboardingPhase > 0 && (
                <span className="text-xs text-slate-400">Phase {detail.brand.onboardingPhase}</span>
              )}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 mb-4 flex items-center gap-2">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {loading && !detail && (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <Loader2 size={24} className="animate-spin mr-2" /> Loading…
        </div>
      )}

      {detail && (
        <>
          {renderSummaryCards()}
          {renderChunksTable()}
          {renderEodTable()}
          {renderPlatformTable()}
          {renderScheduleTable()}
          {renderIncidentLog()}
        </>
      )}
    </div>
  );
};
