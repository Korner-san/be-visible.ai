"use client"

import { VisibilityTrend } from "@/components/charts-new/VisibilityTrend"
import { MentionRate } from "@/components/charts-new/MentionRate"
import { ShareOfVoice } from "@/components/charts-new/ShareOfVoice"
import { PositionRanking } from "@/components/charts-new/PositionRanking"

export default function ReportsVisibility() {
  return (
    <div className="p-8">
      <div className="grid grid-cols-12 gap-6 animate-fadeIn">
        <div className="col-span-12 lg:col-span-8 h-[340px]">
          <VisibilityTrend />
        </div>
        <div className="col-span-12 lg:col-span-4 h-[340px]">
          <MentionRate />
        </div>
        <div className="col-span-12 lg:col-span-5 h-[380px]">
          <ShareOfVoice />
        </div>
        <div className="col-span-12 lg:col-span-7 h-[380px]">
          <PositionRanking />
        </div>
      </div>
    </div>
  )
}
