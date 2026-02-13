import React from 'react';
import { TimeRange } from '../types';
import { VisibilityTrend } from './charts/VisibilityTrend';
import { MentionRate } from './charts/MentionRate';
import { ShareOfVoice } from './charts/ShareOfVoice';
import { PositionRanking } from './charts/PositionRanking';

interface DashboardProps {
  timeRange: TimeRange;
}

export const Dashboard: React.FC<DashboardProps> = ({ timeRange }) => {
  return (
    <div className="grid grid-cols-12 gap-6 items-stretch">
      {/* Top Row: Primary Charts - Matched to Citations 8/4 @ 340px */}
      <div className="col-span-12 lg:col-span-8 h-[340px]">
        <VisibilityTrend />
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