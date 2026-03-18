import React, { useState, useEffect } from 'react';
import { TimeRange, TrendDataPoint } from '../types';
import { VisibilityTrend } from './charts/VisibilityTrend';
import { MentionRate } from './charts/MentionRate';
import { ShareOfVoice } from './charts/ShareOfVoice';
import { PositionRanking } from './charts/PositionRanking';
import { supabase } from '../lib/supabase';

interface DashboardProps {
  timeRange: TimeRange;
  brandId?: string | null;
  userTimezone?: string;
  onNavigateToPrompts?: () => void;
  brandName?: string;
  customDateRange?: { from: string; to: string };
  selectedModels?: string[];
}

function getDateRange(timeRange: TimeRange, customDateRange?: { from: string; to: string }): { from: string; to: string } {
  if (timeRange === TimeRange.CUSTOM && customDateRange?.from && customDateRange?.to) {
    return { from: customDateRange.from, to: customDateRange.to };
  }
  const to = new Date();
  const from = new Date();
  switch (timeRange) {
    case TimeRange.SEVEN_DAYS:
      from.setDate(from.getDate() - 7);
      break;
    case TimeRange.NINETY_DAYS:
      from.setDate(from.getDate() - 90);
      break;
    default:
      from.setDate(from.getDate() - 30);
  }
  return {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
  };
}

function getPreviousPeriod(from: string, to: string): { from: string; to: string } {
  const fromMs = new Date(from + 'T00:00:00').getTime();
  const toMs = new Date(to + 'T00:00:00').getTime();
  const diffMs = toMs - fromMs;
  const prevTo = new Date(fromMs - 24 * 60 * 60 * 1000);
  const prevFrom = new Date(prevTo.getTime() - diffMs);
  return {
    from: prevFrom.toISOString().split('T')[0],
    to: prevTo.toISOString().split('T')[0],
  };
}

const ALL_MODELS = ['chatgpt', 'google_ai_overview', 'claude'];

async function fetchMentionRateValue(bId: string, from: string, to: string, models = ALL_MODELS): Promise<number | null> {
  const { data: reports } = await supabase
    .from('daily_reports')
    .select('id')
    .eq('brand_id', bId)
    .eq('status', 'completed')
    .gte('report_date', from)
    .lte('report_date', to);
  if (!reports || reports.length === 0) return null;
  const reportIds = reports.map((r: any) => r.id);
  const { count: total } = await supabase
    .from('prompt_results')
    .select('*', { count: 'exact', head: true })
    .in('daily_report_id', reportIds)
    .in('provider', models);
  const { count: mentioned } = await supabase
    .from('prompt_results')
    .select('*', { count: 'exact', head: true })
    .in('daily_report_id', reportIds)
    .in('provider', models)
    .eq('brand_mentioned', true);
  if (!total || total === 0) return null;
  return parseFloat(((mentioned || 0) / total * 100).toFixed(1));
}

/**
 * Compute Share of Voice from prompt_results for a given model filter.
 * Returns same shape as the pre-aggregated share_of_voice_data column.
 */
async function fetchSOVByProvider(bId: string, from: string, to: string, models: string[], bName?: string): Promise<{ entities: { name: string; mentions: number; type: string }[]; total_mentions: number; calculated_at: string } | null> {
  const { data: reports } = await supabase
    .from('daily_reports')
    .select('id')
    .eq('brand_id', bId)
    .eq('status', 'completed')
    .gte('report_date', from)
    .lte('report_date', to);
  if (!reports || reports.length === 0) return null;

  const reportIds = reports.map((r: any) => r.id);

  const { data: results } = await supabase
    .from('prompt_results')
    .select('brand_mentioned, competitor_mentions')
    .in('daily_report_id', reportIds)
    .in('provider', models);
  if (!results || results.length === 0) return null;

  const totalResponses = results.length;
  let brandMentions = 0;
  const competitorMap: Record<string, number> = {};

  for (const r of results as any[]) {
    if (r.brand_mentioned) brandMentions++;
    if (Array.isArray(r.competitor_mentions)) {
      for (const comp of r.competitor_mentions) {
        if (comp?.name) {
          competitorMap[comp.name] = (competitorMap[comp.name] || 0) + 1;
        }
      }
    }
  }

  // If competitors are tracked, use entity-mention sums as the denominator (classic SoV).
  // If not (e.g. Google AI Overview), fall back to total response count so brand % = mention rate.
  const competitorMentionTotal = Object.values(competitorMap).reduce((s, v) => s + v, 0);
  const totalMentions = competitorMentionTotal > 0
    ? brandMentions + competitorMentionTotal
    : totalResponses;

  if (totalMentions === 0) return null;

  const entities: { name: string; mentions: number; type: string }[] = [
    { name: bName || 'Brand', mentions: brandMentions, type: 'brand' },
    ...Object.entries(competitorMap)
      .sort((a, b) => b[1] - a[1])
      .map(([name, mentions]) => ({ name, mentions, type: 'competitor' })),
  ];

  return { entities, total_mentions: totalMentions, calculated_at: new Date().toISOString() };
}

