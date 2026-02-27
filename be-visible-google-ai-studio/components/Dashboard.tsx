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
  onNavigateToPrompts?: () => void;
}

function getDateRange(timeRange: TimeRange): { from: string; to: string } {
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

export const Dashboard: React.FC<DashboardProps> = ({ timeRange, brandId, onNavigateToPrompts }) => {
  const [visibilityData, setVisibilityData] = useState<TrendDataPoint[]>([]);
  const [currentScore, setCurrentScore] = useState<number | undefined>();
  const [trendPercent, setTrendPercent] = useState<number | undefined>();
  const [isLoadingVis, setIsLoadingVis] = useState(false);
  const [mentionRate, setMentionRate] = useState<number | undefined>();
  const [isLoadingMention, setIsLoadingMention] = useState(false);
  const [sovData, setSovData] = useState<any>(undefined);
  const [isLoadingSov, setIsLoadingSov] = useState(false);

  useEffect(() => {
    if (!brandId) return;

    const { from, to } = getDateRange(timeRange);

    // Fetch visibility scores
    const fetchVisibility = async () => {
      setIsLoadingVis(true);
      try {
        const { data, error } = await supabase
          .from('daily_reports')
          .select('report_date, visibility_score')
          .eq('brand_id', brandId)
          .eq('status', 'completed')
          .not('visibility_score', 'is', null)
          .gte('report_date', from)
          .lte('report_date', to)
          .order('report_date', { ascending: true });

        if (error) {
          console.error('Error fetching visibility scores:', error);
          return;
        }

        if (data && data.length > 0) {
          // Deduplicate by report_date — keep the row with the highest visibility_score
          // (duplicate rows can appear if the end-of-day processor ran on the same date twice)
          const bestByDate = new Map<string, number>();
          data.forEach((row: any) => {
            const score = parseFloat(row.visibility_score) || 0;
            if (score > (bestByDate.get(row.report_date) ?? -1)) {
              bestByDate.set(row.report_date, score);
            }
          });

          const points: TrendDataPoint[] = Array.from(bestByDate.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([reportDate, score]) => ({
              date: new Date(reportDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
              score,
            }));

          setVisibilityData(points);

          const latest = points[points.length - 1].score;
          setCurrentScore(latest);

          const first = points[0].score;
          if (first > 0) {
            setTrendPercent(parseFloat((((latest - first) / first) * 100).toFixed(1)));
          } else {
            setTrendPercent(0);
          }
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

    // Fetch mention rate: get daily_report IDs, then count brand_mentioned in prompt_results
    const fetchMentionRate = async () => {
      setIsLoadingMention(true);
      try {
        // Step 1: get report IDs for this brand in range
        const { data: reports, error: reportsError } = await supabase
          .from('daily_reports')
          .select('id')
          .eq('brand_id', brandId)
          .eq('status', 'completed')
          .gte('report_date', from)
          .lte('report_date', to);

        if (reportsError || !reports || reports.length === 0) {
          setMentionRate(undefined);
          return;
        }

        const reportIds = reports.map((r: any) => r.id);

        // Step 2: count total prompt results and ones where brand was mentioned
        const { count: totalCount, error: totalErr } = await supabase
          .from('prompt_results')
          .select('*', { count: 'exact', head: true })
          .in('daily_report_id', reportIds);

        const { count: mentionedCount, error: mentionErr } = await supabase
          .from('prompt_results')
          .select('*', { count: 'exact', head: true })
          .in('daily_report_id', reportIds)
          .eq('brand_mentioned', true);

        if (totalErr || mentionErr) {
          console.error('Error fetching mention counts:', totalErr || mentionErr);
          return;
        }

        if (totalCount && totalCount > 0) {
          const rate = ((mentionedCount || 0) / totalCount) * 100;
          setMentionRate(parseFloat(rate.toFixed(1)));
        } else {
          setMentionRate(0);
        }
      } catch (err) {
        console.error('Mention rate fetch error:', err);
      } finally {
        setIsLoadingMention(false);
      }
    };

    // Fetch share of voice: aggregate share_of_voice_data across daily reports
    const fetchShareOfVoice = async () => {
      setIsLoadingSov(true);
      try {
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
          // Aggregate entities across all days
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

          const entities = Object.values(entityMap)
            .sort((a, b) => b.mentions - a.mentions);

          setSovData({
            entities,
            total_mentions: totalMentions,
            calculated_at: new Date().toISOString(),
          });
        } else {
          setSovData(undefined);
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
  }, [brandId, timeRange]);

  return (
    <div className="grid grid-cols-12 gap-6 items-stretch">
      {/* Top Row: Primary Charts - Matched to Citations 8/4 @ 340px */}
      <div className="col-span-12 lg:col-span-8 h-[340px]">
        <VisibilityTrend
          data={visibilityData.length > 0 ? visibilityData : undefined}
          currentScore={currentScore}
          trendPercent={trendPercent}
          isLoading={isLoadingVis}
        />
      </div>
      <div className="col-span-12 lg:col-span-4 h-[340px]">
        <MentionRate value={mentionRate} isLoading={isLoadingMention} />
      </div>

      {/* Bottom Row: Distribution & Ranking - Balanced height */}
      <div className="col-span-12 lg:col-span-5 h-[380px]">
        <ShareOfVoice data={sovData} isLoading={isLoadingSov} />
      </div>
      <div className="col-span-12 lg:col-span-7 h-[380px]">
        <PositionRanking brandId={brandId} timeRange={timeRange} onNavigateToPrompts={onNavigateToPrompts} />
      </div>
    </div>
  );
};