import React from 'react'
import { TrendingUp } from 'lucide-react'
import type { BusinessProfile } from './types'

interface RightCProps {
  brandName: string
  profile: BusinessProfile | null
}

export const RightC: React.FC<RightCProps> = ({ brandName, profile }) => {
  const rawCompetitors = profile?.suggestedCompetitors?.slice(0, 4) || [{ name: 'Competitor A', domain: '' }, { name: 'Competitor B', domain: '' }, { name: 'Competitor C', domain: '' }]
  const competitors = rawCompetitors.map((c: any) => typeof c === 'string' ? c : c.name)

  // Mock SOV bars — brand will be highlighted
  const rows = [
    { name: brandName || 'Your Brand', pct: 38, isYou: true },
    ...competitors.slice(0, 3).map((c: string, i: number) => ({ name: c, pct: [28, 21, 13][i] ?? 10, isYou: false })),
  ]

  return (
    <div className="flex flex-col h-full px-8 py-10 text-white overflow-y-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <TrendingUp size={15} className="text-slate-400" />
          <span className="text-xs font-semibold tracking-widest text-slate-400 uppercase">Share of voice preview</span>
        </div>
        <h2 className="text-xl font-bold text-white">Track your AI visibility</h2>
        <p className="text-slate-400 text-xs mt-1">
          After launch, this is how you'll see your brand vs competitors across every AI prompt.
        </p>
      </div>

      {/* SOV bar chart mock */}
      <div className="bg-white/5 rounded-2xl border border-white/8 p-5 mb-6">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Brand mention rate</p>
        <div className="space-y-3">
          {rows.map(row => (
            <div key={row.name}>
              <div className="flex items-center justify-between mb-1.5">
                <span className={`text-sm font-medium truncate max-w-[55%] ${row.isYou ? 'text-white' : 'text-slate-400'}`}>
                  {row.name}
                  {row.isYou && <span className="ml-1.5 text-xs text-brand-brown font-semibold">you</span>}
                </span>
                <span className={`text-sm font-bold ${row.isYou ? 'text-white' : 'text-slate-500'}`}>
                  —%
                </span>
              </div>
              <div className="h-2 bg-white/8 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${row.isYou ? 'bg-brand-brown' : 'bg-white/20'}`}
                  style={{ width: `${row.pct}%`, opacity: 0.5 }}
                />
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-500 mt-4 text-center">Real data populates after your first report runs</p>
      </div>

      {/* What you'll see */}
      <div className="space-y-2.5">
        {[
          { label: 'Which AI mentions your brand', desc: 'ChatGPT, Perplexity, Google AI' },
          { label: 'Where competitors rank vs you', desc: 'Per topic, per prompt, per platform' },
          { label: 'Which URLs get cited', desc: 'Exact sources AI links to when mentioning your brand' },
          { label: 'Trend over time', desc: 'Daily reports show how visibility evolves' },
        ].map(({ label, desc }) => (
          <div key={label} className="flex items-start gap-3 px-4 py-3 bg-white/5 rounded-xl border border-white/8">
            <div className="w-1.5 h-1.5 bg-brand-brown rounded-full flex-shrink-0 mt-1.5" />
            <div>
              <p className="text-sm font-medium text-white">{label}</p>
              <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
