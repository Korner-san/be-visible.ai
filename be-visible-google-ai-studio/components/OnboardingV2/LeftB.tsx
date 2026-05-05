import React, { useState, useEffect } from 'react'
import { CheckCircle2, ChevronDown, ChevronRight, Loader2, LogOut, Pencil } from 'lucide-react'
import type { BusinessProfile } from './types'
import { useAuth } from '../AuthContext'

interface LeftBProps {
  profile: BusinessProfile | null
  topics: string[]
  promptsByTopic: Record<string, string[]>
  completedTopics: string[]
  isComplete: boolean
  onConfirm: (edited: Record<string, string[]>) => void
}

type ParsedPromptMap = Record<string, string[]>

const stripLinePrefix = (line: string) =>
  line.replace(/^\s*(?:[-*•]|\d+[\).]|["'])\s*/, '').trim()

const parsePastedPrompts = (value: string): ParsedPromptMap => {
  const parsed: ParsedPromptMap = {}
  let currentTopic = ''

  const addPrompt = (topic: string, prompt: string) => {
    const cleanTopic = topic.trim()
    const cleanPrompt = stripLinePrefix(prompt)
    if (!cleanTopic || !cleanPrompt) return
    parsed[cleanTopic] = parsed[cleanTopic] || []
    if (!parsed[cleanTopic].includes(cleanPrompt)) parsed[cleanTopic].push(cleanPrompt)
  }

  value.split(/\r?\n/).forEach(rawLine => {
    const line = rawLine.trim()
    if (!line) {
      currentTopic = ''
      return
    }

    const pipeMatch = line.match(/^(.{2,120})\s*\|\s*(.+)$/)
    if (pipeMatch) {
      addPrompt(pipeMatch[1], pipeMatch[2])
      return
    }

    const colonMatch = line.match(/^([^:]{2,120}):\s*(.+)$/)
    if (colonMatch && /^[-*•]|\d+[\).]/.test(colonMatch[2].trim())) {
      currentTopic = colonMatch[1].trim()
      addPrompt(currentTopic, colonMatch[2])
      return
    }

    const looksLikePrompt = /^[-*•]|\d+[\).]/.test(line) || /[?.؟]$/.test(line) || line.length > 55
    if (!currentTopic || !looksLikePrompt) {
      currentTopic = stripLinePrefix(line).replace(/:$/, '').trim()
      parsed[currentTopic] = parsed[currentTopic] || []
      return
    }

    addPrompt(currentTopic, line)
  })

  Object.keys(parsed).forEach(topic => {
    if (parsed[topic].length === 0) delete parsed[topic]
  })

  return parsed
}

