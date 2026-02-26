import React, { useState, useEffect, Fragment } from 'react';
import {
  RefreshCw, Loader2, AlertCircle, CheckCircle, Clock,
  ChevronDown, ChevronRight, Lock
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface SessionAttempt {
  chatgpt_account_email: string;
  browserless_session_id: string | null;
  proxy_used: string | null;
  timestamp: string;
  connection_status: string;
  visual_state: string | null;
  operation_type: string;
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
}

interface ScheduleItem {
  id: string;
  schedule_date: string;
  batch_number: number;
  execution_time: string;
  status: string;
  batch_size: number;
  account_assigned: string | null;
  proxy_assigned: string | null;
  account_last_visual_state: string | null;
  session_id_assigned: string | null;
  prompts: PromptDetail[];
}

interface StorageStateHealth {
  extractionPc: string;
  pcAccess: string;
  chatgptAccount: string;
  proxy: string;
  age: number | null;
  status: string;
  lastSuccess: string | null;
  visualStateTrend: string;
  actionNeeded: string;
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

// ─── Main Component ───────────────────────────────────────────────────────────

export const ForensicPage: React.FC = () => {
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
      const res = await fetch('/api/admin/forensic', {
        headers: { 'x-forensic-password': 'Korneret' },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const json = await res.json();
      setData(json);
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
      const res = await fetch('http://135.181.203.202:3001/initialize-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountEmail, secret: 'your-secret-key-here' }),
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
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-200 rounded-2xl text-xs font-bold text-slate-600 hover:border-gray-300 transition-all shadow-sm disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
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
                    {['Extraction PC', 'PC Access', 'ChatGPT Account', 'Proxy', 'Age (Days)', 'Status', 'Last Success', 'Visual State Trend', 'Action Needed'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.storageStateHealth.length === 0 ? (
                    <tr><td colSpan={9} className="text-center px-4 py-8 text-sm text-slate-400">No storage state data found</td></tr>
                  ) : data.storageStateHealth.map((s, i) => (
                    <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3 font-semibold text-slate-700 text-xs">{s.extractionPc}</td>
                      <td className="px-4 py-3 text-slate-400 text-xs">{s.pcAccess || '-'}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{s.chatgptAccount}</td>
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
                      <td className="px-4 py-3 text-xs text-slate-400">{s.actionNeeded || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Table B: Session Matrix ── */}
          <div className="bg-white rounded-[32px] border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-8 py-6 border-b border-gray-100">
              <h2 className="text-base font-black text-slate-900 uppercase tracking-wide">Table B: Active/Recent Session Matrix</h2>
              <p className="text-xs text-slate-400 mt-1">Last 24 hours of Browserless session connection attempts</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    {['Timestamp', 'Account', 'Session ID', 'Proxy', 'Connection', 'Visual State', 'Operation', 'Error', 'Action'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.sessionMatrix.length === 0 ? (
                    <tr><td colSpan={9} className="text-center px-4 py-8 text-sm text-slate-400">No session attempts in last 24 hours</td></tr>
                  ) : data.sessionMatrix.map((session, i) => (
                    <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">
                        {new Date(session.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">{session.chatgpt_account_email}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500 max-w-[120px] truncate" title={session.browserless_session_id || ''}>
                        {session.browserless_session_id ? session.browserless_session_id.substring(0, 12) + '…' : 'N/A'}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{session.proxy_used || 'N/A'}</td>
                      <td className="px-4 py-3"><StatusBadge status={session.connection_status} /></td>
                      <td className="px-4 py-3"><VisualStateBadge state={session.visual_state} /></td>
                      <td className="px-4 py-3 text-xs text-slate-500">{session.operation_type}</td>
                      <td className="px-4 py-3 text-xs text-slate-400 max-w-[180px] truncate" title={session.connection_error_raw || ''}>
                        {session.connection_error_raw || '-'}
                      </td>
                      <td className="px-4 py-3">
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
              const totalPrompts = q.reduce((sum, s) => sum + (s.batch_size || 0), 0);
              const uniqueAccounts = new Set(q.map(s => s.account_assigned).filter(Boolean));
              const uniqueProxies = new Set(q.map(s => s.proxy_assigned).filter(Boolean));
              return (
                <div className="flex items-center gap-6 px-8 py-4 bg-slate-50 border-b border-gray-100">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Prompts</span>
                    <span className="text-2xl font-black text-slate-800">{totalPrompts}</span>
                    <span className="text-[10px] text-slate-400">across {q.length} {q.length === 1 ? 'batch' : 'batches'}</span>
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
                    {['Execution Time', 'Batch #', 'Prompts', 'Status', 'Account', 'Proxy', 'State'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.schedulingQueue.length === 0 ? (
                    <tr><td colSpan={8} className="text-center px-4 py-8 text-sm text-slate-400">No upcoming batches scheduled</td></tr>
                  ) : data.schedulingQueue.map(schedule => {
                    const isExpanded = expandedBatches.has(schedule.id);
                    const uniqueBrands = new Set(schedule.prompts.map(p => p.brand_name));
                    return (
                      <Fragment key={schedule.id}>
                        <tr
                          className="border-b border-gray-50 hover:bg-gray-50/50 cursor-pointer transition-colors"
                          onClick={() => toggleBatch(schedule.id)}
                        >
                          <td className="px-3 py-3">
                            {isExpanded
                              ? <ChevronDown size={14} className="text-slate-400" />
                              : <ChevronRight size={14} className="text-slate-400" />}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-500 whitespace-nowrap">{fmt(schedule.execution_time)}</td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-gray-100 text-slate-600 border border-gray-200">
                              Batch #{schedule.batch_number}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-1">
                              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-700 w-fit">
                                {schedule.batch_size} {schedule.batch_size === 1 ? 'prompt' : 'prompts'}
                              </span>
                              <span className="text-[11px] text-slate-400">{uniqueBrands.size} {uniqueBrands.size === 1 ? 'brand' : 'brands'}</span>
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
                          <td className="px-4 py-3"><VisualStateBadge state={schedule.account_last_visual_state} /></td>
                        </tr>
                        {isExpanded && schedule.prompts.map((prompt, idx) => (
                          <tr key={`${schedule.id}-${prompt.id}`} className="bg-slate-50/70 border-b border-slate-100">
                            <td className="px-3 py-2"></td>
                            <td className="px-4 py-2 pl-8" colSpan={2}>
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] text-slate-400">#{idx + 1}</span>
                                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-gray-100 text-slate-600 border border-gray-200">{prompt.brand_name}</span>
                              </div>
                            </td>
                            <td className="px-4 py-2" colSpan={4}>
                              <div className="text-xs text-slate-600 max-w-2xl">
                                {prompt.prompt_text.length > 150 ? prompt.prompt_text.substring(0, 150) + '…' : prompt.prompt_text}
                              </div>
                            </td>
                            <td className="px-4 py-2">
                              <span className="text-[11px] text-slate-400">{prompt.user_email}</span>
                            </td>
                          </tr>
                        ))}
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
