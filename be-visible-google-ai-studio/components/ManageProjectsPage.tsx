import React, { useState, useEffect } from 'react'
import { Plus, Trash2, Search, Building2, MapPin, AlertTriangle, X, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'

interface Project {
  id: string
  project_name: string
  city: string | null
  is_active: boolean
}

interface ManageProjectsPageProps {
  brandId: string | null
}

export const ManageProjectsPage: React.FC<ManageProjectsPageProps> = ({ brandId }) => {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newCity, setNewCity] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Project | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    if (!brandId) return
    setLoading(true)
    supabase
      .from('real_estate_projects')
      .select('id, project_name, city, is_active')
      .eq('brand_id', brandId)
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        setProjects(data || [])
        setLoading(false)
      })
  }, [brandId])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim() || !brandId) return
    setIsSaving(true)
    const { data, error } = await supabase
      .from('real_estate_projects')
      .insert({ brand_id: brandId, project_name: newName.trim(), city: newCity.trim() || null })
      .select('id, project_name, city, is_active')
      .single()
    if (!error && data) {
      setProjects(prev => [...prev, data])
      setNewName('')
      setNewCity('')
      setIsAdding(false)
    }
    setIsSaving(false)
  }

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return
    setIsDeleting(true)
    const { error } = await supabase
      .from('real_estate_projects')
      .update({ is_active: false })
      .eq('id', pendingDelete.id)
    if (!error) {
      setProjects(prev => prev.filter(p => p.id !== pendingDelete.id))
      setPendingDelete(null)
    }
    setIsDeleting(false)
  }

  const filtered = projects.filter(p =>
    p.project_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.city || '').toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="space-y-6 animate-fadeIn pb-24">

      {/* Delete Confirmation Modal */}
      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-[28px] shadow-2xl max-w-md w-full p-8 space-y-6 animate-slideDown">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-xl bg-rose-50 text-rose-500 shrink-0">
                <AlertTriangle size={22} />
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-900 tracking-tight leading-tight">
                  Remove "{pendingDelete.project_name}"?
                </h2>
                <p className="text-xs text-slate-400 font-medium mt-1">This action cannot be undone.</p>
              </div>
              <button onClick={() => setPendingDelete(null)} className="ml-auto p-1.5 text-slate-300 hover:text-slate-500 transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="bg-slate-50 rounded-2xl p-5 space-y-3">
              <p className="text-[10px] font-black tracking-widest text-slate-400 uppercase mb-2">What will happen</p>
              <div className="space-y-2.5">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" />
                  <p className="text-sm text-slate-600 leading-snug">
                    <span className="font-bold">{pendingDelete.project_name}</span> will stop being tracked in future reports.
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                  <p className="text-sm text-slate-600 leading-snug">
                    Historical mention data for this project will no longer appear in the Projects dashboard.
                  </p>
                </div>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setPendingDelete(null)}
                disabled={isDeleting}
                className="px-6 py-3 text-slate-400 font-black text-[10px] tracking-widest hover:text-slate-600 transition-colors disabled:opacity-40"
              >
                Keep project
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-8 py-3 bg-rose-500 text-white rounded-xl text-[10px] font-black tracking-widest shadow-lg shadow-rose-500/20 hover:bg-rose-600 transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {isDeleting ? <><Loader2 size={13} className="animate-spin" /> Removing…</> : 'Yes, remove'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Search projects or cities..."
            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-brown/10"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <button
          onClick={() => setIsAdding(!isAdding)}
          className="w-full md:w-auto flex items-center justify-center gap-2 px-6 py-2.5 bg-brand-brown text-white rounded-xl text-xs font-black tracking-widest hover:scale-[1.02] transition-all shadow-lg shadow-brand-brown/10"
        >
          {isAdding ? 'Close form' : <><Plus size={16} /> Add project</>}
        </button>
      </div>

      {/* Add Form */}
      {isAdding && (
        <div className="bg-white p-8 rounded-[32px] border-2 border-brand-brown/10 shadow-xl animate-slideDown">
          <form onSubmit={handleAdd} className="space-y-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-lg bg-brand-brown/5 text-brand-brown">
                <Building2 size={20} />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900 tracking-tight leading-none">Add new project</h3>
                <p className="text-xs text-slate-500 font-medium mt-1">We'll track how often AI mentions this project by name.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black tracking-widest text-slate-400 ml-1">Project name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. פרויקט השמש"
                  className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-brown/10 focus:border-brand-brown outline-none font-bold text-slate-700 transition-all"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black tracking-widest text-slate-400 ml-1">City / Neighborhood (optional)</label>
                <div className="relative">
                  <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                  <input
                    type="text"
                    placeholder="e.g. תל אביב"
                    className="w-full pl-12 pr-5 py-4 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-brown/10 focus:border-brand-brown outline-none font-bold text-slate-700 transition-all"
                    value={newCity}
                    onChange={e => setNewCity(e.target.value)}
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="px-6 py-3 text-slate-400 font-black text-[10px] tracking-widest hover:text-slate-600 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-10 py-3 bg-brand-brown text-white rounded-xl text-[10px] font-black tracking-widest shadow-xl shadow-brand-brown/20 hover:scale-[1.02] transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {isSaving ? <><Loader2 size={13} className="animate-spin" /> Saving…</> : 'Start tracking'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Projects Grid */}
      {loading ? (
        <div className="py-20 flex items-center justify-center">
          <Loader2 size={28} className="animate-spin text-brand-brown/40" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map(p => (
            <div key={p.id} className="bg-white rounded-[24px] border border-gray-200 shadow-sm p-6 group hover:border-brand-brown/30 hover:shadow-md transition-all flex flex-col">
              <div className="flex items-start justify-between mb-3">
                <div className="p-2.5 rounded-xl bg-brand-brown/5 text-brand-brown">
                  <Building2 size={20} />
                </div>
                <button
                  onClick={() => setPendingDelete(p)}
                  className="p-2 text-slate-200 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <h4 className="text-base font-black text-slate-900 tracking-tight mt-1">{p.project_name}</h4>
              {p.city && (
                <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium mt-1">
                  <MapPin size={12} />
                  {p.city}
                </div>
              )}
              <div className="flex-1" />
              <div className="mt-4 pt-3 border-t border-gray-100">
                <span className="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-1 rounded-full">Tracking</span>
              </div>
            </div>
          ))}

          {filtered.length === 0 && (
            <div className="col-span-full py-20 bg-gray-50/50 rounded-[32px] border-2 border-dashed border-gray-200 flex flex-col items-center justify-center text-center space-y-4">
              <div className="p-4 rounded-full bg-white shadow-sm text-gray-300">
                <Building2 size={32} />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-slate-700">No projects found</h3>
                <p className="text-sm text-slate-400 max-w-xs">
                  {searchQuery ? 'Try adjusting your search.' : 'Add your first project to start tracking its AI visibility.'}
                </p>
              </div>
              {!searchQuery && (
                <button
                  onClick={() => setIsAdding(true)}
                  className="px-6 py-2 bg-white border border-gray-200 rounded-xl text-xs font-black text-brand-brown tracking-widest hover:border-brand-brown transition-all"
                >
                  Add your first project
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
