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

export const Dashboard: React.FC<DashboardProps> = ({ timeRange, brandId }) => {
  const [visibilityData, setVisibilityData] = useState<TrendDataPoint[]>([]);
  const [currentScore, setCurrentScore] = useState<number | undefined>();
  const [trendPercent, setTrendPercent] = useState<number | undefined>();
  const [isLoadingVis, setIsLoadingVis] = useState(false);

  useEffect(() => {
    if (!brandId) return;

    const fetchVisibility = async () => {
      setIsLoadingVis(true);
      try {
        const { from, to } = getDateRange(timeRange);

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
          const points: TrendDataPoint[] = data.map((row: any) => ({
            date: new Date(row.report_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            score: parseFloat(row.visibility_score) || 0,
          }));

          setVisibilityData(points);

          const latest = points[points.length - 1].score;
          setCurrentScore(latest);

          // Trend: % change from first to last in range
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

    fetchVisibility();
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
        <MentionRate />
      </div>

      {/* Bottom Row: Distribution & Ranking - Balanced height */}
      <div className="col-span-12 lg:col-span-5 h-[380px]">
        <ShareOfVoice />
      </div>
      <div className="col-span-12 lg:col-span-7 h-[380px]">
        <PositionRanking />
      </div>
    </div>
  );
};