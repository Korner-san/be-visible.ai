
import React, { useState, useEffect } from 'react';
import {
  FileText, List, BookOpen, MessageCircle, Newspaper,
  Video, ShoppingBag, Shield, Info, HelpCircle, AlertTriangle
} from 'lucide-react';
import { TimeRange } from '../../types';
import { supabase } from '../../lib/supabase';

interface ContentUrl {
  url: string;
  citations: number;
}

interface ContentTypeData {
  type: string;
  urls: number;
  percentage: number;
  icon: React.ReactNode;
  sampleUrls: ContentUrl[];
}

// Map DB category keys to display names
const CATEGORY_LABELS: Record<string, string> = {
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

// Map DB category keys to icons
const CATEGORY_ICONS: Record<string, React.ReactNode> = {
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

const MOCK_DATA: ContentTypeData[] = [
  {
    type: 'Community discussion', urls: 84, percentage: 32,
    icon: <MessageCircle size={14} />,
    sampleUrls: [
      { url: 'reddit.com/r/cpp/best_accelerators', citations: 42 },
      { url: 'stackoverflow.com/q/112233/speed-up-builds', citations: 28 }
    ]
  },
  {
    type: 'Official docs', urls: 62, percentage: 24,
    icon: <Shield size={14} />,
    sampleUrls: [
      { url: 'docs.incredibuild.com/integration/ci-cd', citations: 35 }
    ]
  },
  {
    type: 'How-to guide', urls: 45, percentage: 17,
    icon: <List size={14} />,
    sampleUrls: [
      { url: 'medium.com/engineering/faster-compilation', citations: 20 }
    ]
  },
  {
    type: 'Comparison analysis', urls: 28, percentage: 11,
    icon: <FileText size={14} />,
    sampleUrls: []
  },
  {
    type: 'Thought leadership', urls: 18, percentage: 7,
    icon: <BookOpen size={14} />,
    sampleUrls: []
  },
  {
    type: 'Product page', urls: 15, percentage: 6,
    icon: <ShoppingBag size={14} />,
    sampleUrls: []
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

interface AIPreferenceDistributionProps {
  brandId?: string | null;
  timeRange?: TimeRange;
}

const HeaderWithInfo = ({ title, info, align = 'left' }: { title: string, info: string, align?: 'left' | 'right' | 'center' }) => {
  const tooltipPositionClass =
    align === 'right' ? 'right-0' :
    align === 'center' ? 'left-1/2 -translate-x-1/2' :
    'left-0';

  return (
    <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'}`}>
      <span className="whitespace-nowrap">{title}</span>
      <div className="group relative inline-block">
        <Info size={12} className="text-gray-300 cursor-help hover:text-gray-400 transition-colors shrink-0" />
        <div className={`absolute top-full mt-2 hidden group-hover:block w-40 p-2.5 bg-slate-900 text-white text-[9px] normal-case font-medium rounded-lg shadow-2xl z-50 pointer-events-none leading-relaxed tracking-normal text-left border border-white/10 ${tooltipPositionClass}`}>
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

export const AIPreferenceDistribution: React.FC<AIPreferenceDistributionProps> = ({ brandId, timeRange = TimeRange.THIRTY_DAYS }) => {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [data, setData] = useState<ContentTypeData[]>(MOCK_DATA);
  const [isLoading, setIsLoading] = useState(false);
  const [hasRealData, setHasRealData] = useState(false);
  const brandTerracotta = '#874B34';

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

        const { data: rows, error } = await supabase.rpc('get_content_type_stats', {
          p_brand_id: brandId,
          p_from_date: from,
          p_to_date: to,
        });

        if (error) {
          console.error('Content type stats RPC error:', error);
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

        const chartData: ContentTypeData[] = rows.map((row: any) => {
          const cat = row.category || 'UNCLASSIFIED';
          const topUrls = (row.top_urls || []).map((u: any) => ({
            url: u.url,
            citations: u.citations,
          }));

          return {
            type: CATEGORY_LABELS[cat] || cat,
            urls: Number(row.unique_urls) || 0,
            percentage: Number(row.percentage) || 0,
            icon: CATEGORY_ICONS[cat] || <FileText size={14} />,
            sampleUrls: topUrls,
          };
        });

        setData(chartData);
        setHasRealData(true);
      } catch (err) {
        console.error('Content type fetch error:', err);
        setData(MOCK_DATA);
        setHasRealData(false);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [brandId, timeRange]);

  const toggleRow = (type: string) => {
    const next = new Set(expandedRows);
    if (next.has(type)) {
      next.delete(type);
    } else {
      next.add(type);
    }
    setExpandedRows(next);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-full">
      <div className="p-5 border-b border-gray-100 bg-white">
        <div className="space-y-1">
          <h3 className="text-[15px] font-bold text-gray-400 tracking-wide flex items-center gap-2 leading-none">
            Content type analysis
            <div className="group relative inline-block">
              <Info size={13} className="text-gray-300 cursor-help hover:text-gray-400 transition-colors shrink-0" />
              <div className="absolute top-full left-0 mt-2 hidden group-hover:block w-52 p-3 bg-slate-900 text-white text-[10px] normal-case font-medium rounded-lg shadow-2xl z-50 pointer-events-none leading-relaxed tracking-normal text-left border border-white/10">
                <div className="relative">
                  <div className="absolute -top-4 left-2 w-2 h-2 bg-slate-900 rotate-45 border-l border-t border-white/10" />
                  This analysis is derived from analyzing AI models' answers for the user's tracked prompt library.
                </div>
              </div>
            </div>
            {hasRealData && (
              <span className="ml-1 px-1.5 py-0.5 text-[8px] font-black tracking-widest bg-emerald-100 text-emerald-700 rounded">LIVE DATA</span>
            )}
            {!hasRealData && !isLoading && (
              <span className="ml-1 px-1.5 py-0.5 text-[8px] font-black tracking-widest bg-amber-100 text-amber-600 rounded">SAMPLE</span>
            )}
          </h3>
          <p className="text-[11px] text-slate-500 font-medium mt-0.5">
            Content formats most influencing AI model answers
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-gray-200 border-t-brand-brown rounded-full animate-spin" />
          </div>
        ) : (
        <table className="w-full text-left text-[11px] table-auto">
          <thead className="bg-white text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100 sticky top-0 z-10">
            <tr>
              <th className="px-5 py-3 font-bold">
                <HeaderWithInfo title="Type" info="The format preferred by AI models." />
              </th>
              <th className="px-3 py-3 font-bold text-right min-w-[60px]">
                <HeaderWithInfo title="Urls" info="Unique pages identified." align="right" />
              </th>
              <th className="px-5 py-3 font-bold text-right min-w-[120px]">
                <HeaderWithInfo title="Visibility share" info="Proportion of citation volume." align="right" />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.map((row, index) => {
              const isExpanded = expandedRows.has(row.type);
              return (
                <React.Fragment key={index}>
                  <tr
                    onClick={() => toggleRow(row.type)}
                    className={`hover:bg-gray-50/80 transition-all group cursor-pointer ${isExpanded ? 'bg-slate-50/60' : ''}`}
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="p-1.5 rounded-lg bg-gray-50 text-slate-400 group-hover:text-brand-brown shadow-sm transition-all border border-gray-100 shrink-0">
                          {row.icon}
                        </div>
                        <span className="font-bold text-slate-700 text-[12px] leading-tight break-words">
                          {row.type}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right font-black text-slate-500 tabular-nums text-[12px] vertical-top">{row.urls}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-3">
                        <span className="font-black text-slate-800 tabular-nums w-8 text-right text-[12px]">{row.percentage}%</span>
                        <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden shrink-0">
                          <div
                            className="h-full transition-all duration-1000 ease-out"
                            style={{
                              width: `${row.percentage}%`,
                              backgroundColor: brandTerracotta
                            }}
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                  {isExpanded && row.sampleUrls.length > 0 && (
                    <tr className="bg-slate-50/30">
                      <td colSpan={3} className="px-5 py-3">
                        <div className="space-y-1.5 animate-fadeIn">
                          {row.sampleUrls.map((sample, sIdx) => (
                            <div key={sIdx} className="flex items-center justify-between text-[10px] bg-white p-2.5 rounded-lg border border-gray-100 shadow-xs">
                              <span className="text-slate-500 font-medium truncate max-w-[200px]">{sample.url}</span>
                              <span className="font-black text-brand-brown whitespace-nowrap">{sample.citations} Citations</span>
                            </div>
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
        )}
      </div>
    </div>
  );
};
