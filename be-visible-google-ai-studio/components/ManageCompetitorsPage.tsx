
import React, { useState } from 'react';
import {
  Plus,
  Trash2,
  Globe,
  Search,
  Shield,
  ArrowRight,
  ExternalLink,
  AlertTriangle,
  X,
} from 'lucide-react';
import { Competitor } from '../types';

interface ManageCompetitorsPageProps {
  competitors: Competitor[];
  setCompetitors: React.Dispatch<React.SetStateAction<Competitor[]>>;
  brandId: string | null;
}

const DomainLogo = ({ domain }: { domain: string }) => {
  const [error, setError] = useState(false);
  const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;

  if (error) {
    return <Globe size={20} className="text-gray-300" />;
  }

  return (
    <img
      src={faviconUrl}
      alt={`${domain} logo`}
      className="w-8 h-8 object-contain rounded-lg"
      onError={() => setError(true)}
    />
  );
};

interface PendingDelete {
  id: string;
  name: string;
  website: string;
}

export const ManageCompetitorsPage: React.FC<ManageCompetitorsPageProps> = ({ competitors, setCompetitors, brandId }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [newCompName, setNewCompName] = useState('');
  const [newCompWebsite, setNewCompWebsite] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteClick = (comp: Competitor) => {
    setPendingDelete({ id: comp.id, name: comp.name, website: comp.website });
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete || !brandId) return;
    setIsDeleting(true);
    try {
      const res = await fetch('/api/competitors/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ competitorId: pendingDelete.id, brandId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        console.error('[DeleteCompetitor] API error:', data.error);
        return;
      }
      setCompetitors(prev => prev.filter(c => c.id !== pendingDelete.id));
      setPendingDelete(null);
    } catch (err) {
      console.error('[DeleteCompetitor] Unexpected error:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCompName.trim() || !newCompWebsite.trim()) return;

    const colors = ['#874B34', '#BC633A', '#E7B373', '#963D1F', '#2C1308', '#64748b'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];

    const newComp: Competitor = {
      id: `c-${Date.now()}`,
      name: newCompName,
      website: newCompWebsite,
      color: randomColor
    };

    setCompetitors(prev => [...prev, newComp]);
    setNewCompName('');
    setNewCompWebsite('');
    setIsAdding(false);
  };

  const filteredCompetitors = competitors.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.website.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fadeIn pb-24">

      {/* ── Delete Confirmation Modal ─────────────────────────────────────── */}
      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-[28px] shadow-2xl max-w-md w-full p-8 space-y-6 animate-slideDown">
            {/* Icon + title */}
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-xl bg-rose-50 text-rose-500 shrink-0">
                <AlertTriangle size={22} />
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-900 tracking-tight leading-tight">
                  Remove "{pendingDelete.name}"?
                </h2>
                <p className="text-xs text-slate-400 font-medium mt-1">This action cannot be undone.</p>
              </div>
              <button
                onClick={() => setPendingDelete(null)}
                className="ml-auto p-1.5 text-slate-300 hover:text-slate-500 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Impact list */}
            <div className="bg-slate-50 rounded-2xl p-5 space-y-3">
              <p className="text-[10px] font-black tracking-widest text-slate-400 uppercase mb-2">What will happen</p>
              <div className="space-y-2.5">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" />
                  <p className="text-sm text-slate-600 leading-snug">
                    <span className="font-bold">{pendingDelete.name}</span> will be removed from your tracked competitors immediately.
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" />
                  <p className="text-sm text-slate-600 leading-snug">
                    All historical report data for this competitor will be erased — past mention rates, visibility scores, and benchmarks will be gone.
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                  <p className="text-sm text-slate-600 leading-snug">
                    If <span className="font-bold">{pendingDelete.name}</span> appears as an entity in AI responses, it will show up again under "Detected Entities" as available to re-add.
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" />
                  <p className="text-sm text-slate-600 leading-snug">
                    Future reports will no longer track or score this competitor.
                  </p>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setPendingDelete(null)}
                disabled={isDeleting}
                className="px-6 py-3 text-slate-400 font-black text-[10px] tracking-widest hover:text-slate-600 transition-colors disabled:opacity-40"
              >
                Keep competitor
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-8 py-3 bg-rose-500 text-white rounded-xl text-[10px] font-black tracking-widest shadow-lg shadow-rose-500/20 hover:bg-rose-600 transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {isDeleting ? 'Removing…' : 'Yes, remove permanently'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header with Search and Toggle Add */}
      <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Search tracked competitors..."
            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-brown/10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <button
          onClick={() => setIsAdding(!isAdding)}
          className="w-full md:w-auto flex items-center justify-center gap-2 px-6 py-2.5 bg-brand-brown text-white rounded-xl text-xs font-black tracking-widest hover:scale-[1.02] transition-all shadow-lg shadow-brand-brown/10"
        >
          {isAdding ? 'Close form' : <><Plus size={16} /> Add competitor</>}
        </button>
      </div>

      {/* Add Competitor Form */}
      {isAdding && (
        <div className="bg-white p-8 rounded-[32px] border-2 border-brand-brown/10 shadow-xl animate-slideDown">
          <form onSubmit={handleAdd} className="space-y-6">
            <div className="flex items-center gap-3 mb-2">
               <div className="p-2 rounded-lg bg-brand-brown/5 text-brand-brown">
                 <Shield size={20} />
               </div>
               <div>
                 <h3 className="text-lg font-black text-slate-900 tracking-tight leading-none">Benchmark new brand</h3>
                 <p className="text-xs text-slate-500 font-medium mt-1">Add a competitor to track their AI mentions and visibility score.</p>
               </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
               <div className="space-y-1.5">
                  <label className="text-[10px] font-black tracking-widest text-slate-400 ml-1">Company name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. GitLab"
                    className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-brown/10 focus:border-brand-brown outline-none font-bold text-slate-700 transition-all"
                    value={newCompName}
                    onChange={(e) => setNewCompName(e.target.value)}
                  />
               </div>
               <div className="space-y-1.5">
                  <label className="text-[10px] font-black tracking-widest text-slate-400 ml-1">Website URL</label>
                  <div className="relative">
                    <Globe className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                    <input
                      type="text"
                      required
                      placeholder="e.g. gitlab.com"
                      className="w-full pl-12 pr-5 py-4 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-brown/10 focus:border-brand-brown outline-none font-bold text-slate-700 transition-all"
                      value={newCompWebsite}
                      onChange={(e) => setNewCompWebsite(e.target.value)}
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
                 className="px-10 py-3 bg-brand-brown text-white rounded-xl text-[10px] font-black tracking-widest shadow-xl shadow-brand-brown/20 hover:scale-[1.02] transition-all flex items-center gap-2"
               >
                 Start monitoring <ArrowRight size={14} />
               </button>
            </div>
          </form>
        </div>
      )}

      {/* Competitors List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredCompetitors.map(comp => (
          <div key={comp.id} className="bg-white rounded-[24px] border border-gray-200 shadow-sm p-6 group hover:border-brand-brown/30 hover:shadow-md transition-all flex flex-col h-full">
            <div className="flex items-start justify-between mb-4">
               <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-gray-50 border border-gray-100 rounded-xl flex items-center justify-center p-2 group-hover:bg-white transition-colors">
                     <DomainLogo domain={comp.website} />
                  </div>
                  <div className="space-y-0.5">
                    <h4 className="text-base font-black text-slate-900 tracking-tight">{comp.name}</h4>
                    <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
                       <Globe size={12} />
                       {comp.website || <span className="italic">No website</span>}
                    </div>
                  </div>
               </div>
               <div
                 className="w-3 h-3 rounded-full shadow-sm ring-2 ring-white"
                 style={{ backgroundColor: comp.color }}
               />
            </div>

            <div className="flex-1" />

            <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-between">
               {comp.website ? (
                 <a
                   href={`https://${comp.website}`}
                   target="_blank"
                   rel="noopener noreferrer"
                   className="text-[10px] font-black text-slate-400 hover:text-brand-brown tracking-widest flex items-center gap-1.5 transition-colors"
                 >
                   <ExternalLink size={12} />
                   {comp.website}
                 </a>
               ) : (
                 <span className="text-[10px] font-bold text-slate-300 tracking-widest">No website yet</span>
               )}
               <button
                 onClick={() => handleDeleteClick(comp)}
                 className="p-2 text-slate-200 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                 title="Remove Competitor"
               >
                 <Trash2 size={18} />
               </button>
            </div>
          </div>
        ))}

        {filteredCompetitors.length === 0 && (
          <div className="col-span-full py-20 bg-gray-50/50 rounded-[32px] border-2 border-dashed border-gray-200 flex flex-col items-center justify-center text-center space-y-4">
            <div className="p-4 rounded-full bg-white shadow-sm text-gray-300">
               <Search size={32} />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-slate-700">No competitors found</h3>
              <p className="text-sm text-slate-400 max-w-xs">Try adjusting your search or add a new brand to start benchmarking.</p>
            </div>
            <button
              onClick={() => setIsAdding(true)}
              className="px-6 py-2 bg-white border border-gray-200 rounded-xl text-xs font-black text-brand-brown tracking-widest hover:border-brand-brown transition-all"
            >
              Add your first competitor
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
