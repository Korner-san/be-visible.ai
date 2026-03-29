import React, { useState, useMemo, useEffect } from 'react';
import {
  Search,
  ChevronRight,
  X,
  Target,
  Sparkles,
  Info,
  Settings,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Database,
  History,
  Layout,
  Download,
  Flag,
  Globe,
  ChevronDown,
  ExternalLink,
  FileText,
  List,
  BookOpen,
  MessageCircle,
  Newspaper,
  Video,
  ShoppingBag,
  Shield,
  HelpCircle,
  AlertTriangle
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { PromptStats, MetricType } from '../types';

interface PromptsPageProps {
  prompts: PromptStats[];
  onNavigateToManage: () => void;
  brandId: string | null;
  brandName?: string;
  timeRangeDays: number;
  selectedModels?: string[];
  customDateRange?: { from: string; to: string };
  isLoading?: boolean;
}

const CONTENT_TYPE_LABELS: Record<string, string> = {
  OFFICIAL_DOCS: 'Official docs',
  HOW_TO_GUIDE: 'How-to guide',
  COMPARISON_ANALYSIS: 'Comparison analysis',
  PRODUCT_PAGE: 'Product page',
  THOUGHT_LEADERSHIP: 'Thought leadership',
  CASE_STUDY: 'Case study',
  TECHNICAL_DEEP_DIVE: 'Technical deep dive',
  NEWS_ANNOUNCEMENT: 'News announcement',
  COMMUNITY_DISCUSSION: 'Community discussion',
  VIDEO_CONTENT: 'Video content',
  OTHER_LOW_CONFIDENCE: 'Other',
  UNCLASSIFIED: 'Unclassified',
};

const CONTENT_TYPE_ICONS: Record<string, React.ReactNode> = {
  OFFICIAL_DOCS: <Shield size={14} />,
  HOW_TO_GUIDE: <List size={14} />,
  COMPARISON_ANALYSIS: <FileText size={14} />,
  PRODUCT_PAGE: <ShoppingBag size={14} />,
  THOUGHT_LEADERSHIP: <BookOpen size={14} />,
  CASE_STUDY: <FileText size={14} />,
  TECHNICAL_DEEP_DIVE: <FileText size={14} />,
  NEWS_ANNOUNCEMENT: <Newspaper size={14} />,
  COMMUNITY_DISCUSSION: <MessageCircle size={14} />,
  VIDEO_CONTENT: <Video size={14} />,
  OTHER_LOW_CONFIDENCE: <HelpCircle size={14} />,
  UNCLASSIFIED: <AlertTriangle size={14} />,
};

const formatCategory = (cat: string) => {
  if (!cat) return '';
  return cat
    .split(/[\s_]+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

const HeaderWithInfo = ({ title, info, align = 'right' }: { title: string, info: string, align?: 'left' | 'right' | 'center' }) => {
  return (
    <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'}`}>
      <span className="whitespace-nowrap font-bold">{title}</span>
      <div className="group relative inline-block">
        <Info size={11} className="text-gray-300 cursor-help hover:text-gray-400 transition-colors shrink-0" />
        <div className={`absolute top-full mt-2 hidden group-hover:block w-48 p-3 bg-slate-900 text-white text-[10px] normal-case font-medium rounded-lg shadow-2xl z-50 pointer-events-none leading-relaxed tracking-normal text-left border border-white/10 ${align === 'right' ? 'right-0' : align === 'center' ? 'left-1/2 -translate-x-1/2' : 'left-0'}`}>
          <div className="relative">
            <div className={`absolute -top-4 w-2 h-2 bg-slate-900 rotate-45 border-l border-t border-white/10 ${align === 'right' ? 'right-2' : align === 'center' ? 'left-1/2 -translate-x-1/2' : 'left-2'}`} />
            {info}
          </div>
        </div>
      </div>
    </div>
  );
};

export const PromptsPage: React.FC<PromptsPageProps> = ({ prompts, onNavigateToManage, brandId, brandName, timeRangeDays, selectedModels, customDateRange, isLoading }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set(['Competitive comparison']));
  const [selectedEntity, setSelectedEntity] = useState<{ type: 'prompt' | 'category', data: any, displayName: string } | null>(null);
  const [activeModalTab, setActiveModalTab] = useState<'Citation sources' | 'Ai preference' | 'Sample history'>('Citation sources');
  const [activeChartMetric, setActiveChartMetric] = useState<MetricType>('visibility');
  const [selectedRun, setSelectedRun] = useState<any | null>(null);
  // Popup-local date range (starts at global, can be overridden)
  const [popupDays, setPopupDays] = useState<number>(timeRangeDays);
  const [popupStats, setPopupStats] = useState<any | null>(null);
  const [popupLoading, setPopupLoading] = useState(false);
  const [expandedCitationDomain, setExpandedCitationDomain] = useState<string | null>(null);
  
  const brandTerracotta = '#874B34';
  const brandBrown = '#2C1308';

  // Reset popup days when entity changes, fetch fresh stats
  useEffect(() => {
    if (!selectedEntity || !brandId) { setPopupStats(null); return; }
    setPopupDays(timeRangeDays);
  }, [selectedEntity?.data?.id ?? selectedEntity?.data?.category]);

  useEffect(() => {
    if (!selectedEntity || !brandId) return;
    const promptId = selectedEntity.type === 'prompt' ? selectedEntity.data.id : null;
    if (promptId?.startsWith('p-')) return; // unsaved prompt, no stats
    setPopupLoading(true);
    const modelsParam = selectedModels && selectedModels.length > 0 ? `&models=${selectedModels.join(',')}` : '';
    const dateParams = customDateRange && popupDays === timeRangeDays
      ? `&from=${customDateRange.from}&to=${customDateRange.to}`
      : `&days=${popupDays}`;
    const url = promptId
      ? `/api/prompts/stats?brandId=${brandId}${dateParams}&promptId=${promptId}${modelsParam}`
      : `/api/prompts/stats?brandId=${brandId}${dateParams}${modelsParam}`;
    fetch(url)
      .then(r => r.json())
      .then(data => {
        if (data.success && data.stats) {
          if (promptId) {
            setPopupStats(data.stats[promptId] || null);
          } else {
            // category: aggregate across all prompts in category
            const catPrompts = groupedPrompts[selectedEntity.data.category]?.prompts || [];
            const ids = catPrompts.map((p: PromptStats) => p.id);
            const allStats = ids.map((id: string) => data.stats[id]).filter(Boolean);
            if (allStats.length === 0) { setPopupStats(null); return; }
            setPopupStats({
              visibilityScore: Math.round(allStats.reduce((s: number, x: any) => s + x.visibilityScore, 0) / allStats.length),
              citationShare: Math.round(allStats.reduce((s: number, x: any) => s + x.citationShare, 0) / allStats.length),
              citations: allStats.reduce((s: number, x: any) => s + x.citations, 0),
              history: allStats[0]?.history || [],
              recentResults: allStats.flatMap((x: any) => x.recentResults || []).slice(0, 5),
            });
          }
        }
      })
      .catch(() => {})
      .finally(() => setPopupLoading(false));
  }, [selectedEntity?.data?.id ?? selectedEntity?.data?.category, popupDays, brandId]);

  const toggleTopic = (topic: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(expandedTopics);
    if (next.has(topic)) {
      next.delete(topic);
    } else {
      next.add(topic);
    }
    setExpandedTopics(next);
  };

  const filteredPrompts = prompts.filter(p => 
    p.text.toLowerCase().includes(searchQuery.toLowerCase()) || 
    p.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const groupedPrompts = useMemo(() => {
    return filteredPrompts.reduce((acc, prompt) => {
      if (!acc[prompt.category]) {
        acc[prompt.category] = { prompts: [], stats: { visibility: 0, position: 0, share: 0, trend: 0, citations: 0, citationTrend: 0 } };
      }
      acc[prompt.category].prompts.push(prompt);
      return acc;
    }, {} as Record<string, { prompts: PromptStats[], stats: any }>);
  }, [filteredPrompts]);

  const categories = Object.keys(groupedPrompts);

  categories.forEach(cat => {
    const group = groupedPrompts[cat];
    const count = group.prompts.length;
    if (count > 0) {
      group.stats.visibility = Math.round(group.prompts.reduce((sum, p) => sum + p.visibilityScore, 0) / count);
      group.stats.position = Number((group.prompts.reduce((sum, p) => sum + p.avgPosition, 0) / count).toFixed(1));
      group.stats.share = Number((group.prompts.reduce((sum, p) => sum + p.citationShare, 0) / count).toFixed(1));
      group.stats.citations = group.prompts.reduce((sum, p) => sum + p.citations, 0);
      group.stats.visibilityTrend = Number((group.prompts.reduce((sum, p) => sum + p.visibilityTrend, 0) / count).toFixed(1));
    }
  });

  const handleSelectPrompt = (prompt: PromptStats) => {
    setSelectedEntity({ type: 'prompt', data: prompt, displayName: prompt.text });
    setActiveChartMetric('visibility');
    setActiveModalTab('Citation sources');
    setSelectedRun(null);
    setExpandedCitationDomain(null);
  };

  const handleSelectCategory = (category: string) => {
    const group = groupedPrompts[category];
    // Create a synthesized data object for the category view
    const categoryData = {
      ...group.stats,
      category: category,
      history: group.prompts[0].history, // Just using first prompt history as sample for group trend
      visibilityScore: group.stats.visibility,
      avgPosition: group.stats.position,
      citationShare: group.stats.share,
      lastRun: group.prompts[0].lastRun,
    };
    setSelectedEntity({ type: 'category', data: categoryData, displayName: formatCategory(category) });
    setActiveChartMetric('visibility');
    setActiveModalTab('Citation sources');
    setSelectedRun(null);
    setExpandedCitationDomain(null);
  };

  const runHistory = useMemo(() => {
    if (!selectedEntity) return [];
    // Prefer popupStats (date-filtered) over static selectedEntity data
    const source = popupStats?.recentResults || (
      selectedEntity.type === 'prompt'
        ? selectedEntity.data.recentResults
        : groupedPrompts[selectedEntity.data.category]?.prompts.flatMap((p: PromptStats) => p.recentResults || []).slice(0, 5)
    );

    if (!source || source.length === 0) return [];

    const providerLabel = (p: string) => {
      if (p === 'google_ai_overview') return 'Google AIO';
      if (p === 'claude') return 'Claude';
      return 'ChatGPT';
    };

    return source.map((r: any) => ({
      id: r.id,
      time: r.date || '—',
      model: providerLabel(r.provider || 'chatgpt'),
      mentioned: r.mentioned,
      position: r.position != null ? r.position : '-',
      promptText: r.promptText,
      response: r.response,
      mentions: [],
      region: '—',
      searchQueries: 'n/a',
      citations: (r.citations || []).map((url: string) => {
        const domain = url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
        return { domain, title: domain, snippet: '', favicon: `https://www.google.com/s2/favicons?domain=${domain}&sz=64` };
      }),
    }));
  }, [selectedEntity, groupedPrompts, popupStats]);

  // Citation domains come directly from the API (full dataset, not just last 5 runs)
  const citationDomains: any[] = popupStats?.citationDomains || [];


  const renderRunDetail = (run: any) => {
    return (
      <div className="animate-fadeIn space-y-8 pb-12">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Execution Detail</span>
          <button className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 text-white text-[10px] font-black rounded hover:bg-slate-800 transition-colors uppercase tracking-widest">
            <Download size={12} /> Export
          </button>
        </div>

        <h1 className="text-2xl font-black text-slate-900 tracking-tight leading-tight max-w-4xl">
          {run.promptText || selectedEntity?.displayName}
        </h1>

        <div className="flex flex-wrap items-center gap-10 py-6 border-y border-gray-300">
          <div className="space-y-1">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Properties</span>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-gray-100 rounded-full flex items-center justify-center p-0.5">
                  <Database size={10} className="text-slate-500" />
                </div>
                <span className="text-xs font-bold text-slate-700">{run.model}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock size={12} className="text-slate-400" />
                <span className="text-xs font-bold text-slate-700">{run.time}</span>
              </div>
              <div className="flex items-center gap-2">
                <Globe size={12} className="text-slate-400" />
                <span className="text-xs font-bold text-slate-700">{run.region}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-2">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Visibility</span>
            <div className="flex items-center gap-3">
              {run.mentioned ? (
                <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                  <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center text-white">
                    <CheckCircle2 size={12} />
                  </div>
                  {brandName || 'Brand'} is mentioned
                </div>
              ) : (
                <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                  <div className="w-5 h-5 rounded-full bg-rose-500 flex items-center justify-center text-white">
                    <XCircle size={12} />
                  </div>
                  {brandName || 'Brand'} is not mentioned
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Mentions</span>
            <div className="flex flex-wrap gap-2">
              {run.mentions.length > 0 ? run.mentions.map((m: string) => (
                <div key={m} className="flex items-center gap-2 px-3 py-1 bg-gray-50 border border-gray-100 rounded-full text-[10px] font-black text-slate-700 uppercase tracking-widest">
                  <div className="w-4 h-4 bg-gray-200 rounded-full" />
                  {m}
                </div>
              )) : <span className="text-xs font-bold text-slate-400 italic">None detected</span>}
            </div>
          </div>
        </div>

        <div className="space-y-4 pt-4">
          <div className="flex items-center gap-2 text-[11px] font-black text-slate-900 uppercase tracking-widest">
            <ChevronDown size={14} /> Response
          </div>
          <div className="p-8 bg-white border border-gray-100 rounded-2xl shadow-sm">
            <MarkdownResponse text={run.response} />
          </div>
        </div>

        {run.citations && run.citations.length > 0 && (
          <div className="space-y-4 pt-4">
            <div className="flex items-center gap-2 text-[11px] font-black text-slate-900 uppercase tracking-widest">
              <ExternalLink size={14} /> Citation Sources ({run.citations.length})
            </div>
            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
              {run.citations.map((cite: any, i: number) => (
                <div key={i} className={`flex items-center gap-4 px-6 py-4 ${i < run.citations.length - 1 ? 'border-b border-gray-100' : ''}`}>
                  <div className="w-7 h-7 rounded-lg bg-white border border-gray-200 flex items-center justify-center p-1 shadow-sm shrink-0">
                    <img src={cite.favicon} className="w-full h-full object-contain" alt={cite.domain} />
                  </div>
                  <span className="text-sm font-bold text-slate-700">{cite.domain}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderTabContent = () => {
    if (!selectedEntity) return null;
    const isGroup = selectedEntity.type === 'category';

    switch (activeModalTab) {
      case 'Citation sources':
        if (popupLoading) return (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-gray-200 border-t-brand-brown rounded-full animate-spin" />
          </div>
        );
        if (citationDomains.length === 0) return (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-8">
            <div className="text-slate-300 mb-3"><ExternalLink size={32} className="mx-auto" /></div>
            <p className="text-sm font-bold text-slate-400">No citation sources found for this period</p>
            <p className="text-xs text-slate-300 mt-1">Citations appear when AI responses include source URLs</p>
          </div>
        );
        return (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm animate-fadeIn">
            <table className="w-full text-left text-[11px] border-collapse">
              <thead className="bg-gray-50/50 text-[9px] font-bold text-gray-400 uppercase tracking-widest border-b-2 border-gray-200">
                <tr>
                  <th className="px-5 py-3 font-bold">Domain</th>
                  <th className="px-4 py-3 font-bold text-center">Unique URLs</th>
                  <th className="px-4 py-3 font-bold text-center">Mentions</th>
                  <th className="px-4 py-3 font-bold text-center">% Total</th>
                  <th className="px-4 py-3 font-bold text-center">Coverage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {citationDomains.map((row: any) => {
                  const isExpanded = expandedCitationDomain === row.domain;
                  return (
                    <React.Fragment key={row.domain}>
                      <tr
                        className="hover:bg-gray-50 transition-colors group cursor-pointer"
                        onClick={() => setExpandedCitationDomain(isExpanded ? null : row.domain)}
                      >
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-7 h-7 rounded-lg bg-white border border-gray-200 flex items-center justify-center shrink-0 shadow-sm group-hover:scale-105 transition-all">
                              <img src={`https://www.google.com/s2/favicons?domain=${row.domain}&sz=64`} className="w-4 h-4 object-contain rounded-sm" alt={row.domain} />
                            </div>
                            <span className="font-bold text-slate-700 text-[13px]">{row.domain}</span>
                            <span className="ml-1 text-[10px] text-slate-400">{isExpanded ? '▲' : '▼'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-center font-bold text-slate-500 tabular-nums text-[13px]">{row.uniqueUrls}</td>
                        <td className="px-4 py-4 text-center font-bold text-slate-500 tabular-nums text-[13px]">{row.mentions}</td>
                        <td className="px-4 py-4 text-center font-black text-slate-900 tabular-nums text-[13px]">{row.pctTotal}%</td>
                        <td className="px-4 py-4 text-center font-bold text-slate-900 text-[13px]">{row.coverage}%</td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-slate-50/70">
                          <td colSpan={5} className="px-5 py-3">
                            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2">URLs cited for this prompt</p>
                            <div className="flex flex-col gap-1">
                              {(row.urls || []).map((url: string, i: number) => (
                                <a
                                  key={i}
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="flex items-center gap-2 text-[11px] text-blue-600 font-medium hover:underline truncate"
                                >
                                  <ExternalLink size={10} className="shrink-0 text-blue-400" />
                                  {url}
                                </a>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      case 'Ai preference': {
        const breakdown = popupStats?.contentTypeBreakdown;
        if (popupLoading) return (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-gray-200 border-t-brand-brown rounded-full animate-spin" />
          </div>
        );
        if (!breakdown || breakdown.length === 0) return (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-8">
            <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center">
              <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-xs font-semibold text-gray-400">Computing your data…</p>
            <p className="text-[10px] text-gray-300 leading-relaxed">Content type analysis will be available after citation classification completes</p>
          </div>
        );
        return (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden animate-fadeIn">
            <table className="w-full text-left text-[11px] table-auto">
              <thead className="bg-white text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100">
                <tr>
                  <th className="px-5 py-3 font-bold">Type</th>
                  <th className="px-3 py-3 font-bold text-right min-w-[60px]">Urls</th>
                  <th className="px-5 py-3 font-bold text-right min-w-[120px]">Visibility share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {breakdown.map((row: any, i: number) => (
                  <tr key={i} className="hover:bg-gray-50/80 transition-all group">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="p-1.5 rounded-lg bg-gray-50 text-slate-400 group-hover:text-brand-brown shadow-sm transition-all border border-gray-100 shrink-0">
                          {CONTENT_TYPE_ICONS[row.category] || <FileText size={14} />}
                        </div>
                        <span className="font-bold text-slate-700 text-[12px] leading-tight">
                          {CONTENT_TYPE_LABELS[row.category] || row.category}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right font-black text-slate-500 tabular-nums text-[12px]">{row.urls}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-3">
                        <span className="font-black text-slate-800 tabular-nums w-8 text-right text-[12px]">{row.percentage}%</span>
                        <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden shrink-0">
                          <div className="h-full transition-all duration-1000 ease-out" style={{ width: `${row.percentage}%`, backgroundColor: '#874B34' }} />
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      case 'Sample history':
        return (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm animate-fadeIn">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/50 text-[9px] font-bold text-gray-400 uppercase tracking-widest border-b-2 border-gray-200">
                  <th className="px-6 py-4 font-bold">Timestamp</th>
                  <th className="px-6 py-4 font-bold">Ai model</th>
                  {isGroup && <th className="px-6 py-4 font-bold">Prompt</th>}
                  <th className="px-6 py-4 text-center font-bold">Mentioned</th>
                  <th className="px-6 py-4 text-center font-bold">Position</th>
                  <th className="px-6 py-4 font-bold">Response</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {runHistory.map((run, i) => (
                  <tr 
                    key={i} 
                    className="hover:bg-slate-50 transition-colors cursor-pointer group"
                    onClick={() => setSelectedRun(run)}
                  >
                    <td className="px-6 py-5">
                      <span className="text-xs font-bold text-slate-500">{run.time}</span>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-2">
                        <Database size={13} className="text-slate-300" />
                        <span className="text-xs font-bold text-slate-700">{run.model}</span>
                      </div>
                    </td>
                    {isGroup && (
                      <td className="px-6 py-5">
                        <span className="text-[11px] font-bold text-slate-700 truncate block max-w-[180px]">{run.promptText}</span>
                      </td>
                    )}
                    <td className="px-6 py-5 text-center">
                      <div className="flex justify-center">
                        {run.mentioned ? (
                          <div className="flex items-center gap-1 text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                            <CheckCircle2 size={10} />
                            <span className="text-[9px] font-black uppercase">Yes</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-rose-500 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-100">
                            <XCircle size={10} />
                            <span className="text-[9px] font-black uppercase">No</span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-5 text-center">
                      <span className={`text-sm font-bold tabular-nums ${run.position === '-' ? 'text-slate-300' : 'text-slate-900'}`}>
                        {run.position === '-' ? '-' : `#${run.position}`}
                      </span>
                    </td>
                    <td className="px-6 py-5 max-w-[200px]">
                      <span className="text-[11px] font-medium text-slate-500 line-clamp-1 italic">
                        {run.response.substring(0, 40)}...
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <>
      {isLoading && (
        <div className="fixed top-0 left-0 right-0 z-50 overflow-hidden" style={{ height: '2px' }}>
          <div
            className="h-full bg-brand-brown"
            style={{
              width: '40%',
              animation: 'prompts-loading-bar 1.2s ease-in-out infinite',
            }}
          />
          <style>{`@keyframes prompts-loading-bar { 0% { transform: translateX(-100%); } 100% { transform: translateX(350%); } }`}</style>
        </div>
      )}
      <div className={`space-y-6 animate-fadeIn pb-20 font-sans relative transition-opacity duration-300 ${isLoading ? 'opacity-50 pointer-events-none select-none' : 'opacity-100'}`}>
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input 
              type="text"
              placeholder="Search prompt library results..."
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-brown/10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button 
            onClick={onNavigateToManage}
            className="flex items-center gap-2 px-5 py-2.5 border-2 border-brand-brown text-brand-brown rounded-xl text-sm font-black hover:bg-brand-brown hover:text-white transition-all shadow-sm"
          >
            <Settings size={18} />
            Manage prompts
          </button>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
          <table className="w-full text-left table-fixed border-collapse">
            <thead className="bg-gray-50/50 text-[9px] font-bold text-gray-400 uppercase tracking-widest border-b-2 border-gray-200 sticky top-0 z-10">
              <tr>
                <th className="w-1/2 px-8 py-4 font-bold">Topic group / prompt</th>
                <th className="w-[15%] px-4 py-4 font-bold text-center">
                  <HeaderWithInfo title="Visibility index" info="Position-weighted visibility index for this query (0–100)." align="center" />
                </th>
                <th className="w-[15%] px-4 py-4 font-bold text-center">
                  <HeaderWithInfo title="Average position" info="Average rank in AI generated lists." align="center" />
                </th>
                <th className="w-[15%] px-4 py-4 font-bold text-center">
                  <HeaderWithInfo title="Mention rate" info="Average number of times your brand is mentioned per AI response." align="center" />
                </th>
                <th className="w-[15%] px-8 py-4 font-bold text-center">
                  <HeaderWithInfo title="Citation share" info="Proportion of citations linking to your site." align="center" />
                </th>
              </tr>
            </thead>
            <tbody>
              {categories.map((topic) => {
                const group = groupedPrompts[topic];
                const isExpanded = expandedTopics.has(topic);
                
                return (
                  <React.Fragment key={topic}>
                    {/* Category Row */}
                    <tr
                      className="group transition-all bg-white border-b border-gray-200 hover:bg-gray-50 cursor-pointer"
                      onClick={() => handleSelectCategory(topic)}
                    >
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-4">
                          <button
                            onClick={(e) => toggleTopic(topic, e)}
                            className={`w-6 h-6 rounded-md flex items-center justify-center transition-all duration-300 border border-gray-200 text-gray-400 hover:text-brand-brown hover:border-brand-brown bg-white shadow-sm ${isExpanded ? 'rotate-90 text-brand-brown border-brand-brown' : ''}`}
                          >
                            <ChevronRight size={12} strokeWidth={3} />
                          </button>
                          <span className="text-[13px] font-black text-slate-700 tracking-tight">
                            {formatCategory(topic)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-5 text-center">
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="font-bold text-slate-900 text-[13px] tabular-nums">{group.stats.visibility}</span>
                          {group.stats.visibilityTrend != null && group.stats.visibilityTrend !== 0 && (
                            <PromptTrendBadge trend={group.stats.visibilityTrend} />
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-5 text-center">
                        <span className="font-bold text-slate-900 text-[13px] tabular-nums">{group.stats.position}</span>
                      </td>
                      <td className="px-4 py-5 text-center">
                        <span className="font-bold text-slate-900 text-[13px] tabular-nums">
                          {group.prompts.length > 0
                            ? Math.round(group.prompts.reduce((s, p) => s + (p.mentionRate || 0), 0) / group.prompts.length)
                            : '—'}%
                        </span>
                      </td>
                      <td className="px-8 py-5 text-center">
                        <span className="font-bold text-slate-900 text-[13px] tabular-nums">{group.stats.share}%</span>
                      </td>
                    </tr>

                    {/* Prompt Rows */}
                    {isExpanded && group.prompts.map((prompt, pIdx) => (
                      <tr
                        key={prompt.id}
                        className={`group hover:bg-slate-50 transition-all cursor-pointer border-l-4 border-l-transparent hover:border-l-brand-brown ${pIdx === group.prompts.length - 1 ? 'border-b border-gray-200' : 'border-b border-gray-100'}`}
                        onClick={() => handleSelectPrompt(prompt)}
                      >
                        <td className="pl-16 pr-8 py-4 text-sm font-semibold text-slate-500 truncate">
                          <div className="flex items-center gap-3">
                            <div className="w-1.5 h-1.5 rounded-full bg-slate-300 group-hover:bg-brand-brown transition-colors"></div>
                            <span className="truncate flex-1">{prompt.text}</span>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="font-bold text-slate-400 group-hover:text-slate-900 transition-colors text-[13px] tabular-nums">{prompt.visibilityScore}</span>
                            {prompt.visibilityTrend !== 0 && (
                              <PromptTrendBadge trend={prompt.visibilityTrend} />
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <span className="font-bold text-slate-400 group-hover:text-slate-900 transition-colors text-[13px] tabular-nums">{prompt.avgPosition}</span>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <span className="font-bold text-slate-400 group-hover:text-slate-900 transition-colors text-[13px] tabular-nums">{prompt.mentionRate}%</span>
                        </td>
                        <td className="px-8 py-4 text-center">
                          <span className="font-bold text-slate-400 group-hover:text-slate-900 transition-colors text-[13px] tabular-nums">{prompt.citationShare}%</span>
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
          
          <div className="py-4 bg-white flex justify-center border-t border-gray-200">
             <button className="text-[10px] font-black text-gray-400 tracking-[0.2em] uppercase hover:text-brand-brown transition-colors">
               Request full audit
             </button>
          </div>
        </div>
      </div>

      {selectedEntity && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-0">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md transition-opacity duration-300" onClick={() => setSelectedEntity(null)} />
          
          <div className="relative w-full max-w-[1280px] bg-white shadow-2xl flex flex-col h-full overflow-hidden animate-slideUp">
            
            <div className="px-12 py-8 flex items-start justify-between shrink-0 bg-white z-10 border-b-2 border-gray-200">
               <div className="space-y-3">
                 <div className="flex items-center gap-4">
                   <span className="px-3 py-1 bg-brand-brown text-white text-[10px] font-black tracking-[0.15em] rounded shadow-sm uppercase">
                     {selectedEntity.type === 'category' ? 'Topic Group' : formatCategory(selectedEntity.data.category)}
                   </span>
                   <div className="flex items-center gap-2 text-slate-400 font-bold text-[11px] tracking-widest">
                     <Clock size={12} className="text-gray-300" />
                     {selectedEntity.type === 'category' ? `Prompts: ${groupedPrompts[selectedEntity.data.category]?.prompts.length}` : `Last run: ${selectedEntity.data.lastRun || '—'}`}
                   </div>
                 </div>
                 {selectedRun ? (
                   <button
                    onClick={() => setSelectedRun(null)}
                    className="text-xs font-black text-brand-brown hover:underline flex items-center gap-1 uppercase tracking-widest"
                   >
                     <ChevronRight size={14} className="rotate-180" /> Back to stats
                   </button>
                 ) : (
                   <h2 className="text-xl font-black text-slate-900 tracking-tight leading-tight max-w-4xl">
                     {selectedEntity.type === 'category' ? (
                       <span className="flex items-center gap-3">
                         <span className="text-slate-400 font-light">Topic Analysis:</span>
                         {selectedEntity.displayName}
                       </span>
                     ) : (
                       selectedEntity.displayName
                     )}
                   </h2>
                 )}
               </div>
               <div className="flex items-center gap-4">
                 {!selectedRun && (
                   <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                     {([7, 30, 90] as const).map(d => (
                       <button
                         key={d}
                         onClick={() => setPopupDays(d)}
                         className={`px-3 py-1.5 rounded-md text-[10px] font-black tracking-widest transition-all ${
                           popupDays === d
                             ? 'bg-white text-brand-brown shadow-sm border border-gray-200'
                             : 'text-slate-400 hover:text-slate-600'
                         }`}
                       >
                         {d}D
                       </button>
                     ))}
                   </div>
                 )}
                 <button
                   onClick={() => setSelectedEntity(null)}
                   className="w-12 h-12 flex items-center justify-center bg-slate-50 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-all border border-gray-100"
                 >
                   <X size={24} strokeWidth={2.5} />
                 </button>
               </div>
            </div>

            <div className="flex-1 overflow-y-auto px-12 space-y-8 scroll-smooth pb-24 pt-8">
               {selectedRun ? (
                 renderRunDetail(selectedRun)
               ) : (
                 <>
                   <div className="grid grid-cols-12 gap-6 items-stretch">
                     <div className="col-span-12 lg:col-span-7 bg-white rounded-[24px] border-2 border-gray-200 shadow-sm p-6 flex flex-col h-[300px]">
                       <div className="flex items-start justify-between mb-2">
                         <span className="text-[10px] font-black text-gray-400 tracking-widest">
                            {activeChartMetric === 'visibility' ? 'Visibility trend' :
                             activeChartMetric === 'avgPosition' ? 'Position trend' :
                             activeChartMetric === 'citationShare' ? 'Citation share trend' : 'Mention rate trend'}
                         </span>
                         <div className="flex items-center gap-2 text-brand-brown font-black text-[10px]">
                           <Sparkles size={12} /> Ai trends
                         </div>
                       </div>
                       <div className="flex-1 w-full min-h-0 pt-2">
                         <ResponsiveContainer width="100%" height="100%">
                           <AreaChart data={popupStats?.history || selectedEntity.data.history} margin={{ left: -25, right: 10, top: 10, bottom: 0 }}>
                              <defs>
                                <linearGradient id="colorVis" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor={brandBrown} stopOpacity={0.05}/>
                                  <stop offset="95%" stopColor={brandBrown} stopOpacity={0}/>
                                </linearGradient>
                              </defs>
                              <CartesianGrid vertical={false} horizontal={true} stroke="#94a3b8" strokeWidth={0.5} strokeDasharray="4 4" />
                              <XAxis 
                                dataKey="date" 
                                tick={{fontSize: 9, fill: '#94a3b8', fontWeight: 600}} 
                                axisLine={false} 
                                tickLine={false} 
                                tickMargin={10}
                              />
                              <YAxis 
                                tick={{fontSize: 9, fill: '#94a3b8', fontWeight: 600}} 
                                axisLine={false} 
                                tickLine={false} 
                                domain={activeChartMetric === 'avgPosition' ? [0, 'auto'] : [0, 100]}
                              />
                              <Tooltip 
                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 8px 16px rgba(0,0,0,0.08)', fontSize: '11px' }}
                                itemStyle={{ color: brandBrown, fontWeight: 800 }}
                              />
                              <Area 
                                type="monotone" 
                                dataKey={activeChartMetric} 
                                stroke={brandBrown} 
                                strokeWidth={3} 
                                fill="url(#colorVis)" 
                                dot={{ r: 3, fill: brandBrown, strokeWidth: 2, stroke: '#fff' }}
                                activeDot={{ r: 5 }}
                                key={activeChartMetric}
                              />
                           </AreaChart>
                         </ResponsiveContainer>
                       </div>
                     </div>

                     <div className="col-span-12 lg:col-span-5 grid grid-cols-2 gap-4">
                       <MetricCard
                         label="Visibility index"
                         value={`${popupStats?.visibilityScore ?? selectedEntity.data.visibilityScore}`}
                         trend={`${(popupStats?.visibilityTrend ?? selectedEntity.data.visibilityTrend) >= 0 ? '+' : ''}${popupStats?.visibilityTrend ?? selectedEntity.data.visibilityTrend} vs prev`}
                         trendColor={(popupStats?.visibilityTrend ?? selectedEntity.data.visibilityTrend) >= 0 ? 'text-emerald-500' : 'text-rose-500'}
                         isDown={(popupStats?.visibilityTrend ?? selectedEntity.data.visibilityTrend) < 0}
                         isHighlighted={activeChartMetric === 'visibility'}
                         onClick={() => setActiveChartMetric('visibility')}
                       />
                       <MetricCard
                         label="Avg position"
                         value={(() => {
                           const pos = popupStats?.avgPosition ?? selectedEntity.data.avgPosition;
                           return pos != null ? pos.toFixed(1) : '—';
                         })()}
                         trend="avg list rank when mentioned"
                         trendColor="text-slate-400"
                         isHighlighted={activeChartMetric === 'avgPosition'}
                         onClick={() => setActiveChartMetric('avgPosition')}
                       />
                       <MetricCard
                         label="Mention rate"
                         value={`${popupStats?.mentionRate ?? selectedEntity.data.mentionRate ?? 0}%`}
                         trend="% of runs brand was mentioned"
                         trendColor="text-slate-400"
                         isHighlighted={activeChartMetric === 'mentionRate'}
                         onClick={() => setActiveChartMetric('mentionRate')}
                       />
                       <MetricCard
                         label="Citation share"
                         value={`${popupStats?.citationShare ?? selectedEntity.data.citationShare}%`}
                         trend="brand citations % of total"
                         trendColor="text-slate-400"
                         isHighlighted={activeChartMetric === 'citationShare'}
                         onClick={() => setActiveChartMetric('citationShare')}
                       />
                     </div>
                   </div>

                   <div className="pt-8">
                     <div className="flex items-center gap-10 mb-6 overflow-x-auto shrink-0 scrollbar-hide">
                       {(['Citation sources', 'Ai preference', 'Sample history'] as const).map((tab) => (
                         <button
                           key={tab}
                           onClick={() => setActiveModalTab(tab)}
                           className={`pb-5 text-[11px] font-black tracking-[0.2em] relative transition-colors ${
                             activeModalTab === tab ? 'text-brand-brown' : 'text-slate-400 hover:text-slate-600'
                           }`}
                         >
                           {tab}
                           
                           {activeModalTab === tab && (
                             <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-brand-brown animate-scaleInHorizontal" />
                           )}
                         </button>
                       ))}
                     </div>

                     {renderTabContent()}
                   </div>
                 </>
               )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// Renders AI response text with markdown-like formatting.
// NOTE: Bold/bullet detection is limited because the ChatGPT executor saves
// plain textContent (no HTML tags). Fixing bold + bullets fully requires the
// executor to extract innerHTML and convert <strong>/<li> to markdown.
const MarkdownResponse: React.FC<{ text: string }> = ({ text }) => {
  if (!text) return null;

  // Render inline **bold** and *italic*
  const renderInline = (str: string): React.ReactNode[] => {
    const parts = str.split(/(\*\*(?:[^*]|\*(?!\*))+\*\*|\*[^*]+\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4)
        return <strong key={i} className="font-semibold text-slate-900">{part.slice(2, -2)}</strong>;
      if (part.startsWith('*') && part.endsWith('*') && part.length > 2)
        return <em key={i} className="italic">{part.slice(1, -1)}</em>;
      return <span key={i}>{part}</span>;
    });
  };

  const lines = text.split('\n');
  const result: React.ReactNode[] = [];
  let ulItems: React.ReactNode[] = [];
  let sectionCount = 0;
  let hasContentBefore = false; // tracks whether any content precedes the first N) section
  let k = 0;

  const flushUl = () => {
    if (ulItems.length) {
      result.push(<ul key={k++} className="my-2 space-y-1.5 list-none p-0">{ulItems}</ul>);
      ulItems = [];
    }
  };

  for (const line of lines) {
    // --- horizontal rule
    if (/^[-*_]{3,}$/.test(line.trim())) {
      flushUl();
      result.push(<hr key={k++} className="my-8 border-gray-200" />);
    }
    // ## Markdown headings
    else if (/^#{1,3} /.test(line)) {
      flushUl();
      hasContentBefore = true;
      const level = line.match(/^(#{1,3})/)![1].length;
      const content = line.replace(/^#{1,3} /, '');
      const cls = level === 1
        ? 'text-2xl font-black text-slate-900 mt-8 mb-3 leading-snug'
        : level === 2
        ? 'text-xl font-black text-slate-900 mt-7 mb-2 leading-snug'
        : 'text-base font-bold text-slate-800 mt-6 mb-2 leading-snug';
      result.push(<div key={k++} className={cls}>{renderInline(content)}</div>);
    }
    // N) or N. numbered section headers — preserve original number
    // Add <hr> before every section: also before section 1 when intro content precedes it
    else if (/^\d+[.)]\s/.test(line)) {
      flushUl();
      sectionCount++;
      const m = line.match(/^(\d+[.)]) (.+)$/);
      if (m) {
        const showHr = sectionCount > 1 || hasContentBefore;
        result.push(
          <div key={k++} className="mt-6">
            {showHr && <hr className="mb-6 border-gray-200" />}
            <div className="flex gap-2.5 items-baseline font-black text-slate-900 leading-snug mb-4" style={{ fontSize: '18px' }}>
              <span className="shrink-0 tabular-nums">{m[1]}</span>
              <span>{renderInline(m[2])}</span>
            </div>
          </div>
        );
      }
    }
    // Short colon-terminated label: "What to include in a dashboard:" — sub-header
    // These lose their bold in plain-text extraction; we restore it by pattern
    else if (/^[A-Z][^:]{5,60}:$/.test(line.trim())) {
      flushUl();
      hasContentBefore = true;
      result.push(
        <p key={k++} className="font-semibold text-slate-900 mt-3 mb-0.5" style={{ fontSize: '15px' }}>
          {renderInline(line.trim())}
        </p>
      );
    }
    // Indented sub-bullet (2+ spaces + - or *)
    else if (/^ {2,}[-*] /.test(line)) {
      const content = line.replace(/^ +[-*] /, '');
      ulItems.push(
        <li key={k++} className="flex items-start gap-2 text-slate-600 ml-5" style={{ fontSize: '16px', lineHeight: '1.6' }}>
          <span className="mt-[9px] shrink-0 w-1 h-1 rounded-full bg-slate-300 inline-block" />
          <span>{renderInline(content)}</span>
        </li>
      );
    }
    // Top-level bullet: - item or * item
    else if (/^[-*•] /.test(line)) {
      hasContentBefore = true;
      const content = line.replace(/^[-*•] /, '');
      ulItems.push(
        <li key={k++} className="flex items-start gap-2.5 text-slate-700" style={{ fontSize: '16px', lineHeight: '1.6' }}>
          <span className="mt-[10px] shrink-0 w-1.5 h-1.5 rounded-full bg-slate-500 inline-block" />
          <span>{renderInline(content)}</span>
        </li>
      );
    }
    // Em-dash item: "Short lead – description" → bold lead, bullet point
    else if (line.length < 160 && /^.{1,50}\s[–—]\s/.test(line)) {
      hasContentBefore = true;
      const m = line.match(/^(.{1,50}?)\s([–—])\s(.+)$/);
      if (m) {
        ulItems.push(
          <li key={k++} className="flex items-start gap-2.5 text-slate-700" style={{ fontSize: '16px', lineHeight: '1.6' }}>
            <span className="mt-[10px] shrink-0 w-1.5 h-1.5 rounded-full bg-slate-500 inline-block" />
            <span>
              <strong className="font-semibold text-slate-900">{renderInline(m[1])}</strong>
              {' '}{m[2]}{' '}
              {renderInline(m[3])}
            </span>
          </li>
        );
      } else {
        flushUl();
        result.push(<p key={k++} className="mb-2 text-slate-700" style={{ fontSize: '16px', lineHeight: '1.6' }}>{renderInline(line)}</p>);
      }
    }
    // Empty line
    else if (line.trim() === '') {
      flushUl();
    }
    // Regular paragraph
    else {
      flushUl();
      hasContentBefore = true;
      result.push(<p key={k++} className="mb-2 text-slate-700" style={{ fontSize: '16px', lineHeight: '1.6' }}>{renderInline(line)}</p>);
    }
  }
  flushUl();

  return <div className="space-y-4">{result}</div>;
};

const PromptTrendBadge = ({ trend }: { trend: number }) => (
  <span
    className="text-[8px] font-black px-1.5 py-0.5 rounded-full inline-flex items-center gap-0.5 border"
    style={trend > 0
      ? { color: '#16a34a', backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }
      : { color: '#7B3218', backgroundColor: 'rgba(231,179,115,0.18)', borderColor: 'rgba(150,61,31,0.25)' }
    }
  >
    {trend > 0 ? '↑' : '↓'}{trend > 0 ? '+' : ''}{trend}%
  </span>
);

const MetricCard = ({ 
  label, 
  value, 
  trend, 
  isHighlighted = false, 
  trendColor = 'text-emerald-500', 
  isDown = false,
  onClick
}: { 
  label: string, 
  value: string | number, 
  trend: string, 
  isHighlighted?: boolean, 
  trendColor?: string, 
  isDown?: boolean,
  onClick?: () => void
}) => (
  <div 
    onClick={onClick}
    className={`p-6 rounded-[24px] border-2 transition-all cursor-pointer ${isHighlighted ? 'border-brand-brown shadow-md bg-white ring-4 ring-brand-brown/5 scale-[1.02]' : 'border-gray-200 bg-white shadow-sm hover:border-gray-300 hover:scale-[1.01]'}`}
  >
    <span className="text-[10px] font-black text-slate-400 tracking-widest mb-1.5 block leading-none">{label}</span>
    <div className="text-2xl font-black text-slate-900 tracking-tight mb-2 leading-none">{value}</div>
    <div className={`flex items-center gap-1.5 text-[11px] font-black tracking-tight ${trendColor}`}>
       {isDown ? <ArrowDownRight size={12} /> : <ArrowUpRight size={12} />}
       {trend}
    </div>
  </div>
);

