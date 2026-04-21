import React from 'react'
import { Globe, Zap, BarChart3, TrendingUp } from 'lucide-react'

const STEPS = [
  {
    icon: Globe,
    color: 'bg-slate-700',
    title: 'Scan your website',
    desc: 'We read your site and extract your brand positioning, industry, and competitive space',
  },
  {
    icon: Zap,
    color: 'bg-brand-brown/80',
    title: 'Generate 50 search prompts',
    desc: '5 topic categories × 10 realistic queries — the exact searches your customers run on AI',
  },
  {
    icon: BarChart3,
    color: 'bg-indigo-700/80',
    title: 'Run live on ChatGPT',
    desc: 'Every prompt is executed and we extract brand mentions, citations, and sentiment scores',
  },
  {
    icon: TrendingUp,
    color: 'bg-emerald-700/80',
    title: 'Track your AI visibility',
    desc: 'Daily brand mention rate, share of voice vs competitors, and citation sources — all in one dashboard',
  },
]

export const RightA: React.FC = () => {
  return (
    <div className="flex flex-col h-full px-10 py-12 text-white">
      <div className="mb-10">
        <p className="text-xs font-semibold tracking-widest text-slate-400 uppercase mb-3">
          What happens next
        </p>
        <h2 className="text-2xl font-bold text-white leading-tight">
          From website to<br />AI visibility score
        </h2>
        <p className="text-slate-400 text-sm mt-2 leading-relaxed">
          Takes about 20–30 seconds to generate. Your full report runs in the background.
        </p>
      </div>

      {/* Vertical flowchart */}
      <div className="flex flex-col gap-0 flex-1">
        {STEPS.map((step, idx) => {
          const Icon = step.icon
          const isLast = idx === STEPS.length - 1
          return (
            <div key={idx} className="flex gap-4">
              {/* Left column: icon + connector line */}
              <div className="flex flex-col items-center flex-shrink-0" style={{ width: 36 }}>
                <div className={`w-9 h-9 ${step.color} rounded-xl flex items-center justify-center flex-shrink-0 z-10`}>
                  <Icon size={16} className="text-white" />
                </div>
                {!isLast && (
                  <div className="w-px flex-1 bg-white/10 my-1" style={{ minHeight: 20 }} />
                )}
              </div>

              {/* Right column: text */}
              <div className={`pb-6 min-w-0 ${isLast ? '' : ''}`}>
                <p className="text-sm font-semibold text-white leading-tight">{step.title}</p>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">{step.desc}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
