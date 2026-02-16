import React, { useState, useEffect } from 'react';
import {
  FileText, List, BookOpen, MessageCircle, Newspaper,
  Video, ShoppingBag, Shield, Clock, Info, ChevronRight,
  ExternalLink, HelpCircle, AlertTriangle
} from 'lucide-react';
import { TimeRange } from '../types';
import { supabase } from '../lib/supabase';

interface ContentUrl {
  url: string;
  citations: number;
}

interface ContentTypeData {
  type: string;
  urls: number;
  totalScans: number;
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
  OFFICIAL_DOCS: <Shield size={16} />,
  HOW_TO_GUIDE: <List size={16} />,
  COMPARISON_ANALYSIS: <FileText size={16} />,
  PRODUCT_PAGE: <ShoppingBag size={16} />,
  THOUGHT_LEADERSHIP: <BookOpen size={16} />,
  CASE_STUDY: <FileText size={16} />,
  TECHNICAL_DEEP_DIVE: <FileText size={16} />,
  NEWS_ANNOUNCEMENT: <Newspaper size={16} />,
  COMMUNITY_DISCUSSION: <MessageCircle size={16} />,
  VIDEO_CONTENT: <Video size={16} />,
  OTHER_LOW_CONFIDENCE: <HelpCircle size={16} />,
  UNCLASSIFIED: <AlertTriangle size={16} />,
};

