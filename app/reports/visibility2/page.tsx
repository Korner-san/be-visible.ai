"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from "recharts"
import { Info, Sparkles, Loader2 } from "lucide-react"
import { useBrandsStore } from "@/store/brands"
import { useDateFilter } from "@/contexts/DateFilterContext"
import { useModelFilter } from "@/store/modelFilter"

export default function ReportsVisibility2() {
  const { brands, activeBrandId } = useBrandsStore()
  const { getDateRangeForAPI } = useDateFilter()
  const { selectedModels, getModelsForAPI } = useModelFilter()
  const activeBrand = brands.find(brand => brand.id === activeBrandId)
  const isDemoMode = activeBrand?.isDemo || false

  const [scoreData, setScoreData] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const loadScoreData = async () => {
      if (!activeBrandId || isDemoMode) {
        setIsLoading(false)
        return
      }

      try {
        setIsLoading(true)

        const { from, to } = getDateRangeForAPI()
        const models = getModelsForAPI()
        let url = `/api/reports/visibility-score?brandId=${activeBrandId}`
        if (from && to) {
          url += `&from=${from}&to=${to}`
        }
        if (models) {
          url += `&models=${models}`
        }

        const response = await fetch(url)
        const data = await response.json()

        if (data.success) {
          setScoreData(data.data)
        }
      } catch (err) {
        console.error('Error loading visibility score:', err)
      } finally {
        setIsLoading(false)
      }
    }

    loadScoreData()
  }, [activeBrandId, isDemoMode, selectedModels, getDateRangeForAPI, getModelsForAPI])

  // Demo data
  const demoData = {
    scores: [
      { date: '2025-12-18', score: 45 },
      { date: '2025-12-19', score: 52 },
      { date: '2025-12-20', score: 48 },
      { date: '2025-12-21', score: 61 },
      { date: '2025-12-22', score: 58 },
      { date: '2025-12-23', score: 65 },
      { date: '2025-12-24', score: 72 },
    ],
    summary: {
      currentScore: 72,
      avgScore: 57,
      trend: 'increasing'
    }
  }

  const displayData = isDemoMode ? demoData : scoreData

  return (
    <TooltipProvider>
      <div className="p-8">
        {/* Breadcrumbs */}
        <div className="mb-6">
          <nav className="text-sm text-slate-500">
            <span>Reports</span>
            <span className="mx-2">/</span>
            <span className="text-slate-900 font-medium">Visibility Score</span>
          </nav>
        </div>

        {/* Demo Brand Alert */}
        {isDemoMode && (
          <Alert className="mb-6 border-amber-200 bg-amber-50">
            <Sparkles className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800">
              <strong>Demo Report:</strong> Viewing visibility score for {activeBrand?.name}.
              Switch to your brand to see real visibility metrics.
            </AlertDescription>
          </Alert>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            <span className="ml-2 text-slate-600">Loading visibility score...</span>
          </div>
        )}

        {/* Content */}
        {!isLoading && displayData && (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-slate-600">Current Score</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-slate-900">
                    {displayData.summary?.currentScore || 0}<span className="text-xl text-slate-500">/100</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-slate-600">Average Score</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-slate-900">
                    {displayData.summary?.avgScore?.toFixed(1) || 0}<span className="text-xl text-slate-500">/100</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-slate-600">Trend</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">
                    {displayData.summary?.trend === 'increasing' && <span className="text-green-600">↗ Up</span>}
                    {displayData.summary?.trend === 'decreasing' && <span className="text-red-600">↘ Down</span>}
                    {displayData.summary?.trend === 'stable' && <span className="text-slate-600">→ Stable</span>}
                    {!displayData.summary?.trend && <span className="text-slate-400">—</span>}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Visibility Score Chart */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg font-medium flex items-center gap-2">
                      Visibility Score Over Time
                      <Tooltip>
                        <TooltipTrigger>
                          <Info className="h-4 w-4 text-slate-400" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-md">
                          <div>
                            <p className="font-medium mb-2">How is the score calculated?</p>
                            <p className="text-sm mb-3">The visibility score (0-100) is based on three factors:</p>
                            <ul className="text-sm space-y-2">
                              <li><strong>Mention Rate (40%):</strong> How often your brand appears in AI responses</li>
                              <li><strong>Competitive Position (30%):</strong> How early you appear vs competitors</li>
                              <li><strong>Mention Dominance (30%):</strong> Your mentions vs total mentions</li>
                            </ul>
                            <p className="text-xs text-slate-400 mt-3">Higher scores indicate stronger AI visibility for your brand.</p>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </CardTitle>
                    <p className="text-xs text-slate-500 mt-1">
                      Daily visibility score based on brand mentions, position, and competitive analysis
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {displayData.scores && displayData.scores.length > 0 ? (
                  <ResponsiveContainer width="100%" height={400}>
                    <LineChart data={displayData.scores} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
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
                        domain={[0, 100]}
                        ticks={[0, 25, 50, 75, 100]}
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
                        formatter={(value: any) => [`${value}/100`, 'Visibility Score']}
                      />
                      <Line
                        type="monotone"
                        dataKey="score"
                        stroke="#3b82f6"
                        strokeWidth={3}
                        dot={{ fill: '#3b82f6', strokeWidth: 2, r: 5 }}
                        activeDot={{ r: 7 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-center py-12 text-slate-500">
                    <p className="text-sm">No visibility data available for the selected date range</p>
                    <p className="text-xs mt-1">Try adjusting your date filter or run more batches</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </TooltipProvider>
  )
}
