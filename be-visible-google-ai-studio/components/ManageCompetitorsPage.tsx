
import React, { useState } from 'react';
import { 
  Plus, 
  Trash2, 
  Globe, 
  Search, 
  PlusCircle,
  ExternalLink,
  Shield,
  ArrowRight
} from 'lucide-react';
import { Competitor } from '../types';

interface ManageCompetitorsPageProps {
  competitors: Competitor[];
  setCompetitors: React.Dispatch<React.SetStateAction<Competitor[]>>;
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

export const ManageCompetitorsPage: React.FC<ManageCompetitorsPageProps> = ({ competitors, setCompetitors }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [newCompName, setNewCompName] = useState('');
  const [newCompWebsite, setNewCompWebsite] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const brandTerracotta = '#874B34';
  const brandBrown = '#2C1308';

  const handleDelete = (id: string) => {
    setCompetitors(prev => prev.filter(c => c.id !== id));
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
                 <p className="text-xs text-slate-500 font-medium mt-1">Add a competitor to track their Ai mentions and visibility score.</p>
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
                  <label className="text-[10px] font-black tracking-widest text-slate-400 ml-1">Website Url</label>
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
                       {comp.website}
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
               <a 
                 href={`https://${comp.website}`} 
                 target="_blank" 
                 rel="noopener noreferrer"
                 className="text-[10px] font-black text-slate-400 hover:text-brand-brown tracking-widest flex items-center gap-1.5 transition-colors"
               >
                 <ExternalLink size={12} />
                 View site
               </a>
               <button 
                 onClick={() => handleDelete(comp.id)}
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
