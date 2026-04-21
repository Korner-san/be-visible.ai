import React from 'react'
import { BarChart3, Clock, Loader2 } from 'lucide-react'
import type { BusinessProfile } from './types'

interface RightBProps {
  profile: BusinessProfile | null
  topics: string[]
  promptsByTopic: Record<string, string[]>
  completedTopics: string[]
  isComplete: boolean
}

export const RightB: React.FC<RightBProps> = ({
  profile, topics, promptsByTopic, completedTopics, isComplete,
}) => {
  const totalDone = Object.values(promptsByTopic).reduce((s, a) => s + a.length, 0)
  const totalExpected = (topics.length || 5) * 10

  return (
    <div className="flex flex-col h-full px-8 py-10 text-white overflow-y-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <BarChart3 size={15} className="text-slate-400" />
          <span className="text-xs font-semibold tracking-widest text-slate-400 uppercase">Dashboard preview</span>
        </div>
        <h2 className="text-xl font-bold text-white">
          {isComplete ? 'Prompts ready for launch' : 'Assembling your dashboard…'}
        </h2>
        <p className="text-slate-400 text-xs mt-1">
          {isComplete
            ? `${totalDone} prompts across ${topics.length} topics`
            : `${totalDone} / ${totalExpected} prompts generated`}
        </p>
      </div>

      {/* Progress bar (only while loading) */}
      {!isComplete && (
        <div className="mb-8">
          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-brown rounded-full transition-all duration-500"
              style={{ width: `${totalExpected > 0 ? Math.min(100, (totalDone / totalExpected) * 100) : 0}%` }}
            />
          </div>
        </div>
      )}

      {/* Topic cards */}
      <div className="space-y-2 mb-8">
        {topics.length > 0 ? topics.map(topic => {
          const count = (promptsByTopic[topic] || []).length
          const isDone = completedTopics.includes(topic)
          return (
            <div key={topic} className="flex items-center justify-between px-4 py-3 bg-white/5 rounded-xl border border-white/8">
              <div className="flex items-center gap-2.5 min-w-0">
                {isDone
                  ? <div className="w-2 h-2 bg-emerald-400 rounded-full flex-shrink-0" />
                  : <Loader2 size={12} className="animate-spin text-slate-500 flex-shrink-0" />}
                <span className="text-sm text-slate-300 truncate capitalize">{topic}</span>
              </div>
              <span className="text-xs text-slate-500 flex-shrink-0 ml-2">
                {isDone ? `${count} prompts` : '…'}
              </span>
            </div>
          )
        }) : (
          // Skeleton while topics haven't arrived yet
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3 bg-white/5 rounded-xl border border-white/8">
              <div className="w-2 h-2 bg-white/10 rounded-full animate-pulse" />
              <div className="h-3 bg-white/10 rounded-full flex-1 animate-pulse" style={{ width: `${55 + i * 7}%` }} />
            </div>
          ))
        )}
      </div>

      {/* Metrics preview (mocked) */}
      <div className="grid grid-cols-2 gap-3 mb-8">
        {[
          { label: 'Brand mention rate', value: isComplete ? '—' : '—' },
          { label: 'Share of voice', value: '—' },
          { label: 'Citations found', value: '—' },
          { label: 'AI platforms', value: '3' },
        ].map(({ label, value }) => (
          <div key={label} className="p-3 bg-white/5 rounded-xl border border-white/8">
            <p className="text-xs text-slate-500 mb-1">{label}</p>
            <div className="flex items-center gap-1.5">
              {value === '—' ? (
                <div className="flex items-center gap-1 text-slate-500">
                  <Clock size={11} />
                  <span className="text-xs">Populating…</span>
                </div>
              ) : (
                <span className="text-lg font-bold text-white">{value}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Tip */}
      <div className="mt-auto p-4 bg-white/5 rounded-2xl border border-white/8">
        <p className="text-xs text-slate-400 leading-relaxed">
          <span className="text-white font-medium">After launch</span> — your first 5 prompts run immediately across ChatGPT. The remaining 45 run in the background over the next few hours.
        </p>
      </div>
    </div>
  )
}