const MOCK_DATA: ContentTypeData[] = [
  {
    type: 'Community discussion', urls: 84, totalScans: 84, percentage: 32,
    icon: <MessageCircle size={16} />,
    sampleUrls: [
      { url: 'reddit.com/r/cpp/best_accelerators', citations: 42 },
      { url: 'stackoverflow.com/q/112233/speed-up-builds', citations: 28 },
      { url: 'reddit.com/r/devops/pipeline_optimization', citations: 14 }
    ]
  },
  {
    type: 'Official docs', urls: 62, totalScans: 62, percentage: 24,
    icon: <Shield size={16} />,
    sampleUrls: [
      { url: 'docs.incredibuild.com/integration/ci-cd', citations: 35 },
      { url: 'learn.microsoft.com/en-us/visualstudio/build', citations: 27 }
    ]
  },
  {
    type: 'How-to guide', urls: 45, totalScans: 45, percentage: 17,
    icon: <List size={16} />,
    sampleUrls: [
      { url: 'medium.com/engineering/faster-compilation', citations: 20 },
      { url: 'dev.to/optimizing-unreal-engine-builds', citations: 25 }
    ]
  },
  {
    type: 'Comparison analysis', urls: 28, totalScans: 28, percentage: 11,
    icon: <FileText size={16} />,
    sampleUrls: [
      { url: 'g2.com/products/incredibuild/competitors', citations: 18 },
      { url: 'trustradius.com/compare/incredibuild-vs-distcc', citations: 10 }
    ]
  },
  {
    type: 'Thought leadership', urls: 18, totalScans: 18, percentage: 7,
    icon: <BookOpen size={16} />,
    sampleUrls: [
      { url: 'forbes.com/tech/the-future-of-devops', citations: 12 },
      { url: 'techcrunch.com/2024/build-acceleration-trends', citations: 6 }
    ]
  },
  {
    type: 'Product page', urls: 15, totalScans: 15, percentage: 6,
    icon: <ShoppingBag size={16} />,
    sampleUrls: [
      { url: 'incredibuild.com/solutions/game-dev', citations: 9 },
      { url: 'incredibuild.com/pricing', citations: 6 }
    ]
  },
  {
    type: 'News announcement', urls: 5, totalScans: 5, percentage: 2,
    icon: <Newspaper size={16} />,
    sampleUrls: [
      { url: 'businesswire.com/news/incredibuild-series-b', citations: 5 }
    ]
  },
  {
    type: 'Video content', urls: 3, totalScans: 3, percentage: 1,
    icon: <Video size={16} />,
    sampleUrls: [
      { url: 'youtube.com/watch?v=incredibuild_demo', citations: 3 }
    ]
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

interface ContentPageProps {
  brandId?: string | null;
  timeRange?: TimeRange;
}

export const ContentPage: React.FC<ContentPageProps> = ({ brandId, timeRange = TimeRange.THIRTY_DAYS }) => {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [data, setData] = useState<ContentTypeData[]>(MOCK_DATA);
  const [isLoading, setIsLoading] = useState(false);
  const [hasRealData, setHasRealData] = useState(false);

  // Brand color palette from "Visibility 2"
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

        // Step 1: Get daily report IDs for this brand in date range
        const { data: dailyReports, error: reportsError } = await supabase
          .from('daily_reports')
          .select('id')
          .eq('brand_id', brandId)
          .eq('status', 'completed')
          .gte('report_date', from)
          .lte('report_date', to);

        if (reportsError || !dailyReports || dailyReports.length === 0) {
          setData(MOCK_DATA);
          setHasRealData(false);
          setIsLoading(false);
          return;
        }

        const reportIds = dailyReports.map(r => r.id);

        // Step 2: Get prompt results for those reports
        const { data: promptResults, error: resultsError } = await supabase
          .from('prompt_results')
          .select('id')
          .in('daily_report_id', reportIds)
          .in('provider_status', ['ok']);

        if (resultsError || !promptResults || promptResults.length === 0) {
          setData(MOCK_DATA);
          setHasRealData(false);
          setIsLoading(false);
          return;
        }

        const promptResultIds = promptResults.map(r => r.id);

        // Step 3: Get URL citations for those prompt results (batch if needed)
        const BATCH_SIZE = 500;
        const allCitations: any[] = [];

        for (let i = 0; i < promptResultIds.length; i += BATCH_SIZE) {
          const batch = promptResultIds.slice(i, i + BATCH_SIZE);
          const { data: batchCitations, error: citError } = await supabase
            .from('url_citations')
            .select('url_id, prompt_result_id')
            .in('prompt_result_id', batch);

          if (citError) break;
          if (batchCitations) allCitations.push(...batchCitations);
        }

        if (allCitations.length === 0) {
          setData(MOCK_DATA);
          setHasRealData(false);
          setIsLoading(false);
          return;
        }

        const urlIds = [...new Set(allCitations.map(c => c.url_id))];

        // Step 4: Get URL inventory (for URL strings) and content facts (for classification)
        const allInventory: any[] = [];
        const allFacts: any[] = [];

        for (let i = 0; i < urlIds.length; i += BATCH_SIZE) {
          const batch = urlIds.slice(i, i + BATCH_SIZE);
          const [invResult, factsResult] = await Promise.all([
            supabase.from('url_inventory').select('id, url, domain').in('id', batch),
            supabase.from('url_content_facts').select('url_id, content_structure_category, extracted_at').in('url_id', batch),
          ]);
          if (invResult.data) allInventory.push(...invResult.data);
          if (factsResult.data) allFacts.push(...factsResult.data);
        }

        // Build lookup maps
        const inventoryMap = new Map<string, { url: string; domain: string }>();
        allInventory.forEach(inv => inventoryMap.set(inv.id, { url: inv.url, domain: inv.domain }));

        // For duplicate url_ids in facts, keep the latest
        const classificationMap = new Map<string, string>();
        const extractionMap = new Map<string, string>();
        allFacts.forEach(f => {
          const existing = extractionMap.get(f.url_id);
          if (!existing || (f.extracted_at && f.extracted_at > existing)) {
            classificationMap.set(f.url_id, f.content_structure_category);
            extractionMap.set(f.url_id, f.extracted_at);
          }
        });

        // Step 5: Aggregate citations by category
        const categoryStats: Record<string, { count: number; uniqueUrls: Set<string>; topUrls: Map<string, number> }> = {};

        allCitations.forEach(citation => {
          const urlId = citation.url_id;
          const category = classificationMap.get(urlId) || 'UNCLASSIFIED';
          const inv = inventoryMap.get(urlId);
          const url = inv?.url || `url_id_${urlId}`;

          if (!categoryStats[category]) {
            categoryStats[category] = { count: 0, uniqueUrls: new Set(), topUrls: new Map() };
          }
          categoryStats[category].count++;
          categoryStats[category].uniqueUrls.add(url);
          categoryStats[category].topUrls.set(url, (categoryStats[category].topUrls.get(url) || 0) + 1);
        });

        const totalCitations = allCitations.length;

        // Step 6: Build chart data sorted by percentage descending
        const chartData: ContentTypeData[] = Object.entries(categoryStats)
          .map(([category, stats]) => {
            const pct = totalCitations > 0 ? parseFloat(((stats.count / totalCitations) * 100).toFixed(1)) : 0;

            // Get top 3 URLs by citation count for sample URLs
            const topUrls = [...stats.topUrls.entries()]
              .sort((a, b) => b[1] - a[1])
              .slice(0, 3)
              .map(([url, count]) => ({ url, citations: count }));

            return {
              type: CATEGORY_LABELS[category] || category,
              urls: stats.uniqueUrls.size,
              totalScans: stats.count,
              percentage: pct,
              icon: CATEGORY_ICONS[category] || <FileText size={16} />,
              sampleUrls: topUrls,
            };
          })
          .sort((a, b) => b.percentage - a.percentage);

        if (chartData.length > 0) {
          setData(chartData);
          setHasRealData(true);
        } else {
          setData(MOCK_DATA);
          setHasRealData(false);
        }
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
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(type)) {
      newExpanded.delete(type);
    } else {
      newExpanded.add(type);
    }
    setExpandedRows(newExpanded);
  };

  const HeaderWithInfo = ({ title, info, align = 'left' }: { title: string, info: string, align?: 'left' | 'right' | 'center' }) => {
    const tooltipPositionClass =
      align === 'right' ? 'right-0' :
      align === 'center' ? 'left-1/2 -translate-x-1/2' :
      'left-0';

    return (
      <div className={`flex items-center gap-2 ${align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'}`}>
        <span className="whitespace-nowrap">{title}</span>
        <div className="group relative inline-block">
          <Info size={13} className="text-gray-300 cursor-help hover:text-gray-400 transition-colors shrink-0" />
          <div className={`absolute top-full mt-2 hidden group-hover:block w-48 p-3 bg-slate-900 text-white text-[10px] normal-case font-medium rounded-lg shadow-2xl z-50 pointer-events-none leading-relaxed tracking-normal text-left border border-white/10 ${tooltipPositionClass}`}>
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

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
        <div className="p-8 border-b border-gray-100 bg-white">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-2">
            Content Structure Analysis
            {hasRealData && (
              <span className="px-1.5 py-0.5 text-[8px] font-black tracking-widest bg-emerald-100 text-emerald-700 rounded">LIVE DATA</span>
            )}
            {!hasRealData && !isLoading && (
              <span className="px-1.5 py-0.5 text-[8px] font-black tracking-widest bg-amber-100 text-amber-600 rounded">SAMPLE</span>
            )}
          </h3>
          <p className="text-2xl font-black text-slate-900 tracking-tight">
            AI Preference Distribution
          </p>
          <p className="text-sm text-slate-500 mt-2 font-medium italic">
            Content types that have the most effect on how AI models answer questions based on citations
          </p>
        </div>

        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-center space-y-3">
                <div className="w-8 h-8 border-2 border-gray-200 border-t-brand-brown rounded-full animate-spin mx-auto" />
                <p className="text-xs text-gray-400 font-medium">Loading content analysis...</p>
              </div>
            </div>
          ) : (
          <table className="w-full text-left text-sm">
             <thead className="bg-gray-50/50 text-xs font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100">
               <tr>
                 <th className="px-8 py-5 font-bold">
                   <HeaderWithInfo
                     title="Content Type"
                     info="The format or platform category where AI models discovered your brand mentions."
                   />
                 </th>
                 <th className="px-8 py-5 font-bold text-right">
                   <HeaderWithInfo
                     title="URLs"
                     info="Total number of unique web pages identified within this content category."
                     align="right"
                   />
                 </th>
                 <th className="px-8 py-5 font-bold text-right">
                   <HeaderWithInfo
                     title="% of total citations"
                     info="Proportion of citations in AI generated responses attributed to this specific content type."
                     align="right"
                   />
                 </th>
                 <th className="px-8 py-5 font-bold text-center">
                   <HeaderWithInfo
                     title="Impact Level"
                     info="Proprietary calculation of how much this content type influences the final AI output."
                     align="center"
                   />
                 </th>
                 <th className="px-8 py-5 font-bold text-center">
                   <HeaderWithInfo
                     title="Create Content"
                     info="Direct access to AI-powered content generation for these specific formats."
                     align="center"
                   />
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
                       <td className="px-8 py-5">
                         <div className="flex items-center gap-4">
                           <div className="text-gray-400 transition-transform duration-200" style={{ transform: isExpanded ? 'rotate(90deg)' : 'none' }}>
                             <ChevronRight size={16} />
                           </div>
                           <div
                             className="p-2.5 rounded-lg border border-gray-100 bg-gray-50 group-hover:bg-white group-hover:shadow-sm transition-all"
                             style={{ color: row.percentage > 15 ? brandTerracotta : undefined }}
                           >
                              {row.icon}
                           </div>
                           <span className="font-bold text-slate-700 text-base">{row.type}</span>
                         </div>
                       </td>
                       <td className="px-8 py-5 text-right font-black text-slate-600 tabular-nums">{row.urls}</td>
                       <td className="px-8 py-5 text-right">
                         <div className="flex items-center justify-end gap-4">
                           <span className="font-black text-slate-800 w-10 tabular-nums">{row.percentage}%</span>
                           <div className="w-32 h-2.5 bg-gray-100 rounded-full overflow-hidden ring-1 ring-gray-200/50">
                             <div
                               className="h-full transition-all duration-1000 ease-out shadow-inner"
                               style={{
                                 width: `${row.percentage}%`,
                                 backgroundColor: brandTerracotta,
                                 opacity: Math.max(0.4, row.percentage / 40)
                               }}
                             />
                           </div>
                         </div>
                       </td>
                       <td className="px-8 py-5 text-center">
                          <span
                            className="text-[10px] font-black uppercase tracking-tight px-3 py-1.5 rounded-full border-2 transition-all duration-500"
                            style={{
                              borderColor: row.percentage > 20 ? `${brandTerracotta}40` : row.percentage > 10 ? '#e2e8f0' : '#f1f5f9',
                              backgroundColor: row.percentage > 20 ? `${brandTerracotta}15` : row.percentage > 10 ? '#f8fafc' : '#ffffff',
                              color: row.percentage > 20 ? brandTerracotta : row.percentage > 10 ? '#475569' : '#94a3b8'
                            }}
                          >
                            {row.percentage > 20 ? 'Critical Impact' : row.percentage > 10 ? 'Significant' : 'Moderate'}
                          </span>
                       </td>
                       <td className="px-8 py-5 text-center">
                         <div className="flex items-center justify-center gap-2 text-gray-400 italic font-medium">
                           <Clock size={14} className="opacity-50" />
                           <span className="text-xs uppercase tracking-widest font-bold">Coming Soon</span>
                         </div>
                       </td>
                     </tr>

                     {/* Row Expansion Section */}
                     {isExpanded && (
                       <tr className="bg-slate-50/30">
                         <td colSpan={5} className="px-8 py-6 border-l-4 border-l-slate-200">
                           <div className="space-y-4 ml-8 animate-fadeIn">
                             <div className="flex items-center justify-between">
                               <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                                 Analyzing {row.urls} URLs across {row.type}
                               </h4>
                               <span className="text-[10px] font-medium text-slate-400 italic">Showing top-cited sources</span>
                             </div>

                             <div className="flex flex-col gap-3">
                               {row.sampleUrls.map((sample, sIdx) => (
                                 <div
                                   key={sIdx}
                                   className="group/item flex items-center justify-between p-3 bg-white rounded-lg border border-gray-100 hover:border-slate-200 hover:shadow-sm transition-all"
                                 >
                                   <div className="flex items-center gap-3 truncate">
                                     <ExternalLink size={14} className="text-slate-300 group-hover/item:text-brand-brown transition-colors" />
                                     <span className="text-sm font-medium text-slate-600 truncate group-hover/item:text-slate-900">
                                       {sample.url}
                                     </span>
                                   </div>
                                   <div className="flex items-center gap-2 shrink-0 ml-4">
                                     <span className="text-xs font-black text-brand-brown tabular-nums">{sample.citations}</span>
                                     <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter">Citations</span>
                                   </div>
                                 </div>
                               ))}
                               {row.urls > row.sampleUrls.length && (
                                 <div className="p-3 bg-gray-50/50 border border-dashed border-gray-200 rounded-lg flex items-center justify-center">
                                   <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">
                                     + {row.urls - row.sampleUrls.length} more unique sources
                                   </span>
                                 </div>
                               )}
                             </div>
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

        <div className="p-6 bg-gray-50/50 border-t border-gray-100 flex justify-center">
           <button className="text-xs font-bold text-gray-400 uppercase tracking-widest hover:text-slate-900 transition-colors">
             Export Analysis Data
           </button>
        </div>
      </div>
    </div>
  );
};
