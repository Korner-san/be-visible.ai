import React, { useState } from 'react'
import { Plus, Trash2, Building2, MapPin, AlertCircle } from 'lucide-react'

export interface ProjectEntry {
  project_name: string
  city: string
}

interface ProjectRow {
  id: number
  project_name: string
  city: string
}

interface LeftDProps {
  detectedProjects: Array<{ project_name: string; city: string | null }>
  detectedCities: string[]
  onContinue: (projects: ProjectEntry[]) => void
}

let rowIdCounter = 0
function nextId() { return ++rowIdCounter }

export const LeftD: React.FC<LeftDProps> = ({ detectedProjects, detectedCities, onContinue }) => {
  const [rows, setRows] = useState<ProjectRow[]>(() =>
    detectedProjects.length > 0
      ? detectedProjects.map(p => ({ id: nextId(), project_name: p.project_name, city: p.city || '' }))
      : []
  )
  const [confirmEmpty, setConfirmEmpty] = useState(false)

  const addRow = () => setRows(prev => [...prev, { id: nextId(), project_name: '', city: '' }])

  const removeRow = (id: number) => setRows(prev => prev.filter(r => r.id !== id))

  const updateRow = (id: number, field: 'project_name' | 'city', value: string) =>
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r))

  const filledRows = rows.filter(r => r.project_name.trim())
  const hasInvalidRow = filledRows.some(r => !r.city.trim())

  const handleContinue = () => {
    if (filledRows.length === 0 && !confirmEmpty) {
      setConfirmEmpty(true)
      return
    }
    const entries: ProjectEntry[] = filledRows.map(r => ({
      project_name: r.project_name.trim(),
      city: r.city.trim(),
    })).filter(e => e.city)
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
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Building2 size={16} className="text-slate-400" />
          <span className="text-xs font-semibold tracking-widest text-slate-400 uppercase">Step 2 of 3</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900 leading-tight tracking-tight">
          Review your projects
        </h1>
        <p className="text-slate-500 text-sm mt-2 leading-relaxed">
          We'll track how often AI mentions each project by name. Each project needs a city — add or remove as needed.
        </p>
      </div>

      {/* Table header */}
      <div className="grid grid-cols-[1fr_1fr_36px] gap-2 mb-2 px-1">
        <span className="text-[10px] font-black tracking-widest text-slate-400 uppercase">Project name</span>
        <span className="text-[10px] font-black tracking-widest text-slate-400 uppercase">City</span>
        <span />
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {rows.map(row => (
          <div key={row.id} className="grid grid-cols-[1fr_1fr_36px] gap-2 items-center">
            <input
              type="text"
              placeholder="e.g. פרויקט השמש"
              value={row.project_name}
              onChange={e => updateRow(row.id, 'project_name', e.target.value)}
              className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-brown/20 focus:border-brand-brown transition-all"
            />
            <div className="relative">
              <MapPin size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none" />
              <input
                type="text"
                placeholder="e.g. תל אביב"
                value={row.city}
                onChange={e => updateRow(row.id, 'city', e.target.value)}
                list={`city-suggestions-${row.id}`}
                className={`w-full pl-8 pr-3 py-2.5 bg-gray-50 border rounded-xl text-sm text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-brown/20 focus:border-brand-brown transition-all ${
                  row.project_name.trim() && !row.city.trim() ? 'border-rose-300 bg-rose-50/30' : 'border-gray-200'
                }`}
              />
              {detectedCities.length > 0 && (
                <datalist id={`city-suggestions-${row.id}`}>
                  {detectedCities.map(c => <option key={c} value={c} />)}
                </datalist>
              )}
            </div>
            <button
              onClick={() => removeRow(row.id)}
              className="w-9 h-9 flex items-center justify-center text-slate-200 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}

        {rows.length === 0 && (
          <div className="py-8 text-center text-slate-400 text-sm">
            No projects yet — click "+ Add project" to add one.
          </div>
        )}

        {/* Add row button */}
        <button
          onClick={addRow}
          className="mt-2 flex items-center gap-2 text-xs font-semibold text-brand-brown hover:text-brand-brown/80 transition-colors"
        >
          <Plus size={14} /> Add project
        </button>
      </div>

      {/* Validation hint */}
      {hasInvalidRow && (
        <div className="mt-3 flex items-center gap-2 text-xs text-rose-500 font-medium">
          <AlertCircle size={13} />
          Every project needs a city before you can continue.
        </div>
      )}

      {/* Confirm zero-projects warning */}
      {confirmEmpty && filledRows.length === 0 && (
        <div className="mt-3 flex items-center gap-2 text-xs text-amber-600 font-medium bg-amber-50 px-3 py-2 rounded-lg border border-amber-200">
          <AlertCircle size={13} />
          No projects added. Click Continue again to proceed without any.
        </div>
      )}

      {/* Footer */}
      <div className="pt-5 mt-auto">
        <button
          onClick={handleContinue}
          disabled={hasInvalidRow}
          className="w-full py-3 px-6 bg-brand-brown text-white rounded-xl font-semibold text-sm hover:brightness-110 transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
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
