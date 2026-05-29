import React, { useState, useMemo } from 'react';
import { TrendingUp, Info } from 'lucide-react';
import { PromptStats } from '../types';
import { DemandBar } from './DemandBar';

interface PromptDemandPageProps {
  prompts: PromptStats[];
  brandName?: string;
}

const LABELS: Record<number, string> = {
  1: 'Very Low',
  2: 'Low',
  3: 'Medium',
  4: 'High',
  5: 'Very High',
};

const SOURCE_LABELS: Record<string, string> = {
  dataforseo_ai_volume: 'DataForSEO AI',
  dataforseo_google_volume: 'DataForSEO',
  llm_estimate: 'LLM Estimate',
  mixed: 'Mixed',
};

const SCORE_COLORS: Record<number, string> = {
  1: 'text-slate-400',
  2: 'text-amber-500',
  3: 'text-yellow-500',
  4: 'text-emerald-500',
  5: 'text-emerald-700',
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatCategory(cat: string) {
  return (cat || '')
    .split(/[\s_]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

export const PromptDemandPage: React.FC<PromptDemandPageProps> = ({ prompts, brandName }) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'score_desc' | 'score_asc' | 'alpha'>('score_desc');

  const activePrompts = prompts.filter((p) => p.isActive !== false);

  const categories = useMemo(() => {
    const cats = [...new Set(activePrompts.map((p) => p.category).filter(Boolean))].sort();
    return ['ALL', ...cats];
  }, [activePrompts]);

  const scoredCount = activePrompts.filter((p) => p.demandScore != null).length;
  const distribution = useMemo(() => {
    const d: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    activePrompts.forEach((p) => { if (p.demandScore) d[p.demandScore] = (d[p.demandScore] || 0) + 1; });
    return d;
  }, [activePrompts]);

  const filtered = useMemo(() => {
    let list = selectedCategory === 'ALL' ? activePrompts : activePrompts.filter((p) => p.category === selectedCategory);
    if (sortBy === 'score_desc') list = [...list].sort((a, b) => (b.demandScore ?? 0) - (a.demandScore ?? 0));
    else if (sortBy === 'score_asc') list = [...list].sort((a, b) => (a.demandScore ?? 0) - (b.demandScore ?? 0));
    else list = [...list].sort((a, b) => a.text.localeCompare(b.text));
    return list;
  }, [activePrompts, selectedCategory, sortBy]);

  return (
    <div className="h-full overflow-y-auto bg-[#f0f2f7]">
      <div className="max-w-5xl mx-auto px-8 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp size={20} className="text-brand-brown" />
              <h1 className="text-xl font-bold text-slate-900">Prompt Demand</h1>
            </div>
            <p className="text-sm text-slate-500 max-w-2xl">
              Estimates how popular or strategically important each prompt is, using search and AI-demand proxy signals.
              <span className="font-medium text-slate-600"> Not exact ChatGPT search volume.</span>
            </p>
          </div>
          {brandName && (
            <span className="text-[11px] font-bold text-slate-400 bg-white px-3 py-1.5 rounded-lg border border-slate-100">
              {brandName}
            </span>
          )}
        </div>

        {/* Distribution summary */}
        <div className="grid grid-cols-5 gap-3">
          {[5, 4, 3, 2, 1].map((score) => (
            <div key={score} className="bg-white rounded-xl px-4 py-3 border border-slate-100 flex flex-col gap-2">
              <DemandBar score={score} size="md" />
              <div>
                <p className={`text-[11px] font-black ${SCORE_COLORS[score]}`}>{LABELS[score]}</p>
                <p className="text-xl font-bold text-slate-900 tabular-nums">{distribution[score] ?? 0}</p>
                <p className="text-[10px] text-slate-400">prompts</p>
              </div>
            </div>
          ))}
        </div>

        {/* Info note */}
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
          <Info size={14} className="text-amber-500 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700">
            Scores are <strong>relative within your brand</strong> — a score of 5 means this is among the most-demanded prompts for your brand, not a global benchmark.
            {scoredCount < activePrompts.length && (
              <> <strong>{activePrompts.length - scoredCount} prompts</strong> have not been scored yet.</>
            )}
          </p>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1 flex-wrap">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1 rounded-full text-[11px] font-bold transition-all ${
                  selectedCategory === cat
                    ? 'bg-brand-brown text-white'
                    : 'bg-white text-slate-500 hover:bg-slate-50 border border-slate-100'
                }`}
              >
                {cat === 'ALL' ? 'All Categories' : formatCategory(cat)}
              </button>
            ))}
          </div>
          <div className="ml-auto">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="text-[11px] font-bold text-slate-600 bg-white border border-slate-100 rounded-lg px-2 py-1 focus:outline-none"
            >
              <option value="score_desc">Highest demand first</option>
              <option value="score_asc">Lowest demand first</option>
              <option value="alpha">Alphabetical</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider">Prompt</th>
                <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider w-28">Demand</th>
                <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider w-24">Level</th>
                <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider">Reason</th>
                <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider w-28">Source</th>
                <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider w-28">Scored</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map((prompt) => (
                <tr key={prompt.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-4">
                    <p className="text-sm font-medium text-slate-700 leading-snug">{prompt.text}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{formatCategory(prompt.category)}</p>
                  </td>
                  <td className="px-4 py-4">
                    {prompt.demandScore ? (
                      <DemandBar score={prompt.demandScore} label={prompt.demandLabel} reason={prompt.demandReason} size="md" />
                    ) : (
                      <span className="text-[10px] text-slate-300 font-medium">Not scored</span>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    {prompt.demandScore ? (
                      <span className={`text-[11px] font-black ${SCORE_COLORS[prompt.demandScore]}`}>
                        {LABELS[prompt.demandScore]}
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <span className="text-[11px] text-slate-500 leading-snug">
                      {prompt.demandReason || <span className="text-slate-300">—</span>}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <span className="text-[10px] font-medium text-slate-400">
                      {(prompt as any).demandSource
                        ? (SOURCE_LABELS[(prompt as any).demandSource] || (prompt as any).demandSource)
                        : '—'}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <span className="text-[10px] text-slate-400">
                      {formatDate((prompt as any).demandScoredAt)}
                    </span>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-16 text-center text-sm text-slate-300">
                    No prompts found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="text-[10px] text-slate-300 text-center pb-4">
          Demand signals are estimated from search volume and AI-demand proxies. Not exact ChatGPT prompt volume.
          {scoredCount > 0 && ` ${scoredCount} of ${activePrompts.length} prompts scored.`}
        </p>

      </div>
    </div>
  );
};
