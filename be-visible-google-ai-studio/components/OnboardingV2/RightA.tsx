import React from 'react'
import { Search, BarChart3, Zap } from 'lucide-react'

export const RightA: React.FC = () => {
  return (
    <div className="flex flex-col h-full px-10 py-12 text-white">
      {/* Tagline */}
      <div className="mb-auto">
        <p className="text-xs font-semibold tracking-widest text-slate-400 uppercase mb-6">
          How it works
        </p>
        <h2 className="text-2xl font-bold text-white leading-tight mb-3">
          See yourself through<br />the AI lens
        </h2>
        <p className="text-slate-400 text-sm leading-relaxed max-w-xs">
          AI assistants like ChatGPT, Perplexity, and Gemini are replacing search engines. Be-Visible shows you exactly how they talk about your brand — and your competitors.
        </p>
      </div>

      {/* Feature cards */}
      <div className="flex flex-col gap-3 my-10">
        <div className="flex items-start gap-4 p-4 bg-white/5 rounded-2xl border border-white/8">
          <div className="w-9 h-9 bg-brand-brown/80 rounded-xl flex items-center justify-center flex-shrink-0">
            <Search size={16} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">50 Search Prompts</p>
            <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">Generated across 5 competitive topics — the real queries your customers type into AI</p>
          </div>
        </div>

        <div className="flex items-start gap-4 p-4 bg-white/5 rounded-2xl border border-white/8">
          <div className="w-9 h-9 bg-indigo-600/80 rounded-xl flex items-center justify-center flex-shrink-0">
            <Zap size={16} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Live AI Execution</p>
            <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">We run every prompt against ChatGPT and extract citations, positions, and sentiment</p>
          </div>
        </div>

        <div className="flex items-start gap-4 p-4 bg-white/5 rounded-2xl border border-white/8">
          <div className="w-9 h-9 bg-emerald-700/80 rounded-xl flex items-center justify-center flex-shrink-0">
            <BarChart3 size={16} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Visibility Dashboard</p>
            <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">Brand mention rate, share of voice vs competitors, citation sources — all in one view</p>
          </div>
        </div>
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-3 gap-3 border-t border-white/8 pt-8">
        {[
          { n: '50', label: 'Prompts generated' },
          { n: '5', label: 'Topic categories' },
          { n: '3', label: 'AI platforms tracked' },
        ].map(({ n, label }) => (
          <div key={label} className="text-center">
            <p className="text-2xl font-bold text-white">{n}</p>
            <p className="text-xs text-slate-400 mt-0.5 leading-snug">{label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
