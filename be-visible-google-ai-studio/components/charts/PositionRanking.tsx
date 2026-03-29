
import React, { useState, useEffect } from 'react';
import { TimeRange } from '../../types';
import { supabase } from '../../lib/supabase';
import { HelpCircle } from 'lucide-react';

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

// Color gradient based on score 0-100
const stops = [
  { r: 63, g: 15, b: 3 },    // 0 - darkest
  { r: 122, g: 36, b: 16 },
  { r: 150, g: 61, b: 31 },
  { r: 188, g: 99, b: 58 },
  { r: 231, g: 179, b: 115 }, // 100 - lightest/gold
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

        // Step 1: Always load the brand's active prompts — show them even before any results exist
        const { data: brandPrompts, error: promptsError } = await supabase
          .from('brand_prompts')
          .select('id, raw_prompt, improved_prompt')
          .eq('brand_id', brandId)
          .eq('status', 'active')
          .order('improved_prompt', { ascending: true }); // alphabetical default

        if (promptsError || !brandPrompts || brandPrompts.length === 0) {
          setHasRealData(false);
          return;
        }

        // Step 2: Get daily report IDs for current and previous periods
        const [{ data: currentReports }, { data: previousReports }] = await Promise.all([
          supabase.from('daily_reports').select('id').eq('brand_id', brandId).eq('status', 'completed')
            .gte('report_date', current.from).lte('report_date', current.to),
          supabase.from('daily_reports').select('id').eq('brand_id', brandId).eq('status', 'completed')
            .gte('report_date', previous.from).lte('report_date', previous.to),
        ]);

        const currentIds = (currentReports || []).map((r: any) => r.id);
        const previousIds = (previousReports || []).map((r: any) => r.id);

        // Step 3: Get avg entities per response (N) from latest completed report's SOV data
        // Used to compute per-result position score = (N - K) / N, matching Visibility Index formula
        let avgN = 8; // fallback if no SOV data yet
        if (currentIds.length > 0) {
          const { data: sovReport } = await supabase
            .from('daily_reports')
            .select('share_of_voice_data')
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
            if (sov.total_mentions > 0 && sov.total_responses > 0) {
              avgN = sov.total_mentions / sov.total_responses;
            }
          }
        }

        // Step 4: Build score map — default 0 for every prompt
        // Score per result: if mentioned at rank K → (avgN - K) / avgN; if not mentioned → 0
        const scoreMap: Record<string, { scoreSum: number; total: number }> = {};
        brandPrompts.forEach((p: any) => { scoreMap[p.id] = { scoreSum: 0, total: 0 }; });

        if (currentIds.length > 0) {
          let q = supabase
            .from('prompt_results')
            .select('brand_prompt_id, brand_mentioned, brand_position')
            .in('daily_report_id', currentIds)
            .not('brand_mentioned', 'is', null)
            .eq('provider_status', 'ok');
          if (selectedModels && selectedModels.length > 0) {
            q = q.in('provider', selectedModels);
          }
          const { data: currentResults } = await q;

          for (const r of (currentResults || [])) {
            if (!scoreMap[r.brand_prompt_id]) continue;
            scoreMap[r.brand_prompt_id].total++;
            const mentionContrib = r.brand_mentioned ? 0.5 : 0;
            const K = r.brand_position ?? 1;
            const posContrib = r.brand_mentioned ? 0.5 * Math.max(0, (avgN - K) / avgN) : 0;
            scoreMap[r.brand_prompt_id].scoreSum += mentionContrib + posContrib;
          }
        }

        // Step 5: Build previous period score map for trend arrows (same formula)
        let prevAvgN = avgN;
        if (previousIds.length > 0) {
          const { data: prevSovReport } = await supabase
            .from('daily_reports')
            .select('share_of_voice_data')
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
            if (sov.total_mentions > 0 && sov.total_responses > 0) {
              prevAvgN = sov.total_mentions / sov.total_responses;
            }
          }
        }

        let prevScoreMap: Record<string, number> = {};
        if (previousIds.length > 0) {
          let pq = supabase
            .from('prompt_results')
            .select('brand_prompt_id, brand_mentioned, brand_position')
            .in('daily_report_id', previousIds)
            .not('brand_mentioned', 'is', null)
            .eq('provider_status', 'ok');
          if (selectedModels && selectedModels.length > 0) {
            pq = pq.in('provider', selectedModels);
          }
          const { data: prevResults } = await pq;

          if (prevResults && prevResults.length > 0) {
            const prevMap: Record<string, { scoreSum: number; total: number }> = {};
            for (const r of prevResults) {
              const key = r.brand_prompt_id;
              if (!prevMap[key]) prevMap[key] = { scoreSum: 0, total: 0 };
              prevMap[key].total++;
              const mentionContrib = r.brand_mentioned ? 0.5 : 0;
              const K = r.brand_position ?? 1;
              const posContrib = r.brand_mentioned ? 0.5 * Math.max(0, (prevAvgN - K) / prevAvgN) : 0;
              prevMap[key].scoreSum += mentionContrib + posContrib;
            }
            for (const [key, val] of Object.entries(prevMap)) {
              prevScoreMap[key] = val.total > 0 ? Math.round((val.scoreSum / val.total) * 100) : 0;
            }
          }
        }

        // Step 6: Build scores array for all prompts
        const scores: PromptScore[] = brandPrompts.map((p: any) => {
          const text = p.improved_prompt || p.raw_prompt || 'Unknown prompt';
          const short = text.length > 60 ? text.substring(0, 57) + '...' : text;
          const agg = scoreMap[p.id];
          const currentScore = agg.total > 0 ? Math.round((agg.scoreSum / agg.total) * 100) : 0;
          return {
            promptText: `"${short}"`,
            currentScore,
            previousScore: prevScoreMap[p.id] !== undefined ? prevScoreMap[p.id] : null,
          };
        });

        // Step 7: Sort — high to low if any scores > 0, otherwise keep alphabetical order
        const anyHasScore = scores.some(s => s.currentScore > 0);
        if (anyHasScore) {
          scores.sort((a, b) => b.currentScore - a.currentScore);
        }
        // (already alphabetical from the DB query if all 0)

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

  // When a real brand is set but no data yet, show empty list — never show Incredibuild mock prompts
  const data = hasRealData ? promptScores : (brandId ? [] : MOCK_DATA);

  return (
    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-[15px] font-bold text-gray-400 tracking-wide flex items-center gap-2">
            Prompt performance
            <span className="relative group cursor-help">
              <HelpCircle size={14} className="text-gray-300 group-hover:text-gray-400 transition-colors" />
              <div className="absolute left-0 top-full mt-2 hidden group-hover:block w-64 p-3 bg-slate-900 text-white text-[10px] font-medium rounded-lg shadow-2xl z-50 pointer-events-none leading-relaxed border border-white/10">
                Each bar shows how strongly a specific prompt triggers your brand in AI answers — combining how often you're mentioned and how highly you rank vs. other entities.<br /><br />
                <span className="text-slate-300">e.g. mentioned in 8/10 responses, ranked 2nd out of 8 entities → score 70</span>
              </div>
            </span>
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5 font-medium">Visibility index per prompt</p>
        </div>
        {isLoading ? (
          <span className="text-[9px] font-bold text-amber-500 bg-amber-50 px-2 py-0.5 rounded-full animate-pulse">LOADING</span>
        ) : hasRealData ? (
          <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">LIVE DATA</span>
        ) : (
          <span className="text-[9px] font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full">SAMPLE</span>
        )}
      </div>

      <div className="flex-1 flex flex-col justify-center space-y-4">
        {data.map((item, index) => {
          const itemColor = getScoreColor(item.currentScore);
          const pctChange = item.previousScore !== null && item.previousScore > 0
            ? Math.round(((item.currentScore - item.previousScore) / item.previousScore) * 100)
            : null;

          return (
            <div key={index} className="space-y-1">
              <div className="flex justify-between items-baseline px-1 gap-2">
                <span className="text-[11px] font-medium text-slate-700 italic leading-tight truncate flex-1 min-w-0">{item.promptText}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  {pctChange !== null && (
                    <span className={`text-[9px] font-bold ${pctChange > 0 ? 'text-emerald-500' : pctChange < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                      {pctChange > 0 ? '+' : ''}{pctChange}%
                    </span>
                  )}
                  <span className="text-xs font-black transition-colors duration-500" style={{ color: itemColor }}>
                    {item.currentScore}
                  </span>
                </div>
              </div>

              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden relative">
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out shadow-xs"
                  style={{
                    width: `${item.currentScore}%`,
                    backgroundColor: itemColor
                  }}
                ></div>
              </div>
            </div>
          );
        })}
      </div>

      {onNavigateToPrompts && (
        <div className="mt-4 pt-3 border-t border-gray-100 flex justify-center">
          <button
            onClick={onNavigateToPrompts}
            className="text-[10px] font-bold text-slate-500 uppercase tracking-widest hover:text-slate-800 transition-colors"
          >
            All prompts
          </button>
        </div>
      )}
    </div>
  );
};
