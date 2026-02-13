
import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Clock, Globe, Info } from 'lucide-react';

interface SourceData {
  id: string;
  domain: string;
  uniqueUrls: number;
  mentions: number;
  promptCoverage: number;
  hasAction?: boolean;
  subUrls: Array<{ url: string; citations: number }>;
}

const mockData: SourceData[] = [
  {
    id: '1',
    domain: 'reddit.com',
    uniqueUrls: 145,
    mentions: 890,
    promptCoverage: 92,
    hasAction: true,
    subUrls: [
      { url: '/r/cpp/comments/xy7z/best_build_acceleration_tools/', citations: 45 },
      { url: '/r/gamedev/comments/ab12/improving_compile_times_unreal/', citations: 32 },
      { url: '/r/devops/comments/ck99/ci_cd_pipeline_optimization/', citations: 28 },
    ]
  },
  {
    id: '2',
    domain: 'stackoverflow.com',
    uniqueUrls: 82,
    mentions: 540,
    promptCoverage: 78,
    hasAction: true,
    subUrls: [
      { url: '/questions/112233/how-to-speed-up-vs-builds', citations: 40 },
      { url: '/questions/445566/distributed-compiling-setup', citations: 22 },
    ]
  },
  {
    id: '3',
    domain: 'github.com',
    uniqueUrls: 45,
    mentions: 320,
    promptCoverage: 64,
    hasAction: true,
    subUrls: [
      { url: '/incredibuild/actions-runner', citations: 15 },
    ]
  },
  {
    id: '4',
    domain: 'medium.com',
    uniqueUrls: 28,
    mentions: 150,
    promptCoverage: 42,
    hasAction: true,
    subUrls: []
  },
];

const DomainLogo = ({ domain }: { domain: string }) => {
  const [error, setError] = useState(false);
  const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;

  if (error) {
    return <Globe size={12} className="text-gray-400" />;
  }

  return (
    <img 
      src={faviconUrl} 
      alt={`${domain} logo`} 
      className="w-4 h-4 object-contain rounded-sm"
      onError={() => setError(true)}
    />
  );
};

const HeaderWithInfo = ({ title, info, align = 'left' }: { title: string, info: string, align?: 'left' | 'right' | 'center' }) => {
  const tooltipPositionClass = 
    align === 'right' ? 'right-0' : 
    align === 'center' ? 'left-1/2 -translate-x-1/2' : 
    'left-0';

  return (
    <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'}`}>
      <span className="whitespace-nowrap">{title}</span>
      <div className="group relative inline-block">
        <Info size={11} className="text-gray-300 cursor-help hover:text-gray-400 transition-colors shrink-0" />
        <div className={`absolute top-full mt-2 hidden group-hover:block w-40 p-2.5 bg-slate-900 text-white text-[8px] normal-case font-medium rounded-lg shadow-2xl z-50 pointer-events-none leading-relaxed tracking-normal text-left border border-white/10 ${tooltipPositionClass}`}>
          <div className="relative">
            <div className={`absolute -top-4 w-2 h-2 bg-slate-900 rotate-45 border-l border-t border-white/10 ${
              align === 'right' ? 'right-2' : align === 'center' ? 'left-1/2 -translate-x-1/2' : 'left-2'
            }`} />
            {info}
          </div>
        </div>
      </div>
    </div>
  );
};

