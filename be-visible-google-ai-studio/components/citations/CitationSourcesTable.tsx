
import React, { useState, useEffect } from 'react';
import { ChevronRight, Clock, Globe, Info } from 'lucide-react';
import { TimeRange } from '../../types';
import { supabase } from '../../lib/supabase';

interface SubUrl {
  url: string;
  citations: number;
}

interface SourceData {
  id: string;
  domain: string;
  uniqueUrls: number;
  mentions: number;
  promptCoverage: number;
  subUrls: SubUrl[];
}

const MOCK_DATA: SourceData[] = [
  {
    id: '1', domain: 'reddit.com', uniqueUrls: 145, mentions: 890, promptCoverage: 92,
    subUrls: [
      { url: '/r/cpp/comments/xy7z/best_build_acceleration_tools/', citations: 45 },
      { url: '/r/gamedev/comments/ab12/improving_compile_times_unreal/', citations: 32 },
      { url: '/r/devops/comments/ck99/ci_cd_pipeline_optimization/', citations: 28 },
    ]
  },
  {
    id: '2', domain: 'stackoverflow.com', uniqueUrls: 82, mentions: 540, promptCoverage: 78,
    subUrls: [
      { url: '/questions/112233/how-to-speed-up-vs-builds', citations: 40 },
      { url: '/questions/445566/distributed-compiling-setup', citations: 22 },
    ]
  },
  {
    id: '3', domain: 'github.com', uniqueUrls: 45, mentions: 320, promptCoverage: 64,
    subUrls: [
      { url: '/incredibuild/actions-runner', citations: 15 },
    ]
  },
  {
    id: '4', domain: 'medium.com', uniqueUrls: 28, mentions: 150, promptCoverage: 42,
    subUrls: []
  },
];

function getDateRange(timeRange: TimeRange): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  switch (timeRange) {
    case TimeRange.SEVEN_DAYS: from.setDate(from.getDate() - 7); break;
    case TimeRange.NINETY_DAYS: from.setDate(from.getDate() - 90); break;
    default: from.setDate(from.getDate() - 30);
  }
  return {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
  };
}

interface CitationSourcesTableProps {
  brandId?: string | null;
  timeRange?: TimeRange;
}

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

const PAGE_SIZE = 15;

export const CitationSourcesTable: React.FC<CitationSourcesTableProps> = ({ brandId, timeRange = TimeRange.THIRTY_DAYS }) => {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [data, setData] = useState<SourceData[]>(MOCK_DATA);
  const [isLoading, setIsLoading] = useState(false);
  const [hasRealData, setHasRealData] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);

  useEffect(() => {
    if (!brandId) {
      setData(MOCK_DATA);
      setHasRealData(false);
      return;
    }

    const fetchData = async () => {
      setIsLoading(true);
      try {
        const { from, to } = getDateRange(timeRange);

        const { data: rows, error } = await supabase.rpc('get_citation_sources', {
          p_brand_id: brandId,
          p_from_date: from,
          p_to_date: to,
        });

        if (error) {
          console.error('Citation sources RPC error:', error);
          setData(MOCK_DATA);
          setHasRealData(false);
          setIsLoading(false);
          return;
        }

        if (!rows || rows.length === 0) {
          setData(MOCK_DATA);
          setHasRealData(false);
          setIsLoading(false);
          return;
        }

        const totalActivePrompts = Number(rows[0]?.total_active_prompts) || 1;

        const sourceData: SourceData[] = rows.map((row: any, idx: number) => {
          const promptCount = Number(row.prompt_coverage) || 0;
          const coveragePct = Math.round((promptCount / totalActivePrompts) * 100);

          const topUrls = (row.top_urls || []).map((u: any) => ({
            url: u.url,
            citations: u.citations,
          }));

          return {
            id: String(idx),
            domain: row.domain || 'unknown',
            uniqueUrls: Number(row.urls_count) || 0,
            mentions: Number(row.mentions_count) || 0,
            promptCoverage: coveragePct,
            subUrls: topUrls,
          };
        });

        setData(sourceData);
        setHasRealData(true);
        setCurrentPage(0);
      } catch (err) {
        console.error('Citation sources fetch error:', err);
        setData(MOCK_DATA);
        setHasRealData(false);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [brandId, timeRange]);

  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  const totalMentions = data.reduce((acc, c) => acc + c.mentions, 0);
  const totalPages = Math.ceil(data.length / PAGE_SIZE);
  const pagedData = data.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col overflow-hidden">
      {/* Table Header Section */}
      <div className="p-5 border-b border-gray-200 bg-white">
        <h3 className="text-[15px] font-bold text-gray-400 tracking-wide leading-none flex items-center gap-2">
          Citation sources
          {hasRealData && (
            <span className="px-1.5 py-0.5 text-[8px] font-black tracking-widest bg-emerald-100 text-emerald-700 rounded">LIVE DATA</span>
          )}
          {!hasRealData && !isLoading && (
            <span className="px-1.5 py-0.5 text-[8px] font-black tracking-widest bg-amber-100 text-amber-600 rounded">SAMPLE</span>
          )}
        </h3>
        <p className="text-[11px] text-slate-500 mt-1 font-medium">
          Unique URLs per domain across all AI responses. Click a domain to expand.
        </p>
      </div>

      <div className="overflow-x-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="text-center space-y-3">
              <div className="w-8 h-8 border-2 border-gray-200 border-t-brand-brown rounded-full animate-spin mx-auto" />
              <p className="text-xs text-gray-400 font-medium">Loading citation sources...</p>
            </div>
          </div>
        ) : (
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
                <HeaderWithInfo title="Coverage" info="Percentage of tracked prompts where this domain was cited." align="center" />
              </th>
              <th className="px-5 py-3 font-bold text-center">Improve</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {pagedData.map((row) => {
              const isExpanded = expandedRows.has(row.id);
              const citationPct = totalMentions > 0 ? ((row.mentions / totalMentions) * 100).toFixed(1) : '0';

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
                                      <span className="truncate hover:underline">{sub.url}</span>
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
        )}
      </div>

      {/* Pagination Footer */}
      <div className="py-3.5 px-5 bg-white flex items-center justify-between border-t border-gray-200">
        <span className="text-[10px] font-bold text-gray-400 tabular-nums">
          {data.length > 0
            ? `${currentPage * PAGE_SIZE + 1}–${Math.min((currentPage + 1) * PAGE_SIZE, data.length)} of ${data.length} domains`
            : 'No domains'}
        </span>
        {totalPages > 1 && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
              disabled={currentPage === 0}
              className="px-2.5 py-1 text-[10px] font-bold rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              Prev
            </button>
            {Array.from({ length: totalPages }, (_, i) => (
              <button
                key={i}
                onClick={() => setCurrentPage(i)}
                className={`w-6 h-6 text-[10px] font-bold rounded-md transition-all ${
                  i === currentPage
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                }`}
              >
                {i + 1}
              </button>
            ))}
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={currentPage === totalPages - 1}
              className="px-2.5 py-1 text-[10px] font-bold rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
