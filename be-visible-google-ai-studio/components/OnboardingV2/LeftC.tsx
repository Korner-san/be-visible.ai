import React, { useState } from 'react'
import { Plus, X, Loader2, AlertCircle, Users } from 'lucide-react'

export interface CompetitorEntry { name: string; domain: string }

interface LeftCProps {
  suggestedCompetitors: CompetitorEntry[]
  onLaunch: (competitors: CompetitorEntry[]) => void
  isLaunching: boolean
  launchError: string | null
}

export const LeftC: React.FC<LeftCProps> = ({
  suggestedCompetitors, onLaunch, isLaunching, launchError,
}) => {
  const [added, setAdded] = useState<CompetitorEntry[]>([])
  const [inputValue, setInputValue] = useState('')

  const addCompetitor = (entry: CompetitorEntry) => {
    const trimmed = entry.name.trim()
    if (!trimmed || added.some(a => a.name === trimmed) || added.length >= 8) return
    setAdded(prev => [...prev, { name: trimmed, domain: entry.domain }])
    setInputValue('')
  }

  const removeCompetitor = (name: string) => {
    setAdded(prev => prev.filter(c => c.name !== name))
  }

  const availableSuggestions = suggestedCompetitors.filter(s => !added.some(a => a.name === s.name))

  return (
    <div className="flex flex-col h-full px-10 py-12">
      {/* Logo */}
      <div className="flex items-center gap-2.5 mb-12">
        <div className="w-9 h-9 bg-brand-brown rounded-lg flex items-center justify-center shadow-sm flex-shrink-0">
          <span className="text-white font-bold text-base">B</span>
        </div>
        <span className="font-semibold text-slate-900 text-base tracking-tight">be-visible.ai</span>
      </div>

      {/* Heading */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <Users size={16} className="text-slate-400" />
          <span className="text-xs font-semibold tracking-widest text-slate-400 uppercase">Step 2 of 2</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900 leading-tight tracking-tight">
          Who are your main competitors?
        </h1>
        <p className="text-slate-500 text-sm mt-2 leading-relaxed">
          We'll track how AI mentions them versus your brand — giving you a real Share of Voice score.
        </p>
      </div>

      <div className="flex-1 flex flex-col gap-5 overflow-y-auto">
        {/* Suggestions */}
        {availableSuggestions.length > 0 && (
          <div>
            <p className="text-xs font-medium text-slate-500 mb-2.5">Suggested competitors</p>
            <div className="flex flex-wrap gap-2">
              {availableSuggestions.map(s => (
                <button
                  key={s.name}
                  onClick={() => addCompetitor(s)}
                  disabled={isLaunching || added.length >= 8}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 transition-colors disabled:opacity-40"
                >
                  <Plus size={11} /> {s.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Manual input */}
        <div>
          <p className="text-xs font-medium text-slate-500 mb-2.5">Add a competitor</p>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Competitor name…"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addCompetitor({ name: inputValue, domain: '' }) }}
              disabled={isLaunching || added.length >= 8}
              className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-brown/20 focus:border-brand-brown transition-all disabled:opacity-50"
            />
            <button
              onClick={() => addCompetitor({ name: inputValue, domain: '' })}
              disabled={!inputValue.trim() || isLaunching || added.length >= 8}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 transition-colors disabled:opacity-40"
            >
              Add
            </button>
          </div>
        </div>

        {/* Added list */}
        {added.length > 0 && (
          <div>
            <p className="text-xs font-medium text-slate-500 mb-2.5">
              Tracking {added.length} competitor{added.length !== 1 ? 's' : ''}
            </p>
            <div className="flex flex-wrap gap-2">
              {added.map(c => (
                <span
                  key={c.name}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-brown/8 border border-brand-brown/20 rounded-lg text-xs font-medium text-brand-brown"
                >
                  {c.name}
                  <button
                    onClick={() => removeCompetitor(c.name)}
                    disabled={isLaunching}
                    className="text-brand-brown/60 hover:text-brand-brown transition-colors"
                  >
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="pt-6 mt-auto">
        {launchError && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-xl mb-4">
            <AlertCircle size={15} className="text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-600 leading-relaxed">{launchError}</p>
          </div>
        )}

        <button
          onClick={() => onLaunch(added.length > 0 ? added : [])}
          disabled={isLaunching}
          className="w-full py-3 px-6 bg-brand-brown text-white rounded-xl font-semibold text-sm hover:brightness-110 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {isLaunching ? (
            <><Loader2 size={15} className="animate-spin" /> Launching…</>
          ) : (
            'Launch →'
          )}
        </button>

        <p className="text-xs text-slate-400 text-center mt-2.5 leading-relaxed">
          {added.length === 0
            ? 'Competitors are optional — you can add them later from the dashboard'
            : 'Your first 5 prompts will run within minutes of launch'}
        </p>
      </div>
    </div>
  )
}
