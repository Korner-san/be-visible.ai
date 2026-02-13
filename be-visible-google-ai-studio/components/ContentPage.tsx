import React, { useState } from 'react';
import { 
  FileText, List, BookOpen, MessageCircle, Newspaper, 
  Video, ShoppingBag, Shield, Clock, Info, ChevronRight, 
  ExternalLink 
} from 'lucide-react';

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

const data: ContentTypeData[] = [
  { 
    type: 'Community discussion', 
    urls: 84, 
    percentage: 32, 
    icon: <MessageCircle size={16} />,
    sampleUrls: [
      { url: 'reddit.com/r/cpp/best_accelerators', citations: 42 },
      { url: 'stackoverflow.com/q/112233/speed-up-builds', citations: 28 },
      { url: 'reddit.com/r/devops/pipeline_optimization', citations: 14 }
    ]
  },
  { 
    type: 'Official docs', 
    urls: 62, 
    percentage: 24, 
    icon: <Shield size={16} />,
    sampleUrls: [
      { url: 'docs.incredibuild.com/integration/ci-cd', citations: 35 },
      { url: 'learn.microsoft.com/en-us/visualstudio/build', citations: 27 }
    ]
  },
  { 
    type: 'How-to guide', 
    urls: 45, 
    percentage: 17, 
    icon: <List size={16} />,
    sampleUrls: [
      { url: 'medium.com/engineering/faster-compilation', citations: 20 },
      { url: 'dev.to/optimizing-unreal-engine-builds', citations: 25 }
    ]
  },
  { 
    type: 'Comparison analysis', 
    urls: 28, 
    percentage: 11, 
    icon: <FileText size={16} />,
    sampleUrls: [
      { url: 'g2.com/products/incredibuild/competitors', citations: 18 },
      { url: 'trustradius.com/compare/incredibuild-vs-distcc', citations: 10 }
    ]
  },
  { 
    type: 'Thought leadership', 
    urls: 18, 
    percentage: 7, 
    icon: <BookOpen size={16} />,
    sampleUrls: [
      { url: 'forbes.com/tech/the-future-of-devops', citations: 12 },
      { url: 'techcrunch.com/2024/build-acceleration-trends', citations: 6 }
    ]
  },
  { 
    type: 'Product page', 
    urls: 15, 
    percentage: 6, 
    icon: <ShoppingBag size={16} />,
    sampleUrls: [
      { url: 'incredibuild.com/solutions/game-dev', citations: 9 },
      { url: 'incredibuild.com/pricing', citations: 6 }
    ]
  },
  { 
    type: 'News announcement', 
    urls: 5, 
    percentage: 2, 
    icon: <Newspaper size={16} />,
    sampleUrls: [
      { url: 'businesswire.com/news/incredibuild-series-b', citations: 5 }
    ]
  },
  { 
    type: 'Video content', 
    urls: 3, 
    percentage: 1, 
    icon: <Video size={16} />,
    sampleUrls: [
      { url: 'youtube.com/watch?v=incredibuild_demo', citations: 3 }
    ]
  },
];

export const ContentPage: React.FC = () => {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  
  // Brand color palette from "Visibility 2"
  const brandTerracotta = '#874B34';

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
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Content Structure Analysis</h3>
          <p className="text-2xl font-black text-slate-900 tracking-tight">
            AI Preference Distribution
          </p>
          <p className="text-sm text-slate-500 mt-2 font-medium italic">
            Content types that have the most effect on how AI models answer questions based on citations
          </p>
        </div>
        
        <div className="overflow-x-auto">
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