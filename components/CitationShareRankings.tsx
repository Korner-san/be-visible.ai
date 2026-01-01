"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Info, Loader2, TrendingUp, TrendingDown } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface CitationShareRankingsProps {
  brandId: string
  reportDate?: string
  isDemoMode?: boolean
}

export function CitationShareRankings({ brandId, reportDate, isDemoMode = false }: CitationShareRankingsProps) {
  const [rankingsData, setRankingsData] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const loadRankings = async () => {
      if (!brandId || isDemoMode) {
        setIsLoading(false)
        return
      }

      try {
        setIsLoading(true)

        let url = `/api/reports/citation-share/rankings?brandId=${brandId}`
        if (reportDate) {
          url += `&date=${reportDate}`
        }

        const response = await fetch(url)
        const data = await response.json()

        if (data.success) {
          setRankingsData(data.data)
        }
      } catch (err) {
        console.error('Error loading citation rankings:', err)
      } finally {
        setIsLoading(false)
      }
    }

    loadRankings()
  }, [brandId, reportDate, isDemoMode])

  // Demo data
  const demoData = {
    rankings: [
      { rank: 1, domain: 'competitor1.com', displayName: 'Top Competitor', isBrand: false, share: 13.4, shareChange: 1.0 },
      { rank: 2, domain: 'competitor2.com', displayName: 'Second Competitor', isBrand: false, share: 9.6, shareChange: 0.4 },
      { rank: 3, domain: 'yourbrand.com', displayName: 'Your Brand (Your Brand)', isBrand: true, share: 6.9, shareChange: 1.3 },
      { rank: 4, domain: 'competitor3.com', displayName: 'Third Competitor', isBrand: false, share: 5.2, shareChange: -0.8 },
      { rank: 5, domain: 'competitor4.com', displayName: 'Fourth Competitor', isBrand: false, share: 3.1, shareChange: 0.2 }
    ],
    reportDate: '2025-12-26',
    brandRank: 3
  }

  const displayData = isDemoMode ? demoData : rankingsData

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Citation Share Rankings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            <span className="ml-2 text-slate-600">Loading rankings...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!displayData || !displayData.rankings || displayData.rankings.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Citation Share Rankings</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500 text-center py-8">
            No ranking data available. Citation share will be calculated after daily reports complete.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg font-medium flex items-center gap-2">
              Citation Share Rankings
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-4 w-4 text-slate-400" />
                </TooltipTrigger>
                <TooltipContent className="max-w-md">
                  <div>
                    <p className="font-medium mb-2">How are rankings calculated?</p>
                    <p className="text-sm">
                      Rankings show how your citation share compares to competitors.
                      Higher rank means your website is cited more frequently in AI responses.
                    </p>
                  </div>
                </TooltipContent>
              </Tooltip>
            </CardTitle>
            <p className="text-xs text-slate-500 mt-1">
              {displayData.reportDate && `As of ${new Date(displayData.reportDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}
            </p>
          </div>
          {displayData.brandRank && (
            <div className="text-right">
              <div className="text-2xl font-bold text-slate-900">
                #{displayData.brandRank}
              </div>
              <div className="text-xs text-slate-500">Your Rank</div>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {displayData.rankings.map((ranking: any) => (
            <div
              key={ranking.domain}
              className={`flex items-center justify-between p-3 rounded-lg border ${
                ranking.isBrand
                  ? 'bg-blue-50 border-blue-200'
                  : 'bg-white border-slate-200'
              }`}
            >
              <div className="flex items-center gap-3 flex-1">
                <div className={`flex items-center justify-center w-8 h-8 rounded-full ${
                  ranking.rank === 1 ? 'bg-yellow-100 text-yellow-700' :
                  ranking.rank === 2 ? 'bg-slate-100 text-slate-700' :
                  ranking.rank === 3 ? 'bg-orange-100 text-orange-700' :
                  'bg-slate-50 text-slate-600'
                } font-bold text-sm`}>
                  {ranking.rank}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <div className="font-medium text-sm text-slate-900">
                      {ranking.domain}
                    </div>
                    {ranking.isBrand && (
                      <Badge variant="outline" className="text-xs bg-blue-50 border-blue-200 text-blue-700">
                        Your Brand
                      </Badge>
                    )}
                  </div>
                  {!ranking.isBrand && ranking.displayName && (
                    <div className="text-xs text-slate-500">{ranking.displayName}</div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4">
                {ranking.shareChange !== undefined && ranking.shareChange !== 0 && (
                  <div className={`flex items-center gap-1 text-xs ${
                    ranking.shareChange > 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {ranking.shareChange > 0 ? (
                      <TrendingUp className="h-3 w-3" />
                    ) : (
                      <TrendingDown className="h-3 w-3" />
                    )}
                    <span>{Math.abs(ranking.shareChange).toFixed(1)}%</span>
                  </div>
                )}
                <div className="text-right min-w-[80px]">
                  <div className="font-bold text-slate-900">
                    {ranking.share.toFixed(1)}%
                  </div>
                  {ranking.citationCount !== undefined && (
                    <div className="text-xs text-slate-500">
                      {ranking.citationCount} citations
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
        {displayData.rankings.length === 0 && (
          <p className="text-sm text-slate-500 text-center py-8">
            No rankings available for this period
          </p>
        )}
      </CardContent>
    </Card>
  )
}