export const LeftB: React.FC<LeftBProps> = ({
  profile, topics, promptsByTopic, completedTopics, isComplete, onConfirm,
}) => {
  const { signOut } = useAuth()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ topic: string; idx: number } | null>(null)
  const [editValue, setEditValue] = useState('')
  const [localPrompts, setLocalPrompts] = useState<Record<string, string[]>>({})
  const [localTopics, setLocalTopics] = useState<string[]>([])
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteValue, setPasteValue] = useState('')
  const [pasteError, setPasteError] = useState<string | null>(null)

  useEffect(() => {
    setLocalPrompts(prev => ({ ...prev, ...promptsByTopic }))
  }, [promptsByTopic])

  useEffect(() => {
    setLocalTopics(prev => {
      const next = [...prev]
      topics.forEach(topic => {
        if (!next.includes(topic)) next.push(topic)
      })
      return next
    })
  }, [topics])

  const activeTopics = localTopics.length > 0 ? localTopics : topics
  const totalPrompts = activeTopics.reduce((sum, topic) => sum + (localPrompts[topic] || []).length, 0)

  useEffect(() => {
    if (isComplete && activeTopics.length > 0 && expanded === null) {
      setExpanded(activeTopics[0])
    }
  }, [isComplete, activeTopics, expanded])

  const finalPromptMap = () => {
    const map: Record<string, string[]> = {}
    activeTopics.forEach(topic => {
      const prompts = (localPrompts[topic] || []).map(p => p.trim()).filter(Boolean)
      if (prompts.length > 0) map[topic] = prompts
    })
    return map
  }

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

  const applyPastedPrompts = () => {
    const parsed = parsePastedPrompts(pasteValue)
    const parsedTopics = Object.keys(parsed)
    const parsedPromptCount = parsedTopics.reduce((sum, topic) => sum + parsed[topic].length, 0)

    if (parsedTopics.length === 0 || parsedPromptCount === 0) {
      setPasteError('Paste at least one topic with at least one prompt.')
      return
    }

    setPasteError(null)
    setLocalTopics(parsedTopics)
    setLocalPrompts(parsed)
    setExpanded(parsedTopics[0])
    setPasteOpen(false)
  }

  if (!profile) {
    return (
      <div className="flex flex-col h-full px-10 py-12 items-center justify-center">
        <Loader2 size={32} className="animate-spin text-brand-brown mb-4" />
        <p className="text-sm font-medium text-slate-600">Scanning your website...</p>
        <p className="text-xs text-slate-400 mt-1">Fetching content and generating profile</p>
        <button
          onClick={signOut}
          className="mt-6 flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors"
        >
          <LogOut size={13} /> Back to sign in
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
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

        <div className="flex flex-wrap gap-1.5 mt-4">
          {(profile.brandIdentity || []).map(tag => (
            <span key={tag} className="px-2.5 py-1 bg-slate-100 text-slate-600 text-xs rounded-lg font-medium capitalize">
              {tag}
            </span>
          ))}
        </div>

        {!isComplete ? (
          <div className="mt-4 flex items-center gap-2">
            <Loader2 size={13} className="animate-spin text-brand-brown flex-shrink-0" />
            <span className="text-xs text-slate-500">
              {completedTopics.length < topics.length
                ? `Generating prompts... ${completedTopics.length}/${topics.length || 5} topics done`
                : 'Finalizing...'}
            </span>
          </div>
        ) : (
          <div className="mt-4 flex items-center gap-2">
            <CheckCircle2 size={13} className="text-emerald-500 flex-shrink-0" />
            <span className="text-xs text-slate-500 font-medium">
              {totalPrompts} prompts ready across {activeTopics.length} topics
            </span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {isComplete && (
          <div className="mb-4 rounded-xl border border-brand-brown/15 bg-brand-brown/[0.03] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Use your own topics and prompts</h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Paste your preferred topic and prompt structure here. Applying it replaces the generated suggestions for this onboarding.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPasteOpen(prev => !prev)}
                className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-slate-700 hover:bg-gray-50"
              >
                {pasteOpen ? 'Close' : 'Paste prompts'}
              </button>
            </div>

            {pasteOpen && (
              <div className="mt-3 space-y-3">
                <textarea
                  value={pasteValue}
                  onChange={e => {
                    setPasteValue(e.target.value)
                    setPasteError(null)
                  }}
                  rows={9}
                  placeholder={'איכות בנייה בפרויקטים חדשים\n- השווה בין יזמים לפי איכות הבנייה בפרויקטים חדשים בישראל\n- אילו חברות נדל״ן מוכרות בדירות חדשות עם סטנדרט בנייה גבוה?\n\nהשקעה בדירות חדשות\n- איפה כדאי להשקיע בדירה חדשה בישראל בשנים הקרובות?\n- השווה בין ערים בישראל לפי פוטנציאל עליית ערך בדירות חדשות'}
                  className="w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs leading-relaxed text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-brown/20 focus:border-brand-brown"
                />
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Format: topic line, then prompt lines. Blank line starts a new topic. You can also paste rows like Topic | Prompt.
                  </p>
                  <button
                    type="button"
                    onClick={applyPastedPrompts}
                    className="flex-shrink-0 px-3 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
                  >
                    Replace generated prompts
                  </button>
                </div>
                {pasteError && <p className="text-xs text-red-600">{pasteError}</p>}
              </div>
            )}
          </div>
        )}

        <div className="space-y-2">
          {activeTopics.map(topic => {
            const prompts = localPrompts[topic] || []
            const isDone = isComplete || completedTopics.includes(topic)
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
                      <div key={`${topic}-${idx}`} className="group flex items-start gap-2 py-2">
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
                                type="button"
                                onClick={() => startEdit(topic, idx, prompt)}
                                className="opacity-0 group-hover:opacity-100 flex-shrink-0 p-0.5 text-slate-400 hover:text-brand-brown transition-all"
                                aria-label="Edit prompt"
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

      {isComplete && (
        <div className="px-6 pb-8 pt-4 border-t border-gray-100">
          <button
            onClick={() => onConfirm(finalPromptMap())}
            disabled={totalPrompts === 0}
            className="w-full py-3 px-6 bg-brand-brown text-white rounded-xl font-semibold text-sm hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Looks good {'->'} Add competitors
          </button>
          <button
            type="button"
            onClick={signOut}
            className="mx-auto mt-3 flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            <LogOut size={13} /> Back to sign in
          </button>
        </div>
      )}
    </div>
  )
}
