import React, { useState, useMemo } from 'react';
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
  ExternalLink
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { PromptStats, MetricType } from '../types';

interface PromptsPageProps {
  prompts: PromptStats[];
  onNavigateToManage: () => void;
}

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

export const PromptsPage: React.FC<PromptsPageProps> = ({ prompts, onNavigateToManage }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set(['Competitive comparison']));
  const [selectedEntity, setSelectedEntity] = useState<{ type: 'prompt' | 'category', data: any, displayName: string } | null>(null);
  const [activeModalTab, setActiveModalTab] = useState<'Citation sources' | 'Ai preference' | 'Sample history'>('Citation sources');
  const [activeChartMetric, setActiveChartMetric] = useState<MetricType>('visibility');
  const [selectedRun, setSelectedRun] = useState<any | null>(null);
  
  const brandTerracotta = '#874B34';
  const brandBrown = '#2C1308';

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
  };

  const runHistory = useMemo(() => {
    const baseHistory = [
      { 
        id: 'r1',
        time: 'Today, 14:20', 
        model: 'Google AI Overviews', 
        mentioned: true, 
        position: 1,
        promptText: 'Compare Incredibuild vs. GitLab for C++ build acceleration',
        response: "To launch an app in Arabic with a strong focus on data and media, several specialized agencies stand out. Sanapix is highly recommended for its precision in data-driven digital advertising, while Tohen Media offers exceptional multi-channel strategy and Arabic cultural localization.",
        mentions: ['Sanapix', 'Tohen Media'],
        region: 'Israel',
        searchQueries: 'n/a',
        citations: [
          { domain: 'www.tohen-media.com', title: 'Digital Marketing in Arabic - Tohen Media', snippet: 'Since 2016, Tohen Media has provided specialized services... across the Arabic speaking world.', favicon: 'https://www.google.com/s2/favicons?domain=tohen-media.com&sz=64' },
          { domain: 'sanapix.co.il', title: 'Advertising Strategy and Results-Driven Digital...', snippet: 'Sanapix specializes in precise digital advertising focused on measurable results for the Arab sector...', favicon: 'https://www.google.com/s2/favicons?domain=sanapix.co.il&sz=64' }
        ]
      },
      { 
        id: 'r2',
        time: 'Yesterday, 14:15', 
        model: 'GPT-4o', 
        mentioned: true, 
        position: 2,
        promptText: 'How to optimize Unreal Engine 5 compile times?',
        response: "Incredibuild is an excellent choice for teams looking to accelerate their development cycles. Its distributed computing model allows for significantly faster compilation times compared to standard builds.",
        mentions: ['Incredibuild'],
        region: 'United States',
        searchQueries: 'n/a',
        citations: []
      },
      { 
        id: 'r3',
        time: 'Jan 12, 14:18', 
        model: 'Claude 3.5 Sonnet', 
        mentioned: false, 
        position: '-',
        promptText: 'Best software for game dev build times?',
        response: "There are many tools available for build acceleration, including distributed compilers and smart caching solutions. Choosing the right one depends on your specific tech stack and project size.",
        mentions: [],
        region: 'United Kingdom',
        searchQueries: 'n/a',
        citations: []
      },
    ];
    return baseHistory;
  }, []);

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
                  Lines is mentioned
                </div>
              ) : (
                <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                  <div className="w-5 h-5 rounded-full bg-rose-500 flex items-center justify-center text-white">
                    <XCircle size={12} />
                  </div>
                  Lines is not mentioned
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
          <div className="p-8 bg-white border border-gray-100 rounded-2xl shadow-sm text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">
            {run.response}
          </div>
        </div>
      </div>
    );
  };

  const renderTabContent = () => {
    if (!selectedEntity) return null;
    const isGroup = selectedEntity.type === 'category';

    switch (activeModalTab) {
      case 'Citation sources':
        return (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm animate-fadeIn">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/50 text-[9px] font-bold text-gray-400 uppercase tracking-widest border-b-2 border-gray-200">
                  <th className="px-8 py-4 font-bold">Domain source</th>
                  <th className="px-6 py-4 text-center font-bold">Urls</th>
                  <th className="px-6 py-4 text-center font-bold">Mentions</th>
                  <th className="px-8 py-4 text-center font-bold">Coverage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                <SourceRow domain="reddit.com" urls={42} mentions={156} coverage={94} />
                <SourceRow domain="stackoverflow.com" urls={28} mentions={94} coverage={82} />
                <SourceRow domain="github.com" urls={15} mentions={42} coverage={68} />
                <SourceRow domain="medium.com" urls={12} mentions={31} coverage={45} />
              </tbody>
            </table>
          </div>
        );
      case 'Ai preference':
        const preferenceData = [
          { type: 'Community discussion', urls: 84, share: 32 },
          { type: 'Official docs', urls: 62, share: 24 },
          { type: 'How-to guide', urls: 45, share: 17 },
          { type: 'Comparison analysis', urls: 28, share: 11 },
          { type: 'Thought leadership', urls: 18, share: 7 },
        ];
        return (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm animate-fadeIn">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/50 text-[9px] font-bold text-gray-400 uppercase tracking-widest border-b-2 border-gray-200">
                  <th className="px-8 py-4 font-bold">Content type</th>
                  <th className="px-6 py-4 text-center font-bold">Total urls</th>
                  <th className="px-8 py-4 font-bold">Visibility share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {preferenceData.map((row, i) => (
                  <tr key={i} className="hover:bg-slate-50 transition-colors">
                    <td className="px-8 py-5">
                      <span className="text-sm font-bold text-slate-700">{row.type}</span>
                    </td>
                    <td className="px-6 py-5 text-center text-sm font-bold text-slate-500 tabular-nums">{row.urls}</td>
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-5">
                        <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden shrink-0 max-w-[200px]">
                          <div className="h-full bg-brand-brown transition-all duration-1000" style={{ width: `${row.share}%` }} />
                        </div>
                        <span className="text-[11px] font-black text-slate-900 tabular-nums">{row.share}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
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
      <div className="space-y-6 animate-fadeIn pb-20 font-sans relative">
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
                  <HeaderWithInfo title="Visibility score" info="Brand visibility percentage for this query." align="center" />
                </th>
                <th className="w-[15%] px-4 py-4 font-bold text-center">
                  <HeaderWithInfo title="Average position" info="Average rank in AI generated lists." align="center" />
                </th>
                <th className="w-[20%] px-8 py-4 font-bold text-center">
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
                        <span className="font-bold text-slate-900 text-[13px] tabular-nums">{group.stats.visibility}%</span>
                      </td>
                      <td className="px-4 py-5 text-center">
                        <span className="font-bold text-slate-900 text-[13px] tabular-nums">{group.stats.position}</span>
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
                          <span className="font-bold text-slate-400 group-hover:text-slate-900 transition-colors text-[13px] tabular-nums">{prompt.visibilityScore}%</span>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <span className="font-bold text-slate-400 group-hover:text-slate-900 transition-colors text-[13px] tabular-nums">{prompt.avgPosition}</span>
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
                     {selectedEntity.type === 'category' ? `Prompts: ${groupedPrompts[selectedEntity.data.category].prompts.length}` : `Runs: ${selectedEntity.data.lastRun}`}
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
               <button 
                 onClick={() => setSelectedEntity(null)} 
                 className="w-12 h-12 flex items-center justify-center bg-slate-50 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-all border border-gray-100"
               >
                 <X size={24} strokeWidth={2.5} />
               </button>
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
                             activeChartMetric === 'citationShare' ? 'Citation share trend' : 'Mentions trend'}
                         </span>
                         <div className="flex items-center gap-2 text-brand-brown font-black text-[10px]">
                           <Sparkles size={12} /> Ai trends
                         </div>
                       </div>
                       <div className="flex-1 w-full min-h-0 pt-2">
                         <ResponsiveContainer width="100%" height="100%">
                           <AreaChart data={selectedEntity.data.history} margin={{ left: -25, right: 10, top: 10, bottom: 0 }}>
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
                         label="Visibility" 
                         value={selectedEntity.data.visibilityScore} 
                         trend={`+ ${selectedEntity.data.visibilityTrend}% vs last`} 
                         isHighlighted={activeChartMetric === 'visibility'}
                         onClick={() => setActiveChartMetric('visibility')}
                       />
                       <MetricCard 
                         label="Position" 
                         value={`#${selectedEntity.data.avgPosition}`} 
                         trend={`0.3% vs last`} 
                         trendColor="text-rose-500"
                         isDown={true}
                         isHighlighted={activeChartMetric === 'avgPosition'}
                         onClick={() => setActiveChartMetric('avgPosition')}
                       />
                       <MetricCard 
                         label="Share" 
                         value={`${selectedEntity.data.citationShare}%`} 
                         trend={`12% vs last`} 
                         trendColor="text-emerald-500"
                         isHighlighted={activeChartMetric === 'citationShare'}
                         onClick={() => setActiveChartMetric('citationShare')}
                       />
                       <MetricCard 
                         label="Mentions" 
                         value={selectedEntity.data.citations} 
                         trend={`12% vs last`} 
                         trendColor="text-emerald-500"
                         isHighlighted={activeChartMetric === 'mentions'}
                         onClick={() => setActiveChartMetric('mentions')}
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

const SourceRow = ({ domain, urls, mentions, coverage }: { domain: string, urls: number, mentions: number, coverage: number }) => {
  return (
    <tr className="hover:bg-slate-50 transition-colors group">
      <td className="px-8 py-5">
        <div className="flex items-center gap-4">
           <div className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center p-1.5 shadow-sm group-hover:scale-105 transition-transform">
             <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`} className="w-full h-full object-contain" alt={domain} />
           </div>
           <span className="text-sm font-bold text-slate-700">{domain}</span>
        </div>
      </td>
      <td className="px-6 py-5 text-center text-sm font-bold text-slate-500 tabular-nums">{urls}</td>
      <td className="px-6 py-5 text-center text-sm font-bold text-slate-500 tabular-nums">{mentions}</td>
      <td className="px-8 py-5">
        <div className="flex items-center gap-5">
          <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden shrink-0 min-w-[140px]">
            <div className="h-full bg-brand-brown transition-all duration-1000" style={{ width: `${coverage}%` }} />
          </div>
          <span className="text-[11px] font-black text-slate-900 tabular-nums">{coverage}%</span>
        </div>
      </td>
    </tr>
  );
};