import React, { useState, useEffect, Fragment } from 'react';
import {
  RefreshCw, Loader2, AlertCircle, CheckCircle, Clock,
  ChevronDown, ChevronRight, Lock
} from 'lucide-react';
import { supabase } from '../lib/supabase';

// ─── Types ───────────────────────────────────────────────────────────────────

interface SessionAttempt {
  chatgpt_account_email: string;
  browserless_session_id: string | null;
  proxy_used: string | null;
  timestamp: string;
  connection_status: string;
  visual_state: string | null;
  operation_type: string;
  batch_id: string | null;
  connection_error_raw: string | null;
}

interface CitationTrace {
  id: string;
  timestamp: string;
  brandName: string;
  promptText: string;
  responseLength: number;
  citationsExtracted: number;
  citationRate: number;
}

interface PromptDetail {
  id: string;
  prompt_text: string;
  brand_name: string;
  brand_id: string;
  user_email: string;
  aio_status: string;
  claude_status: string;
}

interface ModelExecution {
  status: string;
  prompts_attempted: number;
  prompts_ok: number;
  prompts_no_result: number;
  prompts_failed: number;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
}

interface ScheduleItem {
  id: string;
  schedule_date: string;
  batch_number: number;
  execution_time: string;
  status: string;
  batch_size: number;
  batch_type?: string;
  onboarding_brand_name?: string | null;
  onboarding_user_email?: string | null;
  account_assigned: string | null;
  proxy_assigned: string | null;
  account_last_visual_state: string | null;
  session_id_assigned: string | null;
  prompts: PromptDetail[];
  modelExecutions: {
    chatgpt: ModelExecution | null;
    google_ai_overview: ModelExecution | null;
    claude: ModelExecution | null;
  };
}

interface StorageStateHealth {
  extractionPc: string;
  chatgptAccount: string;
  isEligible: boolean;
  proxy: string;
  age: number | null;
  status: string;
  lastSuccess: string | null;
  visualStateTrend: string;
  convs24h: number;
  prompts24h: number;
}

interface ForensicData {
  storageStateHealth: StorageStateHealth[];
  sessionMatrix: SessionAttempt[];
  citationTrace: CitationTrace[];
  schedulingQueue: ScheduleItem[];
}

// ─── Badge helpers ────────────────────────────────────────────────────────────

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const s = status.toLowerCase();
  if (s === 'connected')
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-700"><CheckCircle size={11} />Connected</span>;
  if (s === 'error' || s === 'failed')
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-700"><AlertCircle size={11} />Error</span>;
  if (s === 'timeout')
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-700"><Clock size={11} />Timeout</span>;
  if (s === 'locked')
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-orange-100 text-orange-700"><AlertCircle size={11} />Locked</span>;
  if (s === 'terminated')
    return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-gray-100 text-gray-600">Terminated</span>;
  return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-gray-100 text-gray-600 border border-gray-200">{status}</span>;
};

const VisualStateBadge: React.FC<{ state: string | null }> = ({ state }) => {
  if (!state) return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-gray-100 text-gray-500 border border-gray-200">Unknown</span>;
  if (state === 'Logged_In')
    return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-700">Logged In</span>;
  if (state === 'Sign_In_Button')
    return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-700">Sign In Button</span>;
  if (state === 'Captcha')
    return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-yellow-100 text-yellow-700">Captcha</span>;
  if (state === 'Blank')
    return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-gray-100 text-gray-600">Blank</span>;
  return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-gray-100 text-gray-600 border border-gray-200">{state}</span>;
};

const ApiModelBadge: React.FC<{ status: string }> = ({ status }) => {
  if (status === 'ok')
    return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-700">OK</span>;
  if (status === 'no_result')
    return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-gray-100 text-slate-500">No Result</span>;
  if (status === 'rate_limit')
    return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-orange-100 text-orange-700">Rate Limit</span>;
  if (status === 'credit_error')
    return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-700">No Credits</span>;
  if (status === 'error')
    return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-700">Error</span>;
  // not_run or unknown
  return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-gray-100 text-slate-400 border border-gray-200">—</span>;
};