export const CitationSourcesTable: React.FC = () => {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  
  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col overflow-hidden">
      {/* Table Header Section */}
      <div className="p-5 border-b border-gray-200 bg-white">
        <h3 className="text-[15px] font-bold text-gray-400 tracking-wide leading-none">Citation sources</h3>
        <p className="text-[11px] text-slate-500 mt-1 font-medium">
          Unique URLs per domain across all AI responses. Click a domain to expand.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-[11px] border-collapse">
          <thead className="bg-gray-50/50 text-[9px] font-bold text-gray-400 uppercase tracking-widest border-b-2 border-gray-200">
            <tr>
              <th className="px-5 py-3 font-bold">Domain</th>
              <th className="px-4 py-3 font-bold text-center">
                <HeaderWithInfo title="Urls" info="Total unique web pages referenced." align="center" />
              </th>
              <th className="px-4 py-3 font-bold text-center">
                <HeaderWithInfo title="Mentions" info="Total citations across library." align="center" />
              </th>
              <th className="px-4 py-3 font-bold text-center">
                <HeaderWithInfo title="% Total" info="Proportion of citation volume." align="center" />
              </th>
              <th className="px-4 py-3 font-bold text-center">
                <HeaderWithInfo title="Coverage" info="Percentage of tracked prompts." align="center" />
              </th>
              <th className="px-5 py-3 font-bold text-center">Improve</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {mockData.map((row) => {
              const isExpanded = expandedRows.has(row.id);
              const totalMentions = mockData.reduce((acc, c) => acc + c.mentions, 0);
              const citationPct = ((row.mentions / totalMentions) * 100).toFixed(1);
              
              return (
                <React.Fragment key={row.id}>
                  <tr 
                    className={`hover:bg-gray-50 transition-all cursor-pointer group ${isExpanded ? 'bg-slate-50' : ''}`}
                    onClick={() => toggleRow(row.id)}
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="text-gray-400 transition-transform duration-200" style={{ transform: isExpanded ? 'rotate(90deg)' : 'none' }}>
                          <ChevronRight size={14} />
                        </div>
                        <div className="w-7 h-7 rounded-lg bg-white border border-gray-200 flex items-center justify-center shrink-0 shadow-sm group-hover:scale-105 transition-all">
                          <DomainLogo domain={row.domain} />
                        </div>
                        <span className="font-bold text-slate-700 text-[13px]">{row.domain}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center font-bold text-slate-500 tabular-nums text-[13px]">{row.uniqueUrls}</td>
                    <td className="px-4 py-4 text-center font-bold text-slate-500 tabular-nums text-[13px]">{row.mentions}</td>
                    <td className="px-4 py-4 text-center font-black text-slate-900 tabular-nums text-[13px]">{citationPct}%</td>
                    <td className="px-4 py-4 text-center">
                      <span className="font-bold text-slate-900 text-[13px]">{row.promptCoverage}%</span>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <div className="flex items-center justify-center gap-1.5 text-slate-300 italic font-bold">
                        <Clock size={12} />
                        <span className="text-[8px] tracking-wider uppercase">Coming soon</span>
                      </div>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="bg-slate-50/40">
                      <td colSpan={6} className="px-5 py-4 border-b border-gray-200">
                        <div className="ml-10 space-y-2 animate-fadeIn">
                          <h4 className="text-[8px] font-bold text-gray-400 tracking-widest uppercase">Targeted citations: {row.domain}</h4>
                          {row.subUrls.length > 0 ? (
                            <div className="grid grid-cols-1 gap-2 max-w-4xl">
                               {row.subUrls.map((sub, idx) => (
                                 <div key={idx} className="flex items-center justify-between text-[11px] bg-white p-3 rounded-lg border border-gray-200 hover:border-brand-brown/20 transition-all group/sub">
                                    <div className="flex items-center gap-2 text-blue-600 font-bold truncate">
                                      <Globe size={12} className="opacity-60" />
                                      <span className="truncate hover:underline">{row.domain}{sub.url}</span>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                      <span className="text-slate-900 font-bold tabular-nums text-[12px]">{sub.citations}</span>
                                      <span className="text-[9px] font-bold text-gray-400 uppercase">Citations</span>
                                    </div>
                                 </div>
                               ))}
                            </div>
                          ) : (
                            <span className="text-[10px] text-gray-400 italic">Detailed URL data pending audit...</span>
                          )}
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
      
      {/* Compact Table Footer */}
      <div className="py-5 bg-white flex justify-center border-t border-gray-200">
         <button className="text-[10px] font-black text-gray-400 tracking-[0.2em] uppercase hover:text-brand-brown transition-colors">
           Request full audit
         </button>
      </div>
    </div>
  );
};
