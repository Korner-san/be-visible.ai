
import React, { useState, useEffect } from 'react';
import { TimeRange } from '../../types';
import { supabase } from '../../lib/supabase';
import { HelpCircle, ArrowRight, ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface PromptScore {
  promptText: string;
  currentScore: number;
  previousScore: number | null;
}

interface PositionRankingProps {
  brandId?: string | null;
  timeRange?: TimeRange;
  customDateRange?: { from: string; to: string };
  selectedModels?: string[];
  onNavigateToPrompts?: () => void;
}

function getDateRanges(timeRange: TimeRange, customDateRange?: { from: string; to: string }): { current: { from: string; to: string }; previous: { from: string; to: string } } {
  if (timeRange === TimeRange.CUSTOM && customDateRange?.from && customDateRange?.to) {
    const fromMs = new Date(customDateRange.from + 'T00:00:00').getTime();
    const toMs = new Date(customDateRange.to + 'T00:00:00').getTime();
    const diffMs = toMs - fromMs;
    const prevTo = new Date(fromMs - 24 * 60 * 60 * 1000);
    const prevFrom = new Date(prevTo.getTime() - diffMs);
    return {
      current: { from: customDateRange.from, to: customDateRange.to },
      previous: {
        from: prevFrom.toISOString().split('T')[0],
        to: prevTo.toISOString().split('T')[0],
      },
    };
  }

  const to = new Date();
  const now = new Date();
  let days = 30;
  switch (timeRange) {
    case TimeRange.SEVEN_DAYS: days = 7; break;
    case TimeRange.NINETY_DAYS: days = 90; break;
    default: days = 30;
  }

  const currentFrom = new Date(now);
  currentFrom.setDate(currentFrom.getDate() - days);
  const previousFrom = new Date(currentFrom);
  previousFrom.setDate(previousFrom.getDate() - days);

  return {
    current: {
      from: currentFrom.toISOString().split('T')[0],
      to: to.toISOString().split('T')[0],
    },
    previous: {
      from: previousFrom.toISOString().split('T')[0],
      to: currentFrom.toISOString().split('T')[0],
    },
  };
}

const MOCK_DATA: PromptScore[] = [
  { promptText: '"What is the best C++ build accelerator for large projects?"', currentScore: 82, previousScore: 75 },
  { promptText: '"What are the fastest CI/CD tools for enterprise teams in 2024?"', currentScore: 68, previousScore: 70 },
  { promptText: '"How to reduce game development compile times significantly?"', currentScore: 91, previousScore: 85 },
  { promptText: '"Compare enterprise build systems for distributed teams"', currentScore: 45, previousScore: 42 },
  { promptText: '"Best distributed compiling solutions for C++ codebases"', currentScore: 30, previousScore: null },
];

const stops = [
  { r: 148, g: 163, b: 184 },
  { r: 251, g: 146, b: 60  },
  { r: 249, g: 115, b: 22  },
];

function getScoreColor(score: number): string {
  const t = Math.max(0, Math.min(1, score / 100));
  const scaledT = t * (stops.length - 1);
  const index = Math.floor(scaledT);
  const fraction = scaledT - index;
  if (index >= stops.length - 1) {
    const s = stops[stops.length - 1];
    return `rgb(${s.r}, ${s.g}, ${s.b})`;
  }
  const start = stops[index];
  const end = stops[index + 1];
  const r = Math.round(start.r + (end.r - start.r) * fraction);
  const g = Math.round(start.g + (end.g - start.g) * fraction);
  const b = Math.round(start.b + (end.b - start.b) * fraction);
  return `rgb(${r}, ${g}, ${b})`;
}

function getScoreToneClass(score: number): string {
  if (score >= 75) return 'score-high';
  if (score >= 50) return 'score-mid';
  return 'score-low';
}

export const PositionRanking: React.FC<PositionRankingProps> = ({ brandId, timeRange = TimeRange.THIRTY_DAYS, customDateRange, selectedModels, onNavigateToPrompts }) => {
  const [promptScores, setPromptScores] = useState<PromptScore[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasRealData, setHasRealData] = useState(false);

  useEffect(() => {
    if (!brandId) return;

    const fetchPromptScores = async () => {
      setIsLoading(true);
      try {
        const { current, previous } = getDateRanges(timeRange, customDateRange);

        const { data: brandPrompts, error: promptsError } = await supabase
          .from('brand_prompts')
          .select('id, raw_prompt, improved_prompt')
          .eq('brand_id', brandId)
          .eq('status', 'active')
          .order('improved_prompt', { ascending: true });

        if (promptsError || !brandPrompts || brandPrompts.length === 0) {
          setHasRealData(false);
          return;
        }

        const [{ data: currentReports }, { data: previousReports }] = await Promise.all([
          supabase.from('daily_reports').select('id').eq('brand_id', brandId).eq('status', 'completed')
            .gte('report_date', current.from).lte('report_date', current.to),
          supabase.from('daily_reports').select('id').eq('brand_id', brandId).eq('status', 'completed')
            .gte('report_date', previous.from).lte('report_date', previous.to),
        ]);

        const currentIds = (currentReports || []).map((r: any) => r.id);
        const previousIds = (previousReports || []).map((r: any) => r.id);

        let avgN = 8;
        let perPromptEntityStats: Record<string, { avg_entity_mention_rate: number }> = {};
        if (currentIds.length > 0) {
          const { data: sovReport } = await supabase
            .from('daily_reports')
            .select('share_of_voice_data, per_prompt_entity_stats')
            .eq('brand_id', brandId)
            .eq('status', 'completed')
            .not('share_of_voice_data', 'is', null)
            .gte('report_date', current.from)
            .lte('report_date', current.to)
            .order('report_date', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (sovReport?.share_of_voice_data) {
            const sov = sovReport.share_of_voice_data as any;
            if (sov.total_mentions > 0 && sov.total_responses > 0) avgN = sov.total_mentions / sov.total_responses;
          }
          if (sovReport?.per_prompt_entity_stats) perPromptEntityStats = sovReport.per_prompt_entity_stats as any;
        }

        const promptAgg: Record<string, { mentions: number; total: number; posScores: number[] }> = {};
        brandPrompts.forEach((p: any) => { promptAgg[p.id] = { mentions: 0, total: 0, posScores: [] }; });

        if (currentIds.length > 0) {
          let q = supabase
            .from('prompt_results')
            .select('brand_prompt_id, brand_mentioned, brand_position')
            .in('daily_report_id', currentIds)
            .not('brand_mentioned', 'is', null)
            .eq('provider_status', 'ok');
          if (selectedModels && selectedModels.length > 0) q = q.in('provider', selectedModels);
          const { data: currentResults } = await q;

          for (const r of (currentResults || [])) {
            if (!promptAgg[r.brand_prompt_id]) continue;
            promptAgg[r.brand_prompt_id].total++;
            if (r.brand_mentioned) {
              promptAgg[r.brand_prompt_id].mentions++;
              if (r.brand_position != null) {
                const K = r.brand_position;
                promptAgg[r.brand_prompt_id].posScores.push(Math.max(0, (avgN - K) / avgN));
              }
            }
          }
        }

        let prevAvgN = avgN;
        let prevPerPromptEntityStats: Record<string, { avg_entity_mention_rate: number }> = perPromptEntityStats;
        if (previousIds.length > 0) {
          const { data: prevSovReport } = await supabase
            .from('daily_reports')
            .select('share_of_voice_data, per_prompt_entity_stats')
            .eq('brand_id', brandId)
            .eq('status', 'completed')
            .not('share_of_voice_data', 'is', null)
            .gte('report_date', previous.from)
            .lte('report_date', previous.to)
            .order('report_date', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (prevSovReport?.share_of_voice_data) {
            const sov = prevSovReport.share_of_voice_data as any;
            if (sov.total_mentions > 0 && sov.total_responses > 0) prevAvgN = sov.total_mentions / sov.total_responses;
          }
          if (prevSovReport?.per_prompt_entity_stats) prevPerPromptEntityStats = prevSovReport.per_prompt_entity_stats as any;
        }

        let prevScoreMap: Record<string, number> = {};
        if (previousIds.length > 0) {
          let pq = supabase
            .from('prompt_results')
            .select('brand_prompt_id, brand_mentioned, brand_position')
            .in('daily_report_id', previousIds)
            .not('brand_mentioned', 'is', null)
            .eq('provider_status', 'ok');
          if (selectedModels && selectedModels.length > 0) pq = pq.in('provider', selectedModels);
          const { data: prevResults } = await pq;

          if (prevResults && prevResults.length > 0) {
            const prevAgg: Record<string, { mentions: number; total: number; posScores: number[] }> = {};
            for (const r of prevResults) {
              const key = r.brand_prompt_id;
              if (!prevAgg[key]) prevAgg[key] = { mentions: 0, total: 0, posScores: [] };
              prevAgg[key].total++;
              if (r.brand_mentioned) {
                prevAgg[key].mentions++;
                if (r.brand_position != null) prevAgg[key].posScores.push(Math.max(0, (prevAvgN - r.brand_position) / prevAvgN));
              }
            }
            for (const [key, agg] of Object.entries(prevAgg)) {
              const mr = agg.total > 0 ? agg.mentions / agg.total : 0;
              const entityStats = (prevPerPromptEntityStats[key] as any);
              const avgEMR = entityStats?.avg_entity_mention_rate;
              const relMS = avgEMR && avgEMR > 0 ? Math.min(1, mr / avgEMR) : mr;
              const pi = agg.posScores.length > 0 ? agg.posScores.reduce((a: number, b: number) => a + b, 0) / agg.posScores.length : 0;
              prevScoreMap[key] = Math.round((0.5 * relMS + 0.5 * pi) * 100);
            }
          }
        }

        const scores: PromptScore[] = brandPrompts.map((p: any) => {
          const text = p.improved_prompt || p.raw_prompt || 'Unknown prompt';
          const short = text.length > 60 ? text.substring(0, 57) + '...' : text;
          const agg = promptAgg[p.id];
          const mentionRate = agg.total > 0 ? agg.mentions / agg.total : 0;
          const entityStats = (perPromptEntityStats[p.id] as any);
          const avgEMR = entityStats?.avg_entity_mention_rate;
          const relMentionScore = avgEMR && avgEMR > 0 ? Math.min(1, mentionRate / avgEMR) : mentionRate;
          const posImpact = agg.posScores.length > 0 ? agg.posScores.reduce((a: number, b: number) => a + b, 0) / agg.posScores.length : 0;
          const currentScore = Math.round((0.5 * relMentionScore + 0.5 * posImpact) * 100);
          return {
            promptText: `"${short}"`,
            currentScore,
            previousScore: prevScoreMap[p.id] !== undefined ? prevScoreMap[p.id] : null,
          };
        });

        const anyHasScore = scores.some(s => s.currentScore > 0);
        if (anyHasScore) scores.sort((a, b) => b.currentScore - a.currentScore);

        setPromptScores(scores.slice(0, 5));
        setHasRealData(true);
      } catch (err) {
        console.error('Prompt score fetch error:', err);
        setHasRealData(false);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPromptScores();
  }, [brandId, timeRange, customDateRange?.from, customDateRange?.to, (selectedModels || []).join(',')]);

  const data = hasRealData ? promptScores : (brandId ? [] : MOCK_DATA);

  return (
    <div className="bg-white rounded-2xl h-full flex flex-col shadow-card hover:shadow-elevated transition-smooth" style={{ border: '1px solid #e8edf4', padding: '20px' }}>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-1.5">
            <h3 className="text-[15px] font-semibold text-slate-800 leading-tight">Prompt performance</h3>
            <span className="relative group cursor-help">
              <HelpCircle size={13} className="text-slate-300 group-hover:text-slate-400 transition-smooth" />
              <div className="absolute left-0 top-full mt-2 hidden group-hover:block w-64 p-3 bg-slate-900 text-white text-[10px] rounded-xl shadow-elevated z-50 pointer-events-none leading-relaxed" style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
                Each row shows how strongly a specific prompt triggers your brand in AI answers — combining how often you're mentioned and how highly you rank vs. other entities.
                <br /><br />
                <span className="text-slate-300">e.g. mentioned in 8/10 responses, ranked 2nd out of 8 → score 70</span>
              </div>
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">Visibility index per prompt</p>
        </div>
        {isLoading ? (
          <span className="badge-loading">Loading</span>
        ) : hasRealData ? (
          <span className="badge-live"><span className="pulse-dot"></span>Live Data</span>
        ) : (
          <span className="badge-sample">Sample</span>
        )}
      </div>

      {/* Column headers */}
      <div className="grid gap-4 px-3 pb-2" style={{ gridTemplateColumns: '1fr auto auto' }}>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Prompt</span>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 text-right w-16">Trend</span>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 text-right w-12">Score</span>
      </div>

      {/* Prompt rows */}
      <div className="flex-1 space-y-0.5 overflow-y-auto">
        {data.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-xs text-slate-400">No prompt data available yet</p>
          </div>
        ) : (
          data.map((item, index) => {
            const pctChange = item.previousScore !== null && item.previousScore > 0
              ? Math.round(((item.currentScore - item.previousScore) / item.previousScore) * 100)
              : null;
            const up = pctChange !== null && pctChange >= 0;

            return (
              <div
                key={index}
                className="grid gap-4 items-center px-3 py-2.5 rounded-xl hover:bg-slate-50 transition-smooth cursor-pointer group"
                style={{ gridTemplateColumns: '1fr auto auto' }}
              >
                {/* Prompt text with row number */}
                <div className="min-w-0 flex items-center gap-2.5">
                  <span className="text-[10px] font-bold text-slate-300 tabular-nums w-4 shrink-0 group-hover:text-slate-400">
                    {index + 1}
                  </span>
                  <p className="text-xs text-slate-700 truncate italic">{item.promptText}</p>
                </div>

                {/* Trend badge */}
                <div className="flex items-center justify-end w-16">
                  {pctChange !== null ? (
                    <span
                      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-semibold ${
                        up ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'
                      }`}
                    >
                      {up ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
                      {Math.abs(pctChange)}%
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-300">—</span>
                  )}
                </div>

                {/* Score badge */}
                <div className="w-12 text-right">
                  <span
                    className={`inline-flex items-center justify-center min-w-9 px-2 py-1 rounded-lg text-xs font-bold tabular-nums ${getScoreToneClass(item.currentScore)}`}
                  >
                    {item.currentScore}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      {onNavigateToPrompts && (
        <button
          onClick={onNavigateToPrompts}
          className="w-full mt-3 pt-3 flex items-center justify-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-brand-brown hover:text-brand-indigo transition-smooth"
          style={{ borderTop: '1px solid #f1f3f8' }}
        >
          All Prompts
          <ArrowRight size={13} />
        </button>
      )}
    </div>
  );
};