const ModelExecBadge: React.FC<{ exec: ModelExecution | null }> = ({ exec }) => {
  if (!exec) return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-gray-100 text-slate-300 border border-gray-200">—</span>;
  const { status, prompts_ok, prompts_attempted, prompts_no_result, prompts_failed, error_message } = exec;
  if (status === 'pending')
    return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-gray-100 text-slate-500 border border-gray-200">Pending</span>;
  if (status === 'running')
    return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-700 animate-pulse">Running</span>;
  if (status === 'skipped')
    return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-400" title={error_message || 'Skipped — no daily report found'}>Skipped</span>;
  if (status === 'stalled')
    return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-orange-100 text-orange-700" title="Still marked running after 30+ minutes — likely crashed">Stalled</span>;
  if (status === 'failed') {
    const failTooltip = error_message
      ? error_message
      : `All ${prompts_attempted || 0} prompt${(prompts_attempted || 0) !== 1 ? 's' : ''} failed`;
    return (
      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-700 cursor-help" title={failTooltip}>
        Failed ⓘ
      </span>
    );
  }
  if (status === 'completed') {
    const all = prompts_attempted || 0;
    const ok = prompts_ok || 0;
    const noResult = prompts_no_result || 0;
    const failed = prompts_failed || 0;
    const parts = [`${ok} ok`];
    if (noResult > 0) parts.push(`${noResult} no result`);
    if (failed > 0) parts.push(`${failed} failed`);
    parts.push(`${all} total`);
    const tooltip = parts.join(' · ');
    const color = ok === all ? 'bg-emerald-100 text-emerald-700' : ok > 0 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';
    return <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${color} cursor-help`} title={tooltip}>{ok}/{all} OK</span>;
  }
  return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-gray-100 text-slate-400">{status}</span>;
};

// ─── Main Component ───────────────────────────────────────────────────────────

export const ForensicPage: React.FC<{ onNavigateToOnboardingForensic?: () => void }> = ({ onNavigateToOnboardingForensic }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const [data, setData] = useState<ForensicData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set());
  const [reinitializing, setReinitializing] = useState<string | null>(null);

  const toggleBatch = (batchId: string) => {
    setExpandedBatches(prev => {
      const next = new Set(prev);
      if (next.has(batchId)) next.delete(batchId); else next.add(batchId);
      return next;
    });
  };

  useEffect(() => {
    if (localStorage.getItem('forensic_authenticated') === 'true') setIsAuthenticated(true);
  }, []);

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === 'Korneret') {
      setIsAuthenticated(true);
      setPasswordError(false);
      localStorage.setItem('forensic_authenticated', 'true');
    } else {
      setPasswordError(true);
      setPassword('');
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      // All data fetched via server-side API using service role key (bypasses RLS for global visibility)
      const res = await fetch(`/api/admin/forensic?t=${Date.now()}`, {
        headers: { 'x-forensic-password': 'Korneret' },
        cache: 'no-store',
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const json = await res.json();
      const parsed = json.data ?? json;

      // Fetch BME data directly from Supabase (browser-side, bypasses all API/Next.js caching)
      try {
        const today = new Date().toISOString().split('T')[0];
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

        const { data: schedRows } = await supabase
          .from('daily_schedules')
          .select('id')
          .gte('schedule_date', yesterday)
          .lte('schedule_date', today);

        const scheduleIds = (schedRows || []).map((s: any) => s.id);

        if (scheduleIds.length > 0) {
          const { data: bmeRows } = await supabase
            .from('batch_model_executions')
            .select('schedule_id, model, status, prompts_attempted, prompts_ok, prompts_no_result, prompts_failed, started_at, completed_at, error_message')
            .in('schedule_id', scheduleIds);

          const bmeMap: Record<string, Record<string, any>> = {};
          for (const row of (bmeRows || []) as any[]) {
            if (!bmeMap[row.schedule_id]) bmeMap[row.schedule_id] = {};
            bmeMap[row.schedule_id][row.model] = row;
          }

          const stalledCutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
          const normBME = (row: any) => {
            if (!row) return null;
            const status = (row.status === 'running' && row.started_at && row.started_at < stalledCutoff) ? 'stalled' : row.status;
            return { ...row, status };
          };

          for (const s of (parsed.schedulingQueue || [])) {
            const bme = bmeMap[s.id] || {};
            s.modelExecutions = {
              chatgpt:            normBME(bme['chatgpt'] || null),
              google_ai_overview: normBME(bme['google_ai_overview'] || null),
              claude:             normBME(bme['claude'] || null),
            };
          }
        }
      } catch (_bmeErr) {
        // silently ignore — badges show as dashes if this fails
      }

      setData(parsed);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleReinitialize = async (accountEmail: string) => {
    try {
      setReinitializing(accountEmail);
      setError(null);
      const res = await fetch('/api/admin/reinit-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountEmail }),
      });
      if (!res.ok) throw new Error(`Webhook returned ${res.status}`);
      await fetchData();
      alert(`✅ Session re-initialized for ${accountEmail}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(`Re-initialization failed: ${msg}`);
      alert(`❌ Re-initialization failed: ${msg}`);
    } finally {
      setReinitializing(null);
    }
  };

  useEffect(() => {
    if (isAuthenticated) fetchData();
  }, [isAuthenticated]);

  const fmt = (ts: string) =>
    new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  // ── Password gate ─────────────────────────────────────────────────────────
  if (!isAuthenticated) {
    return (
      <div className="max-w-md mx-auto mt-20 animate-fadeIn pb-12">
        <div className="bg-white rounded-[32px] border border-gray-200 shadow-sm p-10 text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto">
            <Lock size={28} className="text-gray-400" />
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-black text-slate-900 tracking-tight uppercase">Forensic Visibility Panel</h2>
            <p className="text-sm text-slate-500">This page is password protected.</p>
          </div>
          <form onSubmit={handlePasswordSubmit} className="space-y-4 text-left">
            <input
              type="password"
              placeholder="Enter password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoFocus
              className={`w-full px-5 py-3 bg-gray-50 border rounded-2xl outline-none text-sm font-semibold text-slate-700 focus:ring-4 focus:ring-brand-brown/5 focus:border-brand-brown transition-all ${passwordError ? 'border-red-400' : 'border-gray-100'}`}
            />
            {passwordError && <p className="text-xs text-red-500 font-semibold">Incorrect password. Try again.</p>}
            <button type="submit" className="w-full py-3 bg-brand-brown text-white font-black uppercase tracking-widest text-xs rounded-2xl hover:brightness-110 transition-all flex items-center justify-center gap-2">
              <Lock size={14} /> Unlock
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── Main Page ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-fadeIn pb-12">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight uppercase">Forensic Visibility Panel</h1>
          <p className="text-sm text-slate-500 mt-1">Raw operational data for Browserless automation sessions and citation extraction</p>
          {lastRefresh && (
            <p className="text-xs text-slate-400 mt-1">Last refresh: {lastRefresh.toLocaleTimeString()}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onNavigateToOnboardingForensic && (
            <button
              onClick={onNavigateToOnboardingForensic}
              className="flex items-center gap-2 px-4 py-2.5 bg-indigo-50 border border-indigo-200 rounded-2xl text-xs font-bold text-indigo-700 hover:bg-indigo-100 transition-all shadow-sm"
            >
              Onboarding Forensic →
            </button>
          )}
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-200 rounded-2xl text-xs font-bold text-slate-600 hover:border-gray-300 transition-all shadow-sm disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-2xl text-sm text-red-700">
          <AlertCircle size={16} className="shrink-0" />
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && !data && (
        <div className="flex justify-center py-16">
          <Loader2 size={32} className="animate-spin text-slate-300" />
        </div>
      )}

      {data && (
        <>
          {/* ── Table A: Storage State Health ── */}
          <div className="bg-white rounded-[32px] border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-8 py-6 border-b border-gray-100">
              <h2 className="text-base font-black text-slate-900 uppercase tracking-wide">Table A: Storage State Health Monitor</h2>
              <p className="text-xs text-slate-400 mt-1">Current health and lifecycle status of cookie storage states for each ChatGPT account</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    {['Extraction PC', 'ChatGPT Account', 'Eligible', 'Proxy', 'Age (Days)', 'Status', 'Last Success', 'Visual State', 'Convs (24h)', 'Prompts (24h)'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.storageStateHealth.length === 0 ? (
                    <tr><td colSpan={10} className="text-center px-4 py-8 text-sm text-slate-400">No storage state data found</td></tr>
                  ) : data.storageStateHealth.map((s, i) => (
                    <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3 font-semibold text-slate-700 text-xs">{s.extractionPc}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{s.chatgptAccount}</td>
                      <td className="px-4 py-3">
                        {s.isEligible
                          ? <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-700">Eligible</span>
                          : <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-200 text-slate-500">Not Eligible</span>}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{s.proxy}</td>
                      <td className="px-4 py-3 text-center">
                        {s.age !== null ? (
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${s.age <= 3 ? 'bg-emerald-100 text-emerald-700' : s.age <= 5 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                            {s.age}d
                          </span>
                        ) : <span className="text-slate-300">-</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${s.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : s.status === 'Failed' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                          {s.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {s.lastSuccess ? fmt(s.lastSuccess) : <span className="text-slate-300">No success</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">{s.visualStateTrend}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${s.convs24h >= 8 ? 'bg-red-100 text-red-700' : s.convs24h >= 5 ? 'bg-yellow-100 text-yellow-700' : 'bg-slate-100 text-slate-600'}`}>
                          {s.convs24h}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-slate-600 font-mono">{s.prompts24h}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Table B: Session Matrix ── */}
          <div className="bg-white rounded-[32px] border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-8 py-6 border-b border-gray-100">
              <h2 className="text-base font-black text-slate-900 uppercase tracking-wide">Table B: Batch Sessions Connections Matrix</h2>
              <p className="text-xs text-slate-400 mt-1">Last 24 hours of batch connection events</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    {['Batch ID', 'Timestamp', 'Account', 'Session ID', 'Proxy', 'Connection', 'Visual State', 'Operation', 'Error', 'Action'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.sessionMatrix.length === 0 ? (
                    <tr><td colSpan={10} className="text-center px-4 py-8 text-sm text-slate-400">No session attempts in last 24 hours</td></tr>
                  ) : data.sessionMatrix.map((session, i) => (
                    <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-slate-400 whitespace-nowrap">
                        {session.batch_id ? session.batch_id.substring(0, 8) : '-'}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500 whitespace-nowrap">
                        {new Date(session.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">{session.chatgpt_account_email}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500 max-w-[120px] truncate" title={session.browserless_session_id || ''}>
                        {session.browserless_session_id ? session.browserless_session_id.substring(0, 12) + '…' : 'N/A'}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500" title={session.proxy_used || ''}>
                        {session.proxy_used ? session.proxy_used.substring(0, 4) + '…' + session.proxy_used.substring(session.proxy_used.length - 4) : 'N/A'}
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={session.connection_status} /></td>
                      <td className="px-4 py-3"><VisualStateBadge state={session.visual_state} /></td>
                      <td className="px-4 py-3 text-xs text-slate-500">{session.operation_type}</td>
                      <td className="px-4 py-3 text-xs text-slate-400 max-w-[180px] truncate" title={session.connection_error_raw || ''}>
                        {session.connection_error_raw || '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <button
                          onClick={() => handleReinitialize(session.chatgpt_account_email)}
                          disabled={reinitializing === session.chatgpt_account_email}
                          className="flex items-center gap-1 px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-[11px] font-bold text-slate-600 hover:border-gray-300 transition-all disabled:opacity-50"
                        >
                          {reinitializing === session.chatgpt_account_email
                            ? <><Loader2 size={11} className="animate-spin" />Init…</>
                            : <><RefreshCw size={11} />Re-init</>}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Table C: Citation Extraction Tracker ── */}
          <div className="bg-white rounded-[32px] border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-8 py-6 border-b border-gray-100">
              <h2 className="text-base font-black text-slate-900 uppercase tracking-wide">Table C: Citation Extraction Tracker</h2>
              <p className="text-xs text-slate-400 mt-1">Last 50 prompt runs · Citation Rate = % of last 5 runs that extracted citations</p>
            </div>
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white z-10">
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    {['Date', 'Brand', 'Prompt', 'Response', 'Citations', 'Rate'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.citationTrace.length === 0 ? (
                    <tr><td colSpan={6} className="text-center px-4 py-8 text-sm text-slate-400">No citation data found</td></tr>
                  ) : data.citationTrace.map(trace => (
                    <tr key={trace.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-slate-500 whitespace-nowrap">{fmt(trace.timestamp)}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-gray-100 text-slate-600 border border-gray-200">{trace.brandName}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 max-w-[380px]" title={trace.promptText}>
                        <div className="line-clamp-2">{trace.promptText}</div>
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-slate-400 whitespace-nowrap">
                        {(trace.responseLength || 0).toLocaleString()} chars
                      </td>
                      <td className="px-4 py-3 text-center">
                        {trace.citationsExtracted > 0
                          ? <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-700">{trace.citationsExtracted}</span>
                          : <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-gray-100 text-gray-500">0</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs font-black ${trace.citationRate >= 60 ? 'text-emerald-600' : trace.citationRate >= 20 ? 'text-yellow-600' : 'text-red-500'}`}>
                          {trace.citationRate}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Table D: Scheduling Queue ── */}
          <div className="bg-white rounded-[32px] border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-8 py-6 border-b border-gray-100">
              <h2 className="text-base font-black text-slate-900 uppercase tracking-wide">Table D: Scheduling Queue</h2>
              <p className="text-xs text-slate-400 mt-1">Today &amp; tomorrow's batches — click a row to expand and see all prompts</p>

            </div>

            {/* Summary bar */}
            {(() => {
              const q = data.schedulingQueue;
              const pendingQ = q.filter(s => s.status !== 'completed' && s.status !== 'failed');
              const totalPrompts = pendingQ.reduce((sum, s) => sum + (s.batch_size || 0), 0);
              const uniqueAccounts = new Set(q.map(s => s.account_assigned).filter(Boolean));
              const uniqueProxies = new Set(q.map(s => s.proxy_assigned).filter(Boolean));
              const uniqueUsers = new Set(q.flatMap(s => s.prompts.map(p => p.user_email)).filter(e => e && e !== 'Unknown'));
              return (
                <div className="flex items-center gap-6 px-8 py-4 bg-slate-50 border-b border-gray-100">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Prompts</span>
                    <span className="text-2xl font-black text-slate-800">{totalPrompts}</span>
                    <span className="text-[10px] text-slate-400">across {pendingQ.length} {pendingQ.length === 1 ? 'batch' : 'batches'}</span>
                  </div>
                  <div className="w-px h-12 bg-gray-200" />
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Users</span>
                    <span className="text-2xl font-black text-slate-800">{uniqueUsers.size}</span>
                    <span className="text-[10px] text-slate-400">{uniqueUsers.size === 1 ? 'user' : 'users'} in batches</span>
                  </div>
                  <div className="w-px h-12 bg-gray-200" />
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">ChatGPT Accounts</span>
                    <span className="text-2xl font-black text-slate-800">{uniqueAccounts.size}</span>
                    <span className="text-[10px] text-slate-400">{uniqueAccounts.size === 1 ? 'account' : 'accounts'} assigned</span>
                  </div>
                  <div className="w-px h-12 bg-gray-200" />
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Proxies</span>
                    <span className="text-2xl font-black text-slate-800">{uniqueProxies.size}</span>
                    <span className="text-[10px] text-slate-400">{uniqueProxies.size === 1 ? 'proxy' : 'proxies'} in use</span>
                  </div>
                </div>
              );
            })()}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="w-8"></th>
                    {['Done', 'Execution Time', 'Batch #', 'Prompts', 'Status', 'Account', 'Proxy'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400">{h}</th>
                    ))}
                    <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-400">ChatGPT</th>
                    <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-400">Google AIO</th>
                    <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-400">Claude</th>
                  </tr>
                </thead>
                <tbody>
                  {data.schedulingQueue.length === 0 ? (
                    <tr><td colSpan={11} className="text-center px-4 py-8 text-sm text-slate-400">No upcoming batches scheduled</td></tr>
                  ) : data.schedulingQueue.map((schedule, idx) => {
                    const isExpanded = expandedBatches.has(schedule.id);
                    const isOnboarding = schedule.batch_type === 'onboarding';
                    const uniqueBrands = new Set(schedule.prompts.map(p => p.brand_name));
                    const isDone = schedule.status === 'completed' || schedule.status === 'failed';
                    const todayDate = new Date().toISOString().split('T')[0];
                    const prevDate = idx > 0 ? data.schedulingQueue[idx - 1].schedule_date : null;
                    const showDateSeparator = prevDate !== null && prevDate !== schedule.schedule_date && schedule.schedule_date === todayDate;
                    return (
                      <Fragment key={schedule.id}>
                        {showDateSeparator && (
                          <tr>
                            <td colSpan={11} className="px-4 py-3 bg-blue-50/70 border-y border-blue-100">
                              <div className="flex items-center gap-3">
                                <div className="flex-1 h-px bg-blue-200" />
                                <span className="text-[10px] font-black uppercase tracking-widest text-blue-500">
                                  Today's Report &mdash; {new Date(todayDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                                </span>
                                <div className="flex-1 h-px bg-blue-200" />
                              </div>
                            </td>
                          </tr>
                        )}
                        <tr
                          className={`border-b cursor-pointer transition-colors ${
                            isOnboarding
                              ? isDone
                                ? 'border-purple-100 bg-purple-50/30 opacity-60'
                                : 'border-purple-100 bg-purple-50/40 hover:bg-purple-50/70'
                              : isDone
                              ? 'border-gray-50 opacity-50 bg-slate-50/80'
                              : 'border-gray-50 hover:bg-gray-50/50'
                          }`}
                          onClick={() => toggleBatch(schedule.id)}
                        >
                          <td className="px-3 py-3">
                            {isExpanded
                              ? <ChevronDown size={14} className={isOnboarding ? 'text-purple-400' : 'text-slate-400'} />
                              : <ChevronRight size={14} className={isOnboarding ? 'text-purple-400' : 'text-slate-400'} />}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {schedule.status === 'completed'
                              ? <CheckCircle size={14} className="text-emerald-500 mx-auto" />
                              : schedule.status === 'failed'
                              ? <AlertCircle size={14} className="text-red-400 mx-auto" />
                              : <span className="text-slate-200">—</span>}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-500 whitespace-nowrap">{fmt(schedule.execution_time)}</td>
                          <td className="px-4 py-3">
                            {isOnboarding ? (
                              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 text-purple-700 border border-purple-200">
                                ⚡ Onboarding W2
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-gray-100 text-slate-600 border border-gray-200">
                                Batch #{schedule.batch_number}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-1">
                              <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold w-fit ${isOnboarding ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                                {schedule.batch_size} {schedule.batch_size === 1 ? 'prompt' : 'prompts'}
                              </span>
                              {isOnboarding
                                ? <span className="text-[11px] text-purple-500 font-semibold">{schedule.onboarding_brand_name || 'Wave 2'}</span>
                                : <span className="text-[11px] text-slate-400">{uniqueBrands.size} {uniqueBrands.size === 1 ? 'brand' : 'brands'}</span>}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {schedule.status === 'pending' && <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-gray-100 text-slate-600 border border-gray-200">Pending</span>}
                            {schedule.status === 'running' && <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-700">Running</span>}
                            {schedule.status === 'completed' && <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-700">Completed</span>}
                            {schedule.status === 'failed' && <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-700">Failed</span>}
                            {!['pending','running','completed','failed'].includes(schedule.status) && (
                              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-gray-100 text-gray-600">{schedule.status}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500">{schedule.account_assigned || 'N/A'}</td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-400">{schedule.proxy_assigned || 'N/A'}</td>
                          <td className="px-4 py-3">
                            {isOnboarding
                              ? <ModelExecBadge exec={schedule.modelExecutions?.chatgpt ?? null} />
                              : <ModelExecBadge exec={schedule.modelExecutions?.chatgpt ?? null} />}
                          </td>
                          <td className="px-4 py-3">
                            {isOnboarding
                              ? <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-purple-50 text-purple-300 border border-purple-100">N/A</span>
                              : <ModelExecBadge exec={schedule.modelExecutions?.google_ai_overview ?? null} />}
                          </td>
                          <td className="px-4 py-3">
                            {isOnboarding
                              ? <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-purple-50 text-purple-300 border border-purple-100">N/A</span>
                              : <ModelExecBadge exec={schedule.modelExecutions?.claude ?? null} />}
                          </td>
                        </tr>
                        {isExpanded && (
                          isOnboarding ? (
                            <tr className="bg-purple-50/50 border-b border-purple-100">
                              <td className="px-3 py-3"></td>
                              <td colSpan={10} className="px-4 py-3">
                                <div className="flex items-center gap-4">
                                  <span className="text-[11px] font-bold text-purple-600">Brand:</span>
                                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 text-purple-700 border border-purple-200">
                                    {schedule.onboarding_brand_name || 'Unknown'}
                                  </span>
                                  {schedule.onboarding_user_email && (
                                    <>
                                      <span className="text-[11px] font-bold text-purple-600">User:</span>
                                      <span className="text-[11px] text-purple-500">{schedule.onboarding_user_email}</span>
                                    </>
                                  )}
                                  <span className="text-[11px] text-purple-400">· ChatGPT only · Google AIO &amp; Claude run after onboarding completes</span>
                                </div>
                              </td>
                            </tr>
                          ) : schedule.prompts.map((prompt, idx) => (
                            <tr key={`${schedule.id}-${prompt.id}`} className="bg-slate-50/70 border-b border-slate-100">
                              <td className="px-3 py-2"></td>
                              <td className="px-4 py-2 pl-8" colSpan={2}>
                                <div className="flex items-center gap-2">
                                  <span className="text-[11px] text-slate-400">#{idx + 1}</span>
                                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-gray-100 text-slate-600 border border-gray-200">{prompt.brand_name}</span>
                                </div>
                              </td>
                              <td className="px-4 py-2" colSpan={3}>
                                <div className="text-xs text-slate-600 max-w-xl">
                                  {prompt.prompt_text.length > 120 ? prompt.prompt_text.substring(0, 120) + '…' : prompt.prompt_text}
                                </div>
                              </td>
                              <td className="px-4 py-2">
                                <ApiModelBadge status={prompt.aio_status} />
                              </td>
                              <td className="px-4 py-2">
                                <ApiModelBadge status={prompt.claude_status} />
                              </td>
                              <td className="px-4 py-2">
                                <span className="text-[11px] text-slate-400">{prompt.user_email}</span>
                              </td>
                            </tr>
                          ))
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
