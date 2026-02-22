
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
  Check,
  Loader2,
  ArrowRight,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface EditablePrompt {
  id: string;         // brand_prompts.id (may be empty string for new unsaved prompts)
  text: string;
  category: string;
  isNew?: boolean;    // newly added during this edit session
  isDeleted?: boolean;
}

interface OnboardingEditPromptsPageProps {
  initialPrompts: { id: string; text: string; category: string }[];
  brandId: string;
  language: string;
  onBack: () => void;
  onFinish: (promptIds: string[]) => void;
}

const formatCategory = (cat: string) => {
  if (!cat) return '';
  return cat
    .split(/[\s_]+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

// ─── Component ────────────────────────────────────────────────────────────────

export const OnboardingEditPromptsPage: React.FC<OnboardingEditPromptsPageProps> = ({
  initialPrompts,
  brandId,
  language,
  onBack,
  onFinish,
}) => {
  const [prompts, setPrompts] = useState<EditablePrompt[]>(
    initialPrompts.map(p => ({ ...p, text: p.text, isNew: false, isDeleted: false }))
  );
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [selectedPromptIds, setSelectedPromptIds] = useState<Set<string>>(new Set());
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryInput, setNewCategoryInput] = useState('');
  const [manualCategories, setManualCategories] = useState<string[]>([]);
  const [isAddingPrompt, setIsAddingPrompt] = useState(false);
  const [newPromptText, setNewPromptText] = useState('');
  const [newPromptCategory, setNewPromptCategory] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const activePrompts = prompts.filter(p => !p.isDeleted);

  const categories = useMemo(() => {
    const fromPrompts = activePrompts.map(p => p.category);
    return Array.from(new Set([...fromPrompts, ...manualCategories])).filter(Boolean);
  }, [activePrompts, manualCategories]);

  const filteredPrompts = useMemo(() => {
    let result = [...activePrompts];
    if (selectedCategory !== 'ALL') result = result.filter(p => p.category === selectedCategory);
    if (searchQuery) result = result.filter(p =>
      p.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.category.toLowerCase().includes(searchQuery.toLowerCase())
    );
    return result;
  }, [activePrompts, selectedCategory, searchQuery]);

  // ── Prompt actions ───────────────────────────────────────────────────────────

  const addPrompt = () => {
    if (!newPromptText.trim()) return;
    const tempId = `new_${Date.now()}`;
    setPrompts(prev => [
      ...prev,
      {
        id: tempId,
        text: newPromptText.trim(),
        category: newPromptCategory || categories[0] || 'General',
        isNew: true,
        isDeleted: false,
      },
    ]);
    setNewPromptText('');
    setNewPromptCategory('');
    setIsAddingPrompt(false);
  };

  const updatePromptText = (id: string, text: string) => {
    setPrompts(prev => prev.map(p => p.id === id ? { ...p, text } : p));
  };

  const updatePromptCategory = (id: string, category: string) => {
    setPrompts(prev => prev.map(p => p.id === id ? { ...p, category } : p));
  };

  const deletePrompt = (id: string) => {
    setPrompts(prev => prev.map(p => p.id === id ? { ...p, isDeleted: true } : p));
    setSelectedPromptIds(prev => { const s = new Set(prev); s.delete(id); return s; });
  };

  const deleteSelected = () => {
    setPrompts(prev => prev.map(p => selectedPromptIds.has(p.id) ? { ...p, isDeleted: true } : p));
    setSelectedPromptIds(new Set());
  };

  // ── Category actions ─────────────────────────────────────────────────────────

  const addCategory = () => {
    if (!newCategoryInput.trim()) return;
    setManualCategories(prev => [...prev, newCategoryInput.trim()]);
    setNewCategoryInput('');
    setIsAddingCategory(false);
  };

  const renameCategory = (oldName: string, newName: string) => {
    setPrompts(prev => prev.map(p => p.category === oldName ? { ...p, category: newName } : p));
    setManualCategories(prev => prev.map(c => c === oldName ? newName : c));
    if (selectedCategory === oldName) setSelectedCategory(newName);
  };

  const deleteCategory = (name: string) => {
    setPrompts(prev => prev.map(p => p.category === name ? { ...p, isDeleted: true } : p));
    setManualCategories(prev => prev.filter(c => c !== name));
    if (selectedCategory === name) setSelectedCategory('ALL');
  };

  // ── Finish ───────────────────────────────────────────────────────────────────

  const handleFinish = async () => {
    setIsFinishing(true);
    try {
      const kept = activePrompts;

      // Delete prompts marked as deleted from DB (only existing ones, not new)
      const deletedExisting = prompts.filter(p => p.isDeleted && !p.isNew && !p.id.startsWith('new_'));
      if (deletedExisting.length > 0) {
        await supabase.from('brand_prompts').delete()
          .in('id', deletedExisting.map(p => p.id));
      }

      // Insert truly new prompts
      const newOnes = kept.filter(p => p.isNew || p.id.startsWith('new_'));
      let insertedIds: string[] = [];
      if (newOnes.length > 0) {
        const { data: inserted } = await supabase.from('brand_prompts').insert(
          newOnes.map(p => ({
            brand_id: brandId,
            raw_prompt: p.text,
            improved_prompt: p.text,
            category: p.category,
            status: 'improved',
            source_template_code: `custom_${Date.now()}`,
          }))
        ).select('id');
        insertedIds = inserted?.map((r: any) => r.id) || [];
      }

      // Update existing prompts that were edited (text or category changed)
      const existingKept = kept.filter(p => !p.isNew && !p.id.startsWith('new_'));
      await Promise.all(existingKept.map(p =>
        supabase.from('brand_prompts').update({
          improved_prompt: p.text,
          category: p.category,
        }).eq('id', p.id)
      ));

      // All kept IDs
      const allIds = [
        ...existingKept.map(p => p.id),
        ...insertedIds,
      ];

      onFinish(allIds);
    } catch (err) {
      console.error('[OnboardingEditPromptsPage] Finish error:', err);
      setIsFinishing(false);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 transition-colors">
            <ArrowLeft size={16} /> Back to Preview
          </button>
          <span className="text-slate-300">|</span>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Edit Your Prompts</h1>
            <p className="text-xs text-slate-500">{activePrompts.length} prompts • {language}</p>
          </div>
        </div>
        <button
          onClick={handleFinish}
          disabled={isFinishing || activePrompts.length === 0}
          className="flex items-center gap-2 px-6 py-2.5 bg-brand-brown text-white rounded-xl text-sm font-semibold hover:brightness-110 transition-all disabled:opacity-50">
          {isFinishing ? <Loader2 size={16} className="animate-spin" /> : null}
          Finish Onboarding <ArrowRight size={16} />
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div
          ref={scrollContainerRef}
          className="w-64 bg-white border-r border-gray-200 flex flex-col shrink-0 overflow-y-auto"
        >
          <div className="p-4 border-b border-gray-100">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Categories</p>
            <button
              onClick={() => setSelectedCategory('ALL')}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium flex justify-between items-center transition-colors ${
                selectedCategory === 'ALL' ? 'bg-brand-brown/10 text-brand-brown' : 'text-slate-600 hover:bg-gray-50'
              }`}>
              All prompts <span className="text-xs text-slate-400">{activePrompts.length}</span>
            </button>
          </div>

          <div className="p-4 space-y-1 flex-1">
            {categories.map(cat => {
              const count = activePrompts.filter(p => p.category === cat).length;
              return (
                <div key={cat} className="group relative">
                  {editingCategoryId === cat ? (
                    <input
                      autoFocus
                      defaultValue={cat}
                      onBlur={(e) => { renameCategory(cat, e.target.value); setEditingCategoryId(null); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { renameCategory(cat, e.currentTarget.value); setEditingCategoryId(null); } }}
                      className="w-full px-3 py-1.5 text-sm border border-brand-brown rounded-lg outline-none"
                    />
                  ) : (
                    <button
                      onClick={() => setSelectedCategory(cat)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm flex justify-between items-center transition-colors ${
                        selectedCategory === cat ? 'bg-brand-brown/10 text-brand-brown font-semibold' : 'text-slate-600 hover:bg-gray-50'
                      }`}>
                      <span className="truncate">{formatCategory(cat)}</span>
                      <span className="text-xs text-slate-400 shrink-0 ml-1">{count}</span>
                    </button>
                  )}
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-0.5 bg-white border border-gray-200 rounded-lg px-1 py-0.5 shadow-sm z-10">
                    <button onClick={() => setEditingCategoryId(cat)} className="p-1 text-slate-400 hover:text-brand-brown">
                      <Edit2 size={12} />
                    </button>
                    <button onClick={() => deleteCategory(cat)} className="p-1 text-slate-400 hover:text-red-500">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              );
            })}

            {isAddingCategory ? (
              <div className="flex gap-1 mt-2">
                <input
                  autoFocus
                  value={newCategoryInput}
                  onChange={e => setNewCategoryInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addCategory(); if (e.key === 'Escape') setIsAddingCategory(false); }}
                  placeholder="Category name"
                  className="flex-1 px-2 py-1.5 text-xs border border-slate-200 rounded-lg outline-none"
                />
                <button onClick={addCategory} className="p-1.5 bg-brand-brown text-white rounded-lg">
                  <Check size={12} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsAddingCategory(true)}
                className="w-full text-left px-3 py-2 text-xs text-slate-400 hover:text-brand-brown flex items-center gap-1.5 transition-colors mt-1">
                <Plus size={12} /> Add category
              </button>
            )}
          </div>
        </div>

        {/* Main area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3">
            <div className="flex-1 relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search prompts..."
                className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-brand-brown/40"
              />
            </div>
            {selectedPromptIds.size > 0 && (
              <button onClick={deleteSelected}
                className="flex items-center gap-2 px-4 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
                <Trash2 size={14} /> Delete {selectedPromptIds.size} selected
              </button>
            )}
            <button
              onClick={() => setIsAddingPrompt(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-brown text-white rounded-lg hover:brightness-110 transition-all">
              <Plus size={14} /> Add prompt
            </button>
          </div>

          {/* Add prompt form */}
          {isAddingPrompt && (
            <div className="bg-amber-50 border-b border-amber-100 px-6 py-4 space-y-3">
              <textarea
                autoFocus
                value={newPromptText}
                onChange={e => setNewPromptText(e.target.value)}
                placeholder={`Enter a search question in ${language}...`}
                rows={2}
                className="w-full px-4 py-2.5 text-sm border border-amber-200 rounded-lg outline-none focus:border-brand-brown/40 resize-none bg-white"
              />
              <div className="flex items-center gap-3">
                <select
                  value={newPromptCategory}
                  onChange={e => setNewPromptCategory(e.target.value)}
                  className="flex-1 px-3 py-2 text-sm border border-amber-200 rounded-lg bg-white outline-none">
                  <option value="">Select category...</option>
                  {categories.map(c => <option key={c} value={c}>{formatCategory(c)}</option>)}
                </select>
                <button onClick={addPrompt}
                  className="px-4 py-2 text-sm bg-brand-brown text-white rounded-lg hover:brightness-110">
                  Add prompt
                </button>
                <button onClick={() => { setIsAddingPrompt(false); setNewPromptText(''); }}
                  className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-slate-600 hover:bg-gray-50">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Prompt table */}
          <div className="flex-1 overflow-y-auto p-6">
            {filteredPrompts.length === 0 ? (
              <div className="flex items-center justify-center h-48 text-slate-400 text-sm">
                No prompts found. Add some prompts above.
              </div>
            ) : (
              <div className="space-y-2">
                {filteredPrompts.map(p => (
                  <div key={p.id}
                    className={`bg-white rounded-xl border px-4 py-3 flex items-start gap-3 transition-all ${
                      selectedPromptIds.has(p.id) ? 'border-brand-brown/40 bg-brand-brown/5' : 'border-gray-200 hover:border-gray-300'
                    }`}>
                    <input
                      type="checkbox"
                      checked={selectedPromptIds.has(p.id)}
                      onChange={e => {
                        setSelectedPromptIds(prev => {
                          const s = new Set(prev);
                          e.target.checked ? s.add(p.id) : s.delete(p.id);
                          return s;
                        });
                      }}
                      className="mt-1 accent-brand-brown shrink-0"
                    />

                    <div className="flex-1 min-w-0">
                      {editingPromptId === p.id ? (
                        <textarea
                          autoFocus
                          value={p.text}
                          onChange={e => updatePromptText(p.id, e.target.value)}
                          onBlur={() => setEditingPromptId(null)}
                          rows={2}
                          className="w-full text-sm text-slate-800 border border-brand-brown/30 rounded-lg px-3 py-2 outline-none resize-none"
                        />
                      ) : (
                        <p className="text-sm text-slate-800 leading-relaxed">{p.text}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                          {formatCategory(p.category)}
                        </span>
                        {p.isNew && (
                          <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">New</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => setEditingPromptId(p.id)}
                        className="p-1.5 text-slate-400 hover:text-brand-brown hover:bg-brand-brown/5 rounded-lg transition-colors">
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => deletePrompt(p.id)}
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Bottom summary */}
          <div className="bg-white border-t border-gray-200 px-6 py-3 flex items-center justify-between">
            <p className="text-xs text-slate-500">
              {activePrompts.length} prompts in {categories.length} categories
            </p>
            <button
              onClick={handleFinish}
              disabled={isFinishing || activePrompts.length === 0}
              className="flex items-center gap-2 px-6 py-2.5 bg-brand-brown text-white rounded-xl text-sm font-semibold hover:brightness-110 transition-all disabled:opacity-50">
              {isFinishing ? <Loader2 size={16} className="animate-spin" /> : null}
              Finish Onboarding <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