/**
 * For single-model view: compute visibility score from prompt_results.brand_mentioned
 * grouped by report_date instead of using the pre-aggregated daily_reports.visibility_score.
 */
async function fetchVisibilityByProvider(bId: string, from: string, to: string, models: string[]): Promise<{ date: string; score: number }[]> {
  const { data: reports } = await supabase
    .from('daily_reports')
    .select('id, report_date')
    .eq('brand_id', bId)
    .eq('status', 'completed')
    .gte('report_date', from)
    .lte('report_date', to)
    .order('report_date', { ascending: true });
  if (!reports || reports.length === 0) return [];

  const reportIds = reports.map((r: any) => r.id);
  const reportDateMap = new Map(reports.map((r: any) => [r.id, r.report_date as string]));

  const { data: results } = await supabase
    .from('prompt_results')
    .select('daily_report_id, brand_mentioned')
    .in('daily_report_id', reportIds)
    .in('provider', models);
  if (!results || results.length === 0) return [];

  const byDate = new Map<string, { total: number; mentioned: number }>();
  for (const r of results as any[]) {
    const date = reportDateMap.get(r.daily_report_id);
    if (!date) continue;
    const cur = byDate.get(date) || { total: 0, mentioned: 0 };
    cur.total++;
    if (r.brand_mentioned) cur.mentioned++;
    byDate.set(date, cur);
  }

  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { total, mentioned }]) => ({
      date,
      score: total > 0 ? parseFloat(((mentioned / total) * 100).toFixed(1)) : 0,
    }));
}

async function fetchBrandSOVPct(bId: string, from: string, to: string): Promise<number | null> {
  const { data: reports } = await supabase
    .from('daily_reports')
    .select('share_of_voice_data')
    .eq('brand_id', bId)
    .eq('status', 'completed')
    .not('share_of_voice_data', 'is', null)
    .gte('report_date', from)
    .lte('report_date', to);
  if (!reports || reports.length === 0) return null;
  const entityMap: Record<string, { mentions: number; type: string }> = {};
  let totalMentions = 0;
  for (const report of reports) {
    const sov = report.share_of_voice_data as any;
    if (!sov?.entities) continue;
    for (const entity of sov.entities) {
      const key = entity.name.toLowerCase();
      if (entityMap[key]) {
        entityMap[key].mentions += entity.mentions;
      } else {
        entityMap[key] = { mentions: entity.mentions, type: entity.type };
      }
    }
    totalMentions += sov.total_mentions || 0;
  }
  if (totalMentions === 0) return null;
  const brand = Object.values(entityMap).find((e: any) => e.type === 'brand');
  return brand ? Math.round((brand.mentions / totalMentions) * 100) : 0;
}

