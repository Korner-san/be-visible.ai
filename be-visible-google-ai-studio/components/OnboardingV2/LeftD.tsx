import React, { useState } from 'react'
import { Plus, X, Building2 } from 'lucide-react'

export interface ProjectEntry {
  project_name: string
  city?: string
}

interface LeftDProps {
  detectedProjects: string[]
  detectedCities: string[]
  onContinue: (projects: ProjectEntry[]) => void
}

export const LeftD: React.FC<LeftDProps> = ({ detectedProjects, detectedCities, onContinue }) => {
  const [projects, setProjects] = useState<string[]>(detectedProjects)
  const [cities, setCities] = useState<string[]>(detectedCities)
  const [projectInput, setProjectInput] = useState('')
  const [cityInput, setCityInput] = useState('')

  const addProject = () => {
    const trimmed = projectInput.trim()
    if (!trimmed || projects.includes(trimmed) || projects.length >= 20) return
    setProjects(prev => [...prev, trimmed])
    setProjectInput('')
  }

  const removeProject = (name: string) => setProjects(prev => prev.filter(p => p !== name))

  const addCity = () => {
    const trimmed = cityInput.trim()
    if (!trimmed || cities.includes(trimmed) || cities.length >= 15) return
    setCities(prev => [...prev, trimmed])
    setCityInput('')
  }

  const removeCity = (name: string) => setCities(prev => prev.filter(c => c !== name))

  const handleContinue = () => {
    const entries: ProjectEntry[] = projects.map(p => ({ project_name: p }))
    onContinue(entries)
  }

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
          <Building2 size={16} className="text-slate-400" />
          <span className="text-xs font-semibold tracking-widest text-slate-400 uppercase">Step 2 of 3</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900 leading-tight tracking-tight">
          Review your projects &amp; locations
        </h1>
        <p className="text-slate-500 text-sm mt-2 leading-relaxed">
          We detected these from your website. We'll track how often AI mentions each project by name — add or remove as needed.
        </p>
      </div>

      <div className="flex-1 flex flex-col gap-6 overflow-y-auto">
        {/* Projects section */}
        <div>
          <p className="text-xs font-semibold text-slate-600 mb-2.5 uppercase tracking-wider">
            Projects ({projects.length})
          </p>
          {projects.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {projects.map(p => (
                <span
                  key={p}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-brown/8 border border-brand-brown/20 rounded-lg text-xs font-medium text-brand-brown"
                >
                  {p}
                  <button onClick={() => removeProject(p)} className="text-brand-brown/60 hover:text-brand-brown transition-colors">
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
          )}
          {projects.length === 0 && (
            <p className="text-xs text-slate-400 mb-3">No projects detected — add them manually below.</p>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Project name…"
              value={projectInput}
              onChange={e => setProjectInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addProject() }}
              disabled={projects.length >= 20}
              className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-brown/20 focus:border-brand-brown transition-all disabled:opacity-50"
            />
            <button
              onClick={addProject}
              disabled={!projectInput.trim() || projects.length >= 20}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 transition-colors disabled:opacity-40 flex items-center gap-1"
            >
              <Plus size={13} /> Add
            </button>
          </div>
        </div>

        {/* Cities section */}
        <div>
          <p className="text-xs font-semibold text-slate-600 mb-2.5 uppercase tracking-wider">
            Cities &amp; Neighborhoods ({cities.length})
          </p>
          {cities.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {cities.map(c => (
                <span
                  key={c}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-lg text-xs font-medium text-slate-700"
                >
                  {c}
                  <button onClick={() => removeCity(c)} className="text-slate-400 hover:text-slate-600 transition-colors">
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
          )}
          {cities.length === 0 && (
            <p className="text-xs text-slate-400 mb-3">No cities detected — add them manually below.</p>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="City or neighborhood…"
              value={cityInput}
              onChange={e => setCityInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addCity() }}
              disabled={cities.length >= 15}
              className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-brown/20 focus:border-brand-brown transition-all disabled:opacity-50"
            />
            <button
              onClick={addCity}
              disabled={!cityInput.trim() || cities.length >= 15}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 transition-colors disabled:opacity-40 flex items-center gap-1"
            >
              <Plus size={13} /> Add
            </button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="pt-6 mt-auto">
        <button
          onClick={handleContinue}
          className="w-full py-3 px-6 bg-brand-brown text-white rounded-xl font-semibold text-sm hover:brightness-110 transition-all flex items-center justify-center gap-2"
        >
          Continue →
        </button>
        <p className="text-xs text-slate-400 text-center mt-2.5 leading-relaxed">
          You can manage projects anytime from the dashboard
        </p>
      </div>
    </div>
  )
}
