
import React from 'react';
import { Target, Link2, FileText, ArrowRight, Info, LayoutList, Sparkles } from 'lucide-react';

interface OverviewPageProps {
  onNavigate: (tab: string) => void;
}

const Tooltip: React.FC<{ content: string }> = ({ content }) => (
  <div className="group relative inline-block ml-1.5">
    <Info size={12} className="text-gray-300 cursor-help hover:text-slate-400 transition-colors" />
    <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-3 w-60 p-3 bg-slate-900 text-white text-[10px] font-medium rounded-xl opacity-0 group-hover:opacity-100 transition-all pointer-events-none z-50 shadow-2xl leading-relaxed border border-white/10 backdrop-blur-md">
      <div className="relative">
        <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 w-3 h-3 bg-slate-900 rotate-45 border-r border-b border-white/10" />
        {content}
      </div>
    </div>
  </div>
);

export const OverviewPage: React.FC<OverviewPageProps> = ({ onNavigate }) => {
  const brandTerracotta = '#874B34';
  const brandBrown = '#2C1308';

  const workstreams = [
    {
      id: 'Prompts',
      title: 'Prompt expansion',
      icon: <Target className="w-4 h-4" />,
      description: 'Define the monitoring scope for brand mentions across top AI models.',
      detailedWhy: 'Expanding your prompt library tracks brand appearance across more AI queries, reveals visibility gaps, and identifies new strategic opportunities for mention growth.',
      cta: 'Manage prompts',
    },
    {
      id: 'Citations',
      title: 'Citation authority',
      icon: <Link2 className="w-4 h-4" />,
      description: 'Audit and influence the external websites driving model answers.',
      detailedWhy: 'AI visibility is influenced by third-party sources. Analysis reveals which external domains drive AI answers, where brand authority is lacking, and competitor citation share.',
      cta: 'Improve citations',
    },
    {
      id: 'Content',
      title: 'Content architecture',
      icon: <FileText className="w-4 h-4" />,
      description: 'Structure your technical documentation for improved RAG performance.',
      detailedWhy: 'Content structure affects AI digestion. Identify which formats AI models prefer citing and structure technical data for improved retrieval-augmented generation (RAG).',
      cta: 'Improve content',
    },
    {
      id: 'Improve',
      title: 'Improve',
      icon: <LayoutList className="w-4 h-4" />,
      description: 'Execute and track visibility tasks from your customized growth roadmap.',
      detailedWhy: 'The central task engine for executing visibility improvements. This module manages both DIY tasks and partner-led optimizations with progress tracking.',
      cta: 'Go to Improve',
    }
  ];

  return (
    <div className="space-y-6 pb-12 animate-fadeIn">
      {/* Premium Hero Section - Scaled Down */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden relative group">
        <div className="absolute top-0 left-0 right-0 h-1 bg-blue-500 shadow-[0_1px_6px_rgba(59,130,246,0.2)]" />
        <div className="px-8 py-8 flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
              <span className="text-[9px] font-black tracking-[0.2em] text-slate-400">Setup active</span>
            </div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">Getting started</h2>
          </div>
          <div className="hidden md:block opacity-5 group-hover:opacity-10 transition-opacity">
            <Sparkles size={54} className="text-slate-900" />
          </div>
        </div>
      </div>

      {/* Workstream Grid - Scaled Down */}
      <div className="grid grid-cols-1 gap-4">
        {workstreams.map((ws, idx) => (
          <div 
            key={idx} 
            className="bg-white rounded-xl border border-gray-200 shadow-sm hover:border-slate-300 hover:shadow-md transition-all flex items-center p-6 group cursor-default"
          >
            {/* Icon Surface */}
            <div 
              className="w-11 h-11 rounded-lg flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform duration-300" 
              style={{ backgroundColor: `${brandTerracotta}15`, color: brandTerracotta }}
            >
              {ws.icon}
            </div>

            {/* Content Area */}
            <div className="ml-6 flex-1 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-0.5">
                <div className="flex items-center">
                  <h3 className="text-base font-black text-slate-900 tracking-tight leading-none">{ws.title}</h3>
                  <Tooltip content={ws.detailedWhy} />
                </div>
                <p className="text-xs text-slate-500 font-medium max-w-lg">{ws.description}</p>
              </div>

              {/* Action Trigger */}
              <div className="flex justify-end shrink-0">
                <button 
                  onClick={() => onNavigate(ws.id)}
                  className="flex items-center gap-2 py-2 px-6 rounded-lg font-black text-[11px] tracking-wider transition-all hover:translate-x-1 active:scale-95 shadow-xs hover:shadow-sm"
                  style={{ backgroundColor: brandBrown, color: 'white' }}
                >
                  {ws.cta}
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
