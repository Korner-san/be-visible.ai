
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  Plus, 
  Trash2, 
  Layers, 
  Search, 
  ArrowLeft, 
  MoreVertical, 
  Edit2, 
  X, 
  Filter, 
  ArrowUpDown,
  Save,
  ChevronDown,
  Check
} from 'lucide-react';
import { PromptStats } from '../types';

interface ManagePromptsPageProps {
  prompts: PromptStats[];
  setPrompts: React.Dispatch<React.SetStateAction<PromptStats[]>>;
  onBack: () => void;
}

const formatCategory = (cat: string) => {
  if (!cat) return '';
  return cat
    .split(/[\s_]+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

export const ManagePromptsPage: React.FC<ManagePromptsPageProps> = ({ prompts, setPrompts, onBack }) => {
  const [selectedCategory, setSelectedCategory] = useState<string>(prompts[0]?.category || 'ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [selectedPromptIds, setSelectedPromptIds] = useState<Set<string>>(new Set());
  
  // New Category State
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryInput, setNewCategoryInput] = useState('');
  const [manualCategories, setManualCategories] = useState<string[]>([]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // New Prompt Form States
  const [isAddingPrompt, setIsAddingPrompt] = useState(false);
  const [newPromptText, setNewPromptText] = useState('');
  const [newPromptCategory, setNewPromptCategory] = useState('');

  const categories = useMemo(() => {
    const catsFromPrompts = prompts.map(p => p.category);
    return Array.from(new Set([...catsFromPrompts, ...manualCategories])).filter(Boolean);
  }, [prompts, manualCategories]);

  const filteredPrompts = useMemo(() => {
    let result = [...prompts];
    if (selectedCategory !== 'ALL') {
      result = result.filter(p => p.category === selectedCategory);
    }
    if (searchQuery) {
      result = result.filter(p => p.text.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    
    return result.sort((a, b) => {
      if (a.isActive === b.isActive) return 0;
      return a.isActive ? -1 : 1;
    });
  }, [prompts, selectedCategory, searchQuery]);

  const statusActionText = useMemo(() => {
    if (selectedPromptIds.size === 0) return '';
    const selectedList = prompts.filter(p => selectedPromptIds.has(p.id));
    const allActive = selectedList.every(p => p.isActive);
    const allInactive = selectedList.every(p => !p.isActive);
    
    if (allActive) return 'Deactivate';
    if (allInactive) return 'Activate';
    return 'Toggle status';
  }, [prompts, selectedPromptIds]);

  const handleTogglePromptSelection = (id: string) => {
    const next = new Set(selectedPromptIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedPromptIds(next);
  };

  const handleToggleAllSelection = () => {
    if (selectedPromptIds.size === filteredPrompts.length) {
      setSelectedPromptIds(new Set());
    } else {
      setSelectedPromptIds(new Set(filteredPrompts.map(p => p.id)));
    }
  };

  const handleDeleteSelected = () => {
    setPrompts(prev => prev.filter(p => !selectedPromptIds.has(p.id)));
    setSelectedPromptIds(new Set());
  };

  const handleMoveSelected = (newCat: string) => {
    setPrompts(prev => prev.map(p => selectedPromptIds.has(p.id) ? { ...p, category: newCat } : p));
    setSelectedPromptIds(new Set());
  };

  const handleEditSelected = () => {
    if (selectedPromptIds.size === 1) {
      const [id] = Array.from(selectedPromptIds);
      setEditingPromptId(id);
    }
  };

  const handleDuplicateSelected = () => {
    if (selectedPromptIds.size === 1) {
      const [id] = Array.from(selectedPromptIds);
      const original = prompts.find(p => p.id === id);
      if (original) {
        const copy: PromptStats = {
          ...original,
          id: `p-copy-${Date.now()}`,
          text: original.text,
          isCopy: true,
          lastUpdated: "Just now"
        };
        setPrompts(prev => [...prev, copy]);
        setSelectedPromptIds(new Set());
      }
    }
  };

  const handleToggleActiveSelected = () => {
    if (selectedPromptIds.size > 0) {
      setPrompts(prev => prev.map(p => 
        selectedPromptIds.has(p.id) ? { ...p, isActive: !p.isActive, lastUpdated: "Just now" } : p
      ));
      setSelectedPromptIds(new Set());
    }
  };

  const handleRenameCategory = (oldName: string, newName: string) => {
    if (!newName.trim() || oldName === newName) {
      setEditingCategoryId(null);
      return;
    }
    setPrompts(prev => prev.map(p => p.category === oldName ? { ...p, category: newName } : p));
    setManualCategories(prev => prev.map(c => c === oldName ? newName : c));
    if (selectedCategory === oldName) setSelectedCategory(newName);
    setEditingCategoryId(null);
  };

  const handleDeleteCategory = (catName: string) => {
    setPrompts(prev => prev.filter(p => p.category !== catName));
    setManualCategories(prev => prev.filter(c => c !== catName));
    if (selectedCategory === catName) setSelectedCategory('ALL');
  };

  const handleAddCategory = () => {
    const trimmed = newCategoryInput.trim();
    if (trimmed && !categories.includes(trimmed)) {
      setManualCategories(prev => [...prev, trimmed]);
      setSelectedCategory(trimmed);
      setNewCategoryInput('');
      setIsAddingCategory(false);
    } else {
      setIsAddingCategory(false);
    }
  };

  const handleCreatePrompt = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPromptText.trim()) return;

    const category = newPromptCategory || (selectedCategory !== 'ALL' ? selectedCategory : 'Uncategorized');
    
    const newPrompt: PromptStats = {
      id: `p-${Date.now()}`,
      text: newPromptText,
      category: category,
      isActive: true,
      visibilityScore: 0,
      visibilityTrend: 0,
      avgPosition: 0,
      citationShare: 0,
      citations: 0,
      citationTrend: 0,
      lastRun: "Never",
      history: [],
      language: "En",
      regions: ["Us"],
      tags: [],
      platforms: ["gpt-4"],
      lastUpdated: "Just now"
    };

    setPrompts(prev => [...prev, newPrompt]);
    setNewPromptText('');
    setNewPromptCategory('');
    setIsAddingPrompt(false);
  };

  // Scroll to bottom when adding category box appears
  useEffect(() => {
    if (isAddingCategory && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [isAddingCategory]);

  const activeCategoryStyle = "bg-brand-brown/[0.08] text-brand-brown border border-brand-brown/10";
  const inactiveCategoryStyle = "text-slate-600 hover:bg-slate-50 border border-transparent";
  
  const checkboxClasses = "appearance-none w-3.5 h-3.5 rounded-sm border border-slate-300 bg-transparent checked:bg-brand-brown checked:border-brand-brown checked:bg-[url('data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS13aWR0aD0iNCIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxwYXRoIGQ9Ik0yMCA2TDEwIDE3TDQgMTIiLz48L3N2Zz4=')] bg-center bg-no-repeat bg-[length:9px_9px] transition-all cursor-pointer hover:border-slate-400 focus:outline-none focus:ring-0";

  return (
    <div className="h-screen w-full bg-slate-50 flex flex-col overflow-hidden font-sans text-slate-700">
      {/* Header */}
      <header className="h-14 bg-white border-b border-gray-200 px-6 flex items-center justify-between shrink-0 z-30">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex flex-col">
            <h1 className="text-sm font-black text-slate-900 leading-tight">Prompt management</h1>
            <p className="text-[10px] text-slate-400 font-bold">Power-user iteration hub</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1 bg-slate-100 rounded-full border border-gray-200">
             <Layers size={12} className="text-slate-400" />
             <span className="text-[10px] font-black text-slate-600">
               {prompts.length} / 500 Queries active
             </span>
          </div>
          <button 
            onClick={() => setIsAddingPrompt(!isAddingPrompt)}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-black transition-all shadow-lg ${isAddingPrompt ? 'bg-slate-100 text-slate-500 shadow-none' : 'bg-brand-brown text-white hover:brightness-110 shadow-brand-brown/10'}`}
          >
            {isAddingPrompt ? <X size={14} /> : <Plus size={14} />} 
            {isAddingPrompt ? 'Cancel' : 'Add prompt'}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar: Categories */}
        <aside className="w-64 bg-white border-r border-gray-200 flex flex-col shrink-0 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
             <span className="text-[10px] font-black text-slate-400 tracking-widest">Categories</span>
          </div>
          
          <div 
            ref={scrollContainerRef}
            className="flex-1 overflow-y-auto px-3 py-4 space-y-1.5 custom-scrollbar"
          >
            <div className="pb-1.5 border-b border-slate-200">
              <button 
                onClick={() => setSelectedCategory('ALL')}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-[11px] font-bold transition-all ${
                  selectedCategory === 'ALL' ? activeCategoryStyle : inactiveCategoryStyle
                }`}
              >
                <span className="leading-tight">All prompts</span>
                <span className={`text-[9px] px-2 py-0.5 rounded font-black shrink-0 ml-2 ${selectedCategory === 'ALL' ? 'bg-brand-brown/10 text-brand-brown' : 'bg-slate-100 text-slate-400'}`}>
                  {prompts.length}
                </span>
              </button>
            </div>

            {categories.map((cat, idx) => (
              <div key={cat} className={`group relative ${idx !== categories.length - 1 ? 'pb-1.5 border-b border-slate-200' : ''}`}>
                <div 
                  onClick={() => setSelectedCategory(cat)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
                    selectedCategory === cat ? activeCategoryStyle : inactiveCategoryStyle
                  }`}
                >
                  {editingCategoryId === cat ? (
                    <input 
                      autoFocus
                      className="bg-transparent border-none focus:ring-0 w-full text-brand-brown font-bold"
                      defaultValue={cat}
                      onBlur={(e) => handleRenameCategory(cat, e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleRenameCategory(cat, (e.target as HTMLInputElement).value)}
                    />
                  ) : (
                    <span className="leading-tight flex-1">{formatCategory(cat)}</span>
                  )}
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <span className={`text-[9px] px-2 py-0.5 rounded font-black ${selectedCategory === cat ? 'bg-brand-brown/10 text-brand-brown' : 'bg-slate-100 text-slate-400'}`}>
                      {prompts.filter(p => p.category === cat).length}
                    </span>
                  </div>
                </div>
                
                {/* Actions */}
                <div className={`absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white p-1 rounded-lg border border-gray-100 shadow-sm ${selectedCategory === cat ? 'hidden' : ''}`}>
                  <button 
                    onClick={(e) => { e.stopPropagation(); setEditingCategoryId(cat); }}
                    className="p-1 hover:text-brand-brown text-slate-400"
                  >
                    <Edit2 size={10} />
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleDeleteCategory(cat); }}
                    className="p-1 hover:text-rose-500 text-slate-400"
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              </div>
            ))}

            {/* Inline Creation Box under last category */}
            <div className="pt-2">
              {isAddingCategory ? (
                <div className="bg-white rounded-xl border border-brand-brown/20 p-3 flex flex-col gap-3 animate-fadeIn shadow-lg mx-1">
                  <input 
                    autoFocus
                    type="text"
                    placeholder="Category name..."
                    className="w-full bg-slate-50 border border-slate-100 rounded-lg focus:ring-2 focus:ring-brand-brown/10 focus:border-brand-brown/30 text-[11px] font-bold text-slate-700 px-3 py-2 transition-all outline-none"
                    value={newCategoryInput}
                    onChange={(e) => setNewCategoryInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddCategory();
                      if (e.key === 'Escape') setIsAddingCategory(false);
                    }}
                  />
                  <div className="flex items-center justify-end gap-2 shrink-0">
                    <button 
                      onClick={() => setIsAddingCategory(false)} 
                      className="px-3 py-1.5 text-[10px] font-black text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all flex items-center gap-1.5 border border-transparent hover:border-rose-100"
                    >
                      <X size={12} /> Cancel
                    </button>
                    <button 
                      onClick={handleAddCategory} 
                      className="px-3 py-1.5 text-[10px] font-black text-white bg-brand-brown hover:brightness-110 rounded-lg transition-all flex items-center gap-1.5 shadow-sm"
                    >
                      <Check size={12} /> Save
                    </button>
                  </div>
                </div>
              ) : (
                <button 
                  onClick={() => setIsAddingCategory(true)}
                  className="w-full py-3 border border-dashed border-gray-300 rounded-xl text-[11px] font-bold text-slate-400 hover:border-brand-brown hover:text-brand-brown transition-all hover:bg-white shadow-sm hover:shadow-md flex items-center justify-center gap-2"
                >
                  <Plus size={14} /> Add category
                </button>
              )}
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col overflow-hidden bg-white">
          {/* Add Prompt Form Overlay */}
          {isAddingPrompt && (
            <div className="px-6 py-4 border-b border-brand-brown/10 bg-white animate-slideDown shadow-lg z-20">
              <form onSubmit={handleCreatePrompt} className="max-w-4xl space-y-4">
                <div className="flex items-center justify-between">
                   <h3 className="text-sm font-black text-slate-900 tracking-tight">Create new prompt</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="md:col-span-3 space-y-1.5">
                    <label className="text-[9px] font-black text-slate-400 ml-0.5">Prompt text</label>
                    <textarea 
                      autoFocus
                      required
                      placeholder="e.g. Compare Incredibuild vs. Jenkins for C++ build speed..."
                      className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-brown/10 focus:border-brand-brown outline-none font-bold text-slate-700 transition-all min-h-[60px] resize-none text-sm"
                      value={newPromptText}
                      onChange={(e) => setNewPromptText(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-slate-400 ml-0.5">Category</label>
                    <div className="relative">
                      <select 
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-brown/10 focus:border-brand-brown outline-none font-bold text-slate-700 transition-all appearance-none text-xs"
                        value={newPromptCategory}
                        onChange={(e) => setNewPromptCategory(e.target.value)}
                      >
                        <option value="">Select or type new...</option>
                        {categories.map(c => (
                          <option key={c} value={c}>
                            {formatCategory(c)}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                    <input 
                      type="text" 
                      placeholder="Or enter new..."
                      className="w-full px-3 py-2 mt-1 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-brown/10 focus:border-brand-brown outline-none font-bold text-slate-700 transition-all text-[11px]"
                      value={newPromptCategory}
                      onChange={(e) => setNewPromptCategory(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button 
                    type="submit"
                    className="px-6 py-2 bg-brand-brown text-white rounded-lg text-[10px] font-black shadow-md shadow-brand-brown/10 hover:scale-[1.02] transition-all flex items-center gap-1.5"
                  >
                    <Save size={12} /> Add prompt
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="px-6 py-3 border-b border-gray-100 flex items-center justify-between shrink-0 bg-slate-50/50">
             <div className="flex items-center gap-4 flex-1">
                <div className="relative w-full max-sm:max-w-full max-w-sm">
                   <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                   <input 
                    type="text"
                    placeholder="Search queries..."
                    className="w-full pl-9 pr-4 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-brand-brown/10"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                   />
                </div>
                <button className="p-2 border border-gray-200 rounded-lg text-slate-400 hover:bg-white hover:text-brand-brown transition-all">
                  <Filter size={14} />
                </button>
             </div>

             {selectedPromptIds.size > 0 && (
               <div className="flex items-center gap-3 animate-slideInRight">
                  <span className="text-[10px] font-black text-brand-brown mr-1">{selectedPromptIds.size} selected</span>
                  <div className="h-4 w-px bg-gray-200 mx-1" />
                  
                  <select 
                    className="text-[9px] font-black bg-white border border-gray-200 rounded-md py-1 px-2 focus:ring-0 h-[28px]"
                    onChange={(e) => handleMoveSelected(e.target.value)}
                    value=""
                  >
                    <option value="" disabled>Move to...</option>
                    {categories.map(c => <option key={c} value={c}>{formatCategory(c)}</option>)}
                  </select>

                  {selectedPromptIds.size === 1 && (
                    <>
                      <button 
                        onClick={handleEditSelected}
                        className="px-3 py-1.5 bg-white text-slate-600 rounded-lg hover:bg-slate-50 transition-all border border-gray-200 text-[10px] font-black"
                      >
                        Edit
                      </button>
                      <button 
                        onClick={handleDuplicateSelected}
                        className="px-3 py-1.5 bg-white text-slate-600 rounded-lg hover:bg-slate-50 transition-all border border-gray-200 text-[10px] font-black"
                      >
                        Duplicate
                      </button>
                    </>
                  )}
                  
                  <button 
                    onClick={handleToggleActiveSelected}
                    className="px-3 py-1.5 bg-white text-slate-600 rounded-lg hover:bg-slate-50 transition-all border border-gray-200 text-[10px] font-black"
                  >
                    {statusActionText}
                  </button>

                  <button 
                    onClick={handleDeleteSelected}
                    className="px-3 py-1.5 bg-rose-50 text-rose-600 rounded-lg hover:bg-rose-100 transition-all border border-rose-100 text-[10px] font-black"
                  >
                    Delete
                  </button>
               </div>
             )}
          </div>

          <div className="flex-1 overflow-auto custom-scrollbar">
             <table className="w-full text-left table-fixed border-collapse">
               <thead className="bg-white sticky top-0 z-10">
                 <tr className="border-b border-gray-100">
                   <th className="w-12 px-6 py-4">
                     <input 
                      type="checkbox" 
                      className={checkboxClasses}
                      checked={selectedPromptIds.size === filteredPrompts.length && filteredPrompts.length > 0}
                      onChange={handleToggleAllSelection}
                     />
                   </th>
                   <th className="px-6 py-4 text-[10px] font-black text-slate-400 cursor-pointer hover:text-slate-600">
                     <div className="flex items-center gap-1.5">Prompt text <ArrowUpDown size={10} /></div>
                   </th>
                   <th className="w-32 px-6 py-4 text-[10px] font-black text-slate-400 text-center">Status</th>
                   <th className="w-64 px-6 py-4 text-[10px] font-black text-slate-400 text-center">Category</th>
                   <th className="w-28 px-6 py-4 text-[10px] font-black text-slate-400 text-center">Lang</th>
                   <th className="w-36 px-6 py-4 text-[10px] font-black text-slate-400 text-center">Region</th>
                   <th className="w-36 px-6 py-4 text-[10px] font-black text-slate-400 text-center">Updated</th>
                   <th className="w-12 px-6 py-4"></th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-gray-50">
                 {filteredPrompts.map(prompt => (
                   <tr key={prompt.id} className={`group hover:bg-slate-50 transition-all ${!prompt.isActive ? 'opacity-40 grayscale-[0.5]' : ''}`}>
                     <td className="px-6 py-5">
                       <input 
                        type="checkbox" 
                        className={checkboxClasses}
                        checked={selectedPromptIds.has(prompt.id)}
                        onChange={() => handleTogglePromptSelection(prompt.id)}
                       />
                     </td>
                     <td className="px-6 py-5">
                       {editingPromptId === prompt.id ? (
                         <div className="flex items-center gap-2">
                           <input 
                            autoFocus
                            className="flex-1 px-3 py-1 text-sm font-bold text-slate-800 border-2 border-brand-brown/10 rounded-lg focus:outline-none focus:ring-0 bg-brand-brown/[0.03]"
                            defaultValue={prompt.text}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                const newText = (e.target as HTMLInputElement).value;
                                setPrompts(prev => prev.map(p => p.id === prompt.id ? { ...p, text: newText } : p));
                                setEditingPromptId(null);
                              } else if (e.key === 'Escape') {
                                setEditingPromptId(null);
                              }
                            }}
                           />
                           <button onClick={() => setEditingPromptId(null)} className="p-1 text-slate-400 hover:text-rose-500"><X size={14}/></button>
                         </div>
                       ) : (
                         <div className="flex items-center gap-2 text-sm font-bold text-slate-700 cursor-default min-w-0">
                           <span className="truncate flex-1">{prompt.text}</span>
                           {prompt.isCopy && (
                             <span className="shrink-0 ml-2 text-indigo-500 text-[8px] font-black tracking-wider">
                               Duplicated
                             </span>
                           )}
                         </div>
                       )}
                     </td>
                     <td className="px-6 py-5 text-center">
                       <span className={`text-[9px] font-black ${prompt.isActive ? 'text-emerald-600' : 'text-slate-400'}`}>
                         {prompt.isActive ? 'Active' : 'Inactive'}
                       </span>
                     </td>
                     <td className="px-6 py-5 text-center">
                       <span className="text-[10px] font-black text-slate-500">
                         {formatCategory(prompt.category)}
                       </span>
                     </td>
                     <td className="px-6 py-5 text-center">
                       <span className="text-[10px] font-black text-slate-500">{prompt.language || 'En'}</span>
                     </td>
                     <td className="px-6 py-5 text-center">
                        <div className="flex flex-wrap gap-1.5 justify-center">
                          {(prompt.regions || ['Us']).map(r => (
                            <span key={r} className="text-[9px] font-black text-slate-500">{r}</span>
                          ))}
                        </div>
                     </td>
                     <td className="px-6 py-5 text-center">
                       <span className="text-[10px] font-black text-slate-500 whitespace-nowrap">{prompt.lastUpdated || '2d ago'}</span>
                     </td>
                     <td className="px-6 py-5 opacity-0 group-hover:opacity-100 transition-opacity">
                       <button className="text-slate-300 hover:text-brand-brown"><MoreVertical size={14} /></button>
                     </td>
                   </tr>
                 ))}
               </tbody>
             </table>
             
             {filteredPrompts.length === 0 && (
               <div className="py-24 flex flex-col items-center justify-center text-slate-300 space-y-4">
                  <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center border border-gray-100">
                    <Search size={32} className="opacity-20" />
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] font-black tracking-[0.3em]">No matching queries found</p>
                    <p className="text-[10px] font-bold text-slate-400 mt-1">Try refining your filter or category</p>
                  </div>
               </div>
             )}
          </div>
        </main>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 5px; height: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-slideInRight { animation: slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-slideDown { animation: slideDown 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-fadeIn { animation: fadeIn 0.2s ease-out forwards; }
      `}</style>
    </div>
  );
};
