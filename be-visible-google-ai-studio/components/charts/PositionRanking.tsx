
import React, { useState, useEffect } from 'react';
import { TimeRange } from '../../types';
import { supabase } from '../../lib/supabase';

interface PromptScore {
  promptText: string;
  currentScore: number;
  previousScore: number | null;
}

interface PositionRankingProps {
  brandId?: string | null;
  timeRange?: TimeRange;
  onNavigateToPrompts?: () => void;
}

function getDateRanges(timeRange: TimeRange): { current: { from: string; to: string }; previous: { from: string; to: string } } {
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
  { promptText: '"Best C++ build accelerator"', currentScore: 82, previousScore: 75 },
  { promptText: '"Fastest CI/CD tools 2024"', currentScore: 68, previousScore: 70 },
  { promptText: '"Game development compile times"', currentScore: 91, previousScore: 85 },
  { promptText: '"Enterprise build system comparison"', currentScore: 45, previousScore: 42 },
  { promptText: '"Distributed compiling solutions"', currentScore: 30, previousScore: null },
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

export const PositionRanking: React.FC<PositionRankingProps> = ({ brandId, timeRange = TimeRange.THIRTY_DAYS, onNavigateToPrompts }) => {
  const [promptScores, setPromptScores] = useState<PromptScore[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasRealData, setHasRealData] = useState(false);

  useEffect(() => {
    if (!brandId) return;

    const fetchPromptScores = async () => {
      setIsLoading(true);
      try {
        const { current, previous } = getDateRanges(timeRange);

        // Get daily report IDs for current period
        const { data: currentReports } = await supabase
          .from('daily_reports')
          .select('id')
          .eq('brand_id', brandId)
          .eq('status', 'completed')
          .gte('report_date', current.from)
          .lte('report_date', current.to);

        // Get daily report IDs for previous period
        const { data: previousReports } = await supabase
          .from('daily_reports')
          .select('id')
          .eq('brand_id', brandId)
          .eq('status', 'completed')
          .gte('report_date', previous.from)
          .lte('report_date', previous.to);

        const currentIds = (currentReports || []).map((r: any) => r.id);
        const previousIds = (previousReports || []).map((r: any) => r.id);

        if (currentIds.length === 0) {
          setHasRealData(false);
          return;
        }

        // Get all prompt results for current period with prompt text
        const { data: currentResults, error } = await supabase
          .from('prompt_results')
          .select('brand_prompt_id, brand_mentioned, brand_prompts!inner(raw_prompt, improved_prompt)')
          .in('daily_report_id', currentIds);

        if (error || !currentResults || currentResults.length === 0) {
          setHasRealData(false);
          return;
        }

        // Group by prompt and calculate score (% mentioned)
        const promptMap: Record<string, { text: string; mentioned: number; total: number }> = {};
        for (const r of currentResults) {
          const bp = r.brand_prompts as any;
          const key = r.brand_prompt_id;
          if (!promptMap[key]) {
            const text = bp?.improved_prompt || bp?.raw_prompt || 'Unknown prompt';
            // Truncate and wrap in quotes
            const short = text.length > 40 ? text.substring(0, 37) + '...' : text;
            promptMap[key] = { text: `"${short}"`, mentioned: 0, total: 0 };
          }
          promptMap[key].total++;
          if (r.brand_mentioned) promptMap[key].mentioned++;
        }

        // Calculate previous period scores if we have data
        let prevScoreMap: Record<string, number> = {};
        if (previousIds.length > 0) {
          const { data: prevResults } = await supabase
            .from('prompt_results')
            .select('brand_prompt_id, brand_mentioned')
            .in('daily_report_id', previousIds);

          if (prevResults && prevResults.length > 0) {
            const prevMap: Record<string, { mentioned: number; total: number }> = {};
            for (const r of prevResults) {
              const key = r.brand_prompt_id;
              if (!prevMap[key]) prevMap[key] = { mentioned: 0, total: 0 };
              prevMap[key].total++;
              if (r.brand_mentioned) prevMap[key].mentioned++;
            }
            for (const [key, val] of Object.entries(prevMap)) {
              prevScoreMap[key] = val.total > 0 ? Math.round((val.mentioned / val.total) * 100) : 0;
            }
          }
        }

        // Build sorted list, take top 5
        const scores: PromptScore[] = Object.entries(promptMap)
          .map(([key, val]) => ({
            promptText: val.text,
            currentScore: val.total > 0 ? Math.round((val.mentioned / val.total) * 100) : 0,
            previousScore: prevScoreMap[key] !== undefined ? prevScoreMap[key] : null,
          }))
          .sort((a, b) => b.currentScore - a.currentScore)
          .slice(0, 5);

        if (scores.length > 0) {
          setPromptScores(scores);
          setHasRealData(true);
        } else {
          setHasRealData(false);
        }
      } catch (err) {
        console.error('Prompt score fetch error:', err);
        setHasRealData(false);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPromptScores();
  }, [brandId, timeRange]);

  const data = hasRealData ? promptScores : MOCK_DATA;

  return (
    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[15px] font-bold text-gray-400 tracking-wide">Prompt performance</h3>
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
          const diff = item.previousScore !== null ? item.currentScore - item.previousScore : null;

          return (
            <div key={index} className="space-y-1">
              <div className="flex justify-between items-end px-1">
                <span className="text-[11px] font-medium text-slate-700 italic truncate max-w-[65%]">{item.promptText}</span>
                <div className="flex items-center gap-1.5">
                  {diff !== null && (
                    <span className={`text-[9px] font-bold ${diff > 0 ? 'text-emerald-500' : diff < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                      {diff > 0 ? '+' : ''}{diff}
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