export const Dashboard: React.FC<DashboardProps> = ({ timeRange, brandId, userTimezone = 'UTC', onNavigateToPrompts, brandName, customDateRange, selectedModels = ALL_MODELS }) => {
  const [visibilityData, setVisibilityData] = useState<TrendDataPoint[]>([]);
  const [currentScore, setCurrentScore] = useState<number | undefined>();
  const [trendPercent, setTrendPercent] = useState<number | undefined>();
  const [isLoadingVis, setIsLoadingVis] = useState(false);
  const [mentionRate, setMentionRate] = useState<number | undefined>();
  const [mentionTrend, setMentionTrend] = useState<number | null>(null);
  const [isLoadingMention, setIsLoadingMention] = useState(false);
  const [sovData, setSovData] = useState<any>(undefined);
  const [sovTrend, setSovTrend] = useState<number | null>(null);
  const [isLoadingSov, setIsLoadingSov] = useState(false);

  useEffect(() => {
    if (!brandId) return;

    const { from, to } = getDateRange(timeRange, customDateRange);
    const { from: prevFrom, to: prevTo } = getPreviousPeriod(from, to);
    const days = Math.ceil((new Date(to).getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24));
    const timePeriodLabel = `vs prev ${days}d`;

    // Fetch visibility scores — when a single model is selected, compute from prompt_results
    // so users see that model's mention rate as their visibility trend.
    // When all models selected, use pre-aggregated daily_reports.visibility_score.
    const fetchVisibility = async () => {
      setIsLoadingVis(true);
      try {
        const isFiltered = selectedModels.length < ALL_MODELS.length;
        let points: TrendDataPoint[] = [];

        if (isFiltered) {
          // Compute per-model visibility from prompt_results.brand_mentioned
          const raw = await fetchVisibilityByProvider(brandId, from, to, selectedModels);
          points = raw.map(({ date, score }) => ({
            date: new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: userTimezone }),
            score,
          }));
        } else {
          const { data, error } = await supabase
            .from('daily_reports')
            .select('report_date, visibility_score')
            .eq('brand_id', brandId)
            .eq('status', 'completed')
            .not('visibility_score', 'is', null)
            .gte('report_date', from)
            .lte('report_date', to)
            .order('report_date', { ascending: true });

          if (error) { console.error('Error fetching visibility scores:', error); return; }

          if (data && data.length > 0) {
            const bestByDate = new Map<string, number>();
            data.forEach((row: any) => {
              const score = parseFloat(row.visibility_score) || 0;
              if (score > (bestByDate.get(row.report_date) ?? -1)) bestByDate.set(row.report_date, score);
            });
            points = Array.from(bestByDate.entries())
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([reportDate, score]) => ({
                date: new Date(reportDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: userTimezone }),
                score,
              }));
          }
        }

        if (points.length > 0) {
          setVisibilityData(points);
          const avgScore = points.reduce((sum, p) => sum + p.score, 0) / points.length;
          setCurrentScore(Math.round(avgScore * 10) / 10);
          const first = points[0].score;
          const latest = points[points.length - 1].score;
          setTrendPercent(first > 0 ? parseFloat((((latest - first) / first) * 100).toFixed(1)) : 0);
        } else {
          setVisibilityData([]);
          setCurrentScore(undefined);
          setTrendPercent(undefined);
        }
      } catch (err) {
        console.error('Visibility fetch error:', err);
      } finally {
        setIsLoadingVis(false);
      }
    };

    // Fetch mention rate + previous period trend — filtered by selected models
    const fetchMentionRate = async () => {
      setIsLoadingMention(true);
      try {
        const [rate, prevRate] = await Promise.all([
          fetchMentionRateValue(brandId, from, to, selectedModels),
          fetchMentionRateValue(brandId, prevFrom, prevTo, selectedModels),
        ]);

        if (rate !== null) {
          setMentionRate(rate);
          if (prevRate !== null) {
            setMentionTrend(parseFloat((rate - prevRate).toFixed(1)));
          } else {
            setMentionTrend(null);
          }
        } else {
          setMentionRate(0);
          setMentionTrend(null);
        }
      } catch (err) {
        console.error('Mention rate fetch error:', err);
      } finally {
        setIsLoadingMention(false);
      }
    };

    // Fetch share of voice + previous period trend
    const fetchShareOfVoice = async () => {
      setIsLoadingSov(true);
      try {
        const isFiltered = selectedModels.length < ALL_MODELS.length;

        if (isFiltered) {
          // Compute SoV from prompt_results filtered by selected providers
          const [current, previous] = await Promise.all([
            fetchSOVByProvider(brandId, from, to, selectedModels, brandName),
            fetchSOVByProvider(brandId, prevFrom, prevTo, selectedModels, brandName),
          ]);
          setSovData(current ?? undefined);
          if (current && previous) {
            const curBrand = current.entities.find(e => e.type === 'brand');
            const prevBrand = previous.entities.find(e => e.type === 'brand');
            const curPct = curBrand ? Math.round((curBrand.mentions / current.total_mentions) * 100) : 0;
            const prevPct = prevBrand ? Math.round((prevBrand.mentions / previous.total_mentions) * 100) : 0;
            setSovTrend(curPct - prevPct);
          } else {
            setSovTrend(null);
          }
          return;
        }

        // All models: use pre-aggregated share_of_voice_data
        const { data: reports, error } = await supabase
          .from('daily_reports')
          .select('share_of_voice_data')
          .eq('brand_id', brandId)
          .eq('status', 'completed')
          .not('share_of_voice_data', 'is', null)
          .gte('report_date', from)
          .lte('report_date', to);

        if (error) {
          console.error('Error fetching share of voice:', error);
          return;
        }

        if (reports && reports.length > 0) {
          const entityMap: Record<string, { name: string; mentions: number; type: string }> = {};
          let totalMentions = 0;

          for (const report of reports) {
            const sov = report.share_of_voice_data as any;
            if (!sov?.entities) continue;
            for (const entity of sov.entities) {
              const key = entity.name.toLowerCase();
              if (entityMap[key]) {
                entityMap[key].mentions += entity.mentions;
              } else {
                entityMap[key] = { name: entity.name, mentions: entity.mentions, type: entity.type };
              }
            }
            totalMentions += sov.total_mentions || 0;
          }

          const entities = Object.values(entityMap).sort((a, b) => b.mentions - a.mentions);

          setSovData({
            entities,
            total_mentions: totalMentions,
            calculated_at: new Date().toISOString(),
          });

          // Compute SOV trend vs previous period
          const currentBrandPct = await fetchBrandSOVPct(brandId, from, to);
          const prevBrandPct = await fetchBrandSOVPct(brandId, prevFrom, prevTo);
          if (currentBrandPct !== null && prevBrandPct !== null) {
            setSovTrend(currentBrandPct - prevBrandPct);
          } else {
            setSovTrend(null);
          }
        } else {
          setSovData(undefined);
          setSovTrend(null);
        }
      } catch (err) {
        console.error('Share of voice fetch error:', err);
      } finally {
        setIsLoadingSov(false);
      }
    };

    fetchVisibility();
    fetchMentionRate();
    fetchShareOfVoice();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandId, timeRange, customDateRange?.from, customDateRange?.to, selectedModels.join(',')]);

  const { from, to } = getDateRange(timeRange, customDateRange);
  const days = Math.ceil((new Date(to).getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24));
  const timePeriodLabel = `vs prev ${days}d`;

  return (
    <div className="grid grid-cols-12 gap-6 items-stretch">
      {/* Top Row: Primary Charts - Matched to Citations 8/4 @ 340px */}
      <div className="col-span-12 lg:col-span-8 h-[340px]">
        <VisibilityTrend
          data={visibilityData.length > 0 ? visibilityData : undefined}
          currentScore={currentScore}
          trendPercent={trendPercent}
          isLoading={isLoadingVis}
          brandId={brandId}
          brandName={brandName}
        />
      </div>
      <div className="col-span-12 lg:col-span-4 h-[340px]">
        <MentionRate
          value={mentionRate}
          trend={mentionTrend}
          timePeriodLabel={timePeriodLabel}
          isLoading={isLoadingMention}
          brandId={brandId}
        />
      </div>

      {/* Bottom Row: Distribution & Ranking - Balanced height */}
      <div className="col-span-12 lg:col-span-5 h-[380px]">
        <ShareOfVoice
          data={sovData}
          trend={sovTrend}
          timePeriodLabel={timePeriodLabel}
          isLoading={isLoadingSov}
          brandId={brandId}
        />
      </div>
      <div className="col-span-12 lg:col-span-7 h-[380px]">
        <PositionRanking brandId={brandId} timeRange={timeRange} customDateRange={customDateRange} selectedModels={selectedModels} onNavigateToPrompts={onNavigateToPrompts} />
      </div>
    </div>
  );
};
