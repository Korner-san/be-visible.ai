"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from "recharts"
import { Info, Loader2 } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface CitationShareChartProps {
  brandId: string
  fromDate?: string
  toDate?: string
  isDemoMode?: boolean
}

export function CitationShareChart({ brandId, fromDate, toDate, isDemoMode = false }: CitationShareChartProps) {
  const [shareData, setShareData] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const loadShareData = async () => {
      if (!brandId || isDemoMode) {
        setIsLoading(false)
        return
      }

      try {
        setIsLoading(true)

        let url = `/api/reports/citation-share/over-time?brandId=${brandId}`
        if (fromDate && toDate) {
          url += `&from=${fromDate}&to=${toDate}`
        }

        const response = await fetch(url)
        const data = await response.json()

        if (data.success) {
          setShareData(data.data)
        }
      } catch (err) {
        console.error('Error loading citation share:', err)
      } finally {
        setIsLoading(false)
      }
    }

    loadShareData()
  }, [brandId, fromDate, toDate, isDemoMode])

  // Demo data
  const demoData = {
    shares: [
      { date: '2025-12-18', share: 2.5 },
      { date: '2025-12-19', share: 3.2 },
      { date: '2025-12-20', share: 2.8 },
      { date: '2025-12-21', share: 4.1 },
      { date: '2025-12-22', share: 3.9 },
      { date: '2025-12-23', share: 5.2 },
      { date: '2025-12-24', share: 6.1 }
    ],
    summary: {
      currentShare: 6.1,
      avgShare: 4.0,
      trend: 'increasing',
      currentRank: 3,
      brandDomain: 'yourbrand.com'
    }
  }

  const displayData = isDemoMode ? demoData : shareData

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Citation Share Over Time</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            <span className="ml-2 text-slate-600">Loading citation share data...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!displayData || !displayData.shares || displayData.shares.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Citation Share Over Time</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500 text-center py-8">
            No citation share data available. Run daily reports to see citation share trends.
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
              Citation Share Over Time
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-4 w-4 text-slate-400" />
                </TooltipTrigger>
                <TooltipContent className="max-w-md">
                  <div>
                    <p className="font-medium mb-2">What is Citation Share?</p>
                    <p className="text-sm">
                      Citation share shows what percentage of all citations in AI responses point to your website vs competitors.
                      A higher share means your content is being referenced more frequently by AI systems.
                    </p>
                  </div>
                </TooltipContent>
              </Tooltip>
            </CardTitle>
            <p className="text-xs text-slate-500 mt-1">
              Percentage of total citations linking to {displayData.summary?.brandDomain || 'your domain'}
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-slate-900">
              {displayData.summary?.currentShare?.toFixed(1) || 0}%
            </div>
            <div className="text-xs text-slate-500">
              Current Share
              {displayData.summary?.currentRank && (
                <span className="ml-1">(Rank #{displayData.summary.currentRank})</span>
              )}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={displayData.shares} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="date"
              stroke="#64748b"
              style={{ fontSize: '12px' }}
              tickFormatter={(value) => {
                const date = new Date(value)
                return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              }}
            />
            <YAxis
              stroke="#64748b"
              style={{ fontSize: '12px' }}
              tickFormatter={(value) => `${value}%`}
            />
            <RechartsTooltip
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '12px'
              }}
              labelFormatter={(value) => {
                const date = new Date(value)
                return date.toLocaleDateString('en-US', {
                  weekday: 'short',
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric'
                })
              }}
              formatter={(value: any) => [`${value.toFixed(2)}%`, 'Citation Share']}
            />
            <Line
              type="monotone"
              dataKey="share"
              stroke="#10b981"
              strokeWidth={3}
              dot={{ fill: '#10b981', strokeWidth: 2, r: 5 }}
              activeDot={{ r: 7 }}
            />
          </LineChart>
        </ResponsiveContainer>
        <div className="mt-4 grid grid-cols-3 gap-4 border-t pt-4">
          <div>
            <div className="text-xs text-slate-500">Avg Share</div>
            <div className="text-lg font-semibold text-slate-900">
              {displayData.summary?.avgShare?.toFixed(1) || 0}%
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Trend</div>
            <div className="text-lg font-semibold">
              {displayData.summary?.trend === 'increasing' && <span className="text-green-600">↗ Up</span>}
              {displayData.summary?.trend === 'decreasing' && <span className="text-red-600">↘ Down</span>}
              {displayData.summary?.trend === 'stable' && <span className="text-slate-600">→ Stable</span>}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Data Points</div>
            <div className="text-lg font-semibold text-slate-900">
              {displayData.shares?.length || 0}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
