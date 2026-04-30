import React from 'react'
import { BarChart2 } from 'lucide-react'

interface RightDProps {
  detectedProjects: string[]
}

export const RightD: React.FC<RightDProps> = ({ detectedProjects }) => {
  const preview = detectedProjects.slice(0, 5)

  return (
    <div className="flex flex-col h-full px-8 py-10 text-white overflow-y-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <BarChart2 size={15} className="text-slate-400" />
          <span className="text-xs font-semibold tracking-widest text-slate-400 uppercase">Project tracking</span>
        </div>
        <h2 className="text-xl font-bold text-white">AI visibility per project</h2>
        <p className="text-slate-400 text-xs mt-1 leading-relaxed">
          Every day, we'll scan AI answers and measure how often each project is mentioned by name — across ChatGPT, Claude, and Google AI.
        </p>
      </div>

      {/* Detected projects preview */}
      {preview.length > 0 && (
        <div className="bg-white/5 rounded-2xl border border-white/8 p-5 mb-6">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Detected projects</p>
          <div className="space-y-2">
            {preview.map(p => (
              <div key={p} className="flex items-center justify-between px-3 py-2 bg-white/5 rounded-xl">
                <span className="text-sm text-white font-medium truncate">{p}</span>
                <span className="text-xs text-slate-500 ml-3 whitespace-nowrap">tracking soon</span>
              </div>
            ))}
            {detectedProjects.length > 5 && (
              <p className="text-xs text-slate-500 text-center pt-1">+{detectedProjects.length - 5} more</p>
            )}
          </div>
        </div>
      )}

      {/* What you'll see */}
      <div className="space-y-2.5">
        {[
          { label: 'Daily mention rate per project', desc: 'How often each project appears in AI answers' },
          { label: 'Platform breakdown', desc: 'ChatGPT vs Claude vs Google AI — per project' },
          { label: 'Trend over time', desc: 'Watch visibility grow as your projects gain recognition' },
          { label: 'Edit anytime', desc: 'Add new projects or remove ones from your dashboard' },
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
