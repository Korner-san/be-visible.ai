import React, { useState, useEffect } from 'react'
import { CheckCircle2, ChevronDown, ChevronRight, Loader2, Pencil } from 'lucide-react'
import type { BusinessProfile } from './types'

interface LeftBProps {
  profile: BusinessProfile | null
  topics: string[]
  promptsByTopic: Record<string, string[]>
  completedTopics: string[]
  isComplete: boolean
  onConfirm: (edited: Record<string, string[]>) => void
}

export const LeftB: React.FC<LeftBProps> = ({
  profile, topics, promptsByTopic, completedTopics, isComplete, onConfirm,
}) => {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ topic: string; idx: number } | null>(null)
  const [editValue, setEditValue] = useState('')
  const [localPrompts, setLocalPrompts] = useState<Record<string, string[]>>({})

  // Keep local copy in sync with incoming SSE data
  useEffect(() => {
    setLocalPrompts(prev => ({ ...prev, ...promptsByTopic }))
  }, [promptsByTopic])

  // Auto-expand first completed topic when B_READY
  useEffect(() => {
    if (isComplete && topics.length > 0 && expanded === null) {
      setExpanded(topics[0])
    }
  }, [isComplete, topics])

  const totalPrompts = Object.values(localPrompts).reduce((sum, arr) => sum + arr.length, 0)

  const startEdit = (topic: string, idx: number, current: string) => {
    setEditing({ topic, idx })
    setEditValue(current)
  }

  const saveEdit = () => {
    if (!editing) return
    setLocalPrompts(prev => {
      const arr = [...(prev[editing.topic] || [])]
      arr[editing.idx] = editValue.trim() || arr[editing.idx]
      return { ...prev, [editing.topic]: arr }
    })
    setEditing(null)
  }

  // ── Loading state (profile just arrived, topics/prompts still streaming) ────
  if (!profile) {
    return (
      <div className="flex flex-col h-full px-10 py-12 items-center justify-center">
        <Loader2 size={32} className="animate-spin text-brand-brown mb-4" />
        <p className="text-sm font-medium text-slate-600">Scanning your website…</p>
        <p className="text-xs text-slate-400 mt-1">Fetching content and generating profile</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Profile header */}
      <div className="px-10 pt-10 pb-6 border-b border-gray-100">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-brand-brown rounded-xl flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-base">{profile.businessName.charAt(0).toUpperCase()}</span>
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-900 truncate">{profile.businessName}</h2>
            <p className="text-xs text-slate-500">{profile.industry}</p>
          </div>
        </div>

        {/* Brand identity tags */}
        <div className="flex flex-wrap gap-1.5 mt-4">
          {(profile.brandIdentity || []).map(tag => (
            <span key={tag} className="px-2.5 py-1 bg-slate-100 text-slate-600 text-xs rounded-lg font-medium capitalize">
              {tag}
            </span>
          ))}
        </div>

        {/* Progress indicator */}
        {!isComplete ? (
          <div className="mt-4 flex items-center gap-2">
            <Loader2 size={13} className="animate-spin text-brand-brown flex-shrink-0" />
            <span className="text-xs text-slate-500">
              {completedTopics.length < topics.length
                ? `Generating prompts… ${completedTopics.length}/${topics.length || 5} topics done`
                : 'Finalizing…'}
            </span>
          </div>
        ) : (
          <div className="mt-4 flex items-center gap-2">
            <CheckCircle2 size={13} className="text-emerald-500 flex-shrink-0" />
            <span className="text-xs text-slate-500 font-medium">
              {totalPrompts} prompts ready across {topics.length} topics
            </span>
          </div>
        )}
      </div>

      {/* Topics + prompts accordion */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="space-y-2">
          {topics.map(topic => {
            const prompts = localPrompts[topic] || []
            const isDone = completedTopics.includes(topic)
            const isOpen = expanded === topic

            return (
              <div key={topic} className="border border-gray-100 rounded-xl overflow-hidden">
                <button
                  onClick={() => setExpanded(isOpen ? null : topic)}
                  disabled={!isDone}
                  className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-gray-50 transition-colors disabled:cursor-default text-left"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {isDone
                      ? <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0" />
                      : <Loader2 size={14} className="animate-spin text-slate-300 flex-shrink-0" />}
                    <span className="text-sm font-medium text-slate-800 truncate capitalize">{topic}</span>
                    {isDone && <span className="text-xs text-slate-400 flex-shrink-0">{prompts.length} prompts</span>}
                  </div>
                  {isDone && (
                    isOpen
                      ? <ChevronDown size={14} className="text-slate-400 flex-shrink-0" />
                      : <ChevronRight size={14} className="text-slate-400 flex-shrink-0" />
                  )}
                </button>

                {isOpen && prompts.length > 0 && (
                  <div className="border-t border-gray-100 bg-gray-50/50 px-4 py-2 space-y-0.5">
                    {prompts.map((prompt, idx) => (
                      <div key={idx} className="group flex items-start gap-2 py-2">
                        <span className="text-xs text-slate-400 font-mono w-5 flex-shrink-0 mt-0.5">{idx + 1}.</span>
                        {editing?.topic === topic && editing?.idx === idx ? (
                          <div className="flex-1 flex gap-2">
                            <input
                              autoFocus
                              value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              onBlur={saveEdit}
                              onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(null) }}
                              className="flex-1 text-xs text-slate-700 bg-white border border-brand-brown/30 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-brand-brown/30"
                            />
                          </div>
                        ) : (
                          <div className="flex-1 flex items-start gap-1 min-w-0">
                            <p className="text-xs text-slate-700 leading-relaxed flex-1">{prompt}</p>
                            {isComplete && (
                              <button
                                onClick={() => startEdit(topic, idx, prompt)}
                                className="opacity-0 group-hover:opacity-100 flex-shrink-0 p-0.5 text-slate-400 hover:text-brand-brown transition-all"
                              >
                                <Pencil size={11} />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* CTA */}
      {isComplete && (
        <div className="px-6 pb-8 pt-4 border-t border-gray-100">
          <button
            onClick={() => onConfirm(localPrompts)}
            className="w-full py-3 px-6 bg-brand-brown text-white rounded-xl font-semibold text-sm hover:brightness-110 transition-all"
          >
            Looks good → Add competitors
          </button>
          <p className="text-xs text-slate-400 text-center mt-2">
            You can edit individual prompts anytime from the dashboard
          </p>
        </div>
      )}
    </div>
  )
}
