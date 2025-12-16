"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from "recharts"
import { Info, Loader2, Sparkles } from "lucide-react"
import { useBrandsStore } from "@/store/brands"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useDateFilter } from "@/contexts/DateFilterContext"
import { useModelFilter } from "@/store/modelFilter"

export default function ReportsVisibility2() {
  const { brands, activeBrandId } = useBrandsStore()
  const { getDateRangeForAPI } = useDateFilter()
  const { selectedModels, getModelsForAPI } = useModelFilter()
  const activeBrand = brands.find(brand => brand.id === activeBrandId)
  const isDemoMode = activeBrand?.isDemo || false

  const [reportData, setReportData] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Load data using working pattern from Citations page
  useEffect(() => {
    const loadData = async () => {
      if (!activeBrandId || isDemoMode) {
        setIsLoading(false)
        return
      }

      try {
        setIsLoading(true)
        setError(null)

        const { from, to } = getDateRangeForAPI()
        const models = getModelsForAPI()
        let url = `/api/reports/visibility2?brandId=${activeBrandId}`
        if (from && to) {
          url += `&from=${from}&to=${to}`
        }
        if (models) {
          url += `&models=${models}`
        }

        console.log('🔄 [Visibility2] Fetching data:', { models, selectedModels, url })

        const response = await fetch(url)
        const data = await response.json()

        if (data.success) {
          console.log('✅ [Visibility2] Data loaded:', data.data)
          setReportData(data.data)
        } else {
          setError(data.error || 'Failed to load visibility data')
        }
      } catch (err) {
        console.error('Error loading visibility data:', err)
        setError('Failed to load visibility data')
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [activeBrandId, isDemoMode, getDateRangeForAPI, selectedModels])

  // KPI values
  const totalMentions = reportData?.totalMentions || 0
  const totalCompetitorMentions = reportData?.totalCompetitorMentions || 0
  const mentionsOverTime = reportData?.mentionsOverTime || []

  return (
    <TooltipProvider>
      <div className="p-8">
        {/* Breadcrumbs */}
        <div className="mb-6">
          <nav className="text-sm text-slate-500">
            <span>Reports</span>
            <span className="mx-2">/</span>
            <span className="text-slate-900 font-medium">Visibility 2</span>
          </nav>
        </div>

        {/* Demo Brand Alert */}
        {isDemoMode && (
          <Alert className="mb-6 border-amber-200 bg-amber-50">
            <Sparkles className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800">
              <strong>Demo Report:</strong> Viewing visibility data for {activeBrand?.name}.
              Switch to your brand to see real visibility metrics.
            </AlertDescription>
          </Alert>
        )}

        {/* Error State */}
        {error && (
          <Alert className="mb-6 border-red-200 bg-red-50">
            <Info className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800">
              <strong>Error:</strong> {error}
            </AlertDescription>
          </Alert>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            <span className="ml-2 text-slate-600">Loading visibility data...</span>
          </div>
        )}

        {/* Content */}
        {!isLoading && (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 gap-6 mb-8">
              {/* Brand Mentions */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Brand Mentionss (V2)</CardTitle>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-4 w-4 text-slate-400" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Total brand mentions from database (brand_mention_count column)</p>
                    </TooltipContent>
                  </Tooltip>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{totalMentions.toLocaleString()}</div>
                  <p className="text-xs text-slate-500">total mentions from database</p>
                </CardContent>
              </Card>

              {/* Competitor Mentions */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Competitor Mentions (V2)</CardTitle>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-4 w-4 text-slate-400" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Total competitor mentions from database (competitor_mention_counts column)</p>
                    </TooltipContent>
                  </Tooltip>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{totalCompetitorMentions.toLocaleString()}</div>
                  <p className="text-xs text-slate-500">total competitor mentions</p>
                </CardContent>
              </Card>
            </div>

            {/* Brand Mentions Over Time Chart */}
            <Card className="mb-8">
              <CardHeader>
                <CardTitle className="text-lg font-medium">Brand Mentions Over Time (V2)</CardTitle>
                <p className="text-xs text-slate-500">Daily brand mentions from brand_mention_count column</p>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={mentionsOverTime} margin={{ top: 20, right: 20, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis
                        dataKey="date"
                        stroke="#64748b"
                        fontSize={12}
                        tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      />
                      <YAxis
                        stroke="#3b82f6"
                        fontSize={12}
                        label={{ value: 'Mentions', angle: -90, position: 'insideLeft' }}
                      />
                      <RechartsTooltip
                        labelFormatter={(value) => new Date(value).toLocaleDateString()}
                        formatter={(value: any, name: string) => {
                          if (name === 'mentions') return [`${value} mentions`, 'Brand Mentions']
                          if (name === 'competitorMentions') return [`${value} mentions`, 'Competitor Mentions']
                          return [value, name]
                        }}
                        contentStyle={{
                          backgroundColor: 'white',
                          border: '1px solid #e2e8f0',
                          borderRadius: '8px',
                          fontSize: '12px'
                        }}
                      />
                      <Line
                        type="linear"
                        dataKey="mentions"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        dot={{ fill: '#3b82f6', strokeWidth: 2, r: 4 }}
                        name="Brand Mentions"
                      />
                      <Line
                        type="linear"
                        dataKey="competitorMentions"
                        stroke="#ef4444"
                        strokeWidth={2}
                        dot={{ fill: '#ef4444', strokeWidth: 2, r: 4 }}
                        name="Competitor Mentions"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Debug Info */}
            <Card className="mb-8">
              <CardHeader>
                <CardTitle className="text-lg font-medium">Debug Information</CardTitle>
                <p className="text-xs text-slate-500">Data source verification</p>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Data Source:</span>
                    <span className="font-mono text-slate-900">brand_mention_count & competitor_mention_counts columns</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Total Reports:</span>
                    <span className="font-mono text-slate-900">{reportData?.totalReports || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Selected Models:</span>
                    <span className="font-mono text-slate-900">{selectedModels.join(', ')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Date Range:</span>
                    <span className="font-mono text-slate-900">
                      {getDateRangeForAPI().from} to {getDateRangeForAPI().to}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </TooltipProvider>
  )
}
