"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Button } from "@/components/ui/button"
import { PieChart, Pie, Cell, ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, LineChart, Line, Area, AreaChart } from "recharts"
import { Info, Play, Loader2 } from "lucide-react"
import { useBrandsStore } from "@/store/brands"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useToast } from "@/hooks/use-toast"
import { useDateFilter } from "@/contexts/DateFilterContext"
import { useModelFilter } from "@/store/modelFilter"
import { PositionScoreOverTime } from "@/components/PositionScoreOverTime"
import { CoverageStackedBarChart } from "@/components/CoverageStackedBarChart"
import { BrandDomainCitationsTable } from "@/components/BrandDomainCitationsTable"

// Helper function to format portrayal types and get descriptions
const getPortrayalTypeInfo = (type: string) => {
  const typeMap: Record<string, { label: string; description: string }> = {
    'RECOMMENDATION': { 
      label: 'Recommendation', 
      description: 'steers the reader to choose/use the brand.' 
    },
    'COMPARISON': { 
      label: 'Comparison', 
      description: 'contrasts the brand with alternatives.' 
    },
    'PROBLEM_SOLVER': { 
      label: 'Problem Solver', 
      description: 'frames the brand as solving a specific pain/problem.' 
    },
    'FEATURE_BENEFIT': { 
      label: 'Feature Benefit', 
      description: 'highlights capabilities/benefits/differentiators.' 
    },
    'NEUTRAL_DESCRIPTION': { 
      label: 'Neutral Description', 
      description: 'simple definition/intro.' 
    },
    'AUTHORITY_REFERENCE': { 
      label: 'Authority Reference', 
      description: 'cites brand as example/reference/benchmark/best practice.' 
    },
    'USE_CASE': { 
      label: 'Use Case', 
      description: 'scenario where the brand fits/is typically used.' 
    },
    'OTHER': { 
      label: 'Other', 
      description: 'none fit confidently.' 
    }
  }
  
  return typeMap[type] || { label: type, description: 'Unknown portrayal type.' }
}

export default function ReportsVisibility() {
  const { brands, activeBrandId } = useBrandsStore()
  const { getDateRangeParams, getDateRangeForAPI } = useDateFilter()
  const { selectedModels, getModelsForAPI } = useModelFilter()
  const activeBrand = brands.find(brand => brand.id === activeBrandId)
  const isDemoMode = activeBrand?.isDemo || false
  const { toast } = useToast()
  
  const [isGeneratingReport, setIsGeneratingReport] = useState(false)
  const [reportData, setReportData] = useState<any>(null)
  const [brandCitationsData, setBrandCitationsData] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isBrandCitationsLoading, setIsBrandCitationsLoading] = useState(true)
  
  // Check if user is test user (for manual trigger button)
  const [isTestUser, setIsTestUser] = useState(false)
  
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true)
      
      try {
        // Check if current user is test user
        const profileResponse = await fetch('/api/user/profile')
        const profileData = await profileResponse.json()
        setIsTestUser(profileData.email === 'kk1995current@gmail.com')
        
        // Load visibility data if not demo mode
        if (!isDemoMode && activeBrandId) {
          const { from, to } = getDateRangeForAPI()
          const models = getModelsForAPI()
          let url = `/api/reports/visibility?brandId=${activeBrandId}`
          if (from && to) {
            url += `&from=${from}&to=${to}`
          }
          if (models) {
            url += `&models=${models}`
          }
          
          console.log('🔄 [Visibility] Fetching data with models:', models, 'selectedModels:', selectedModels)
          
          const visibilityResponse = await fetch(url)
          const visibilityData = await visibilityResponse.json()
          
          if (visibilityData.success) {
            console.log('✅ [Visibility] Data loaded:', {
              totalMentions: visibilityData.data.totalMentions,
              models: models,
              reportsCount: visibilityData.data.totalReports
            })
            setReportData(visibilityData.data)
          }
        }
      } catch (error) {
        console.error('Error loading data:', error)
      } finally {
        setIsLoading(false)
      }
    }
    
    loadData()
  }, [activeBrandId, isDemoMode, getDateRangeForAPI, selectedModels])
  
  // Load brand domain citations separately
  useEffect(() => {
    const loadBrandCitations = async () => {
      if (!activeBrandId || isDemoMode) {
        setIsBrandCitationsLoading(false)
        return
      }
      
      try {
        setIsBrandCitationsLoading(true)
        
        const { from, to } = getDateRangeForAPI()
        const models = getModelsForAPI()
        let url = `/api/reports/visibility/brand-citations?brandId=${activeBrandId}`
        if (from && to) {
          url += `&from=${from}&to=${to}`
        }
        if (models) {
          url += `&models=${models}`
        }
        
        const response = await fetch(url)
        const data = await response.json()
        
        if (data.success) {
          setBrandCitationsData(data.data)
        }
      } catch (error) {
        console.error('Error loading brand citations:', error)
      } finally {
        setIsBrandCitationsLoading(false)
      }
    }
    
    loadBrandCitations()
  }, [activeBrandId, isDemoMode, getDateRangeForAPI, selectedModels])
  
  // Manual report generation
  const generateManualReport = async () => {
    if (!activeBrandId || isDemoMode) return
    
    setIsGeneratingReport(true)
    
    try {
      toast({
        title: "🤖 Generating Report",
        description: "Running Perplexity analysis on all active prompts...",
        duration: 5000,
      })
      
      const response = await fetch('/api/reports/generate-daily', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          brandId: activeBrandId,
          manual: true
        })
      })
      
      const result = await response.json()
      
      if (result.success) {
        toast({
          title: "✅ Report Generated",
          description: `Processed ${result.totalPrompts} prompts, found ${result.totalMentions} brand mentions`,
          duration: 8000,
        })
        
        // Reload data instead of full page refresh
        const visibilityResponse = await fetch(`/api/reports/visibility?brandId=${activeBrandId}`)
        const visibilityData = await visibilityResponse.json()
        
        if (visibilityData.success) {
          setReportData(visibilityData.data)
        }
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('Error generating report:', error)
      toast({
        title: "❌ Report Failed",
        description: error instanceof Error ? error.message : "Failed to generate report",
        duration: 8000,
      })
    } finally {
      setIsGeneratingReport(false)
    }
  }

  
  // Use real data when available, fallback to mock data for demo
  const sentimentData = reportData?.sentiment || [
    { name: 'Positive', value: isDemoMode ? 67 : 0, color: '#10b981' },
    { name: 'Neutral', value: isDemoMode ? 28 : 0, color: '#6b7280' },
    { name: 'Negative', value: isDemoMode ? 5 : 0, color: '#ef4444' }
  ]
  
  // Check if we have real sentiment data
  const hasRealSentimentData = reportData?.sentiment && reportData.sentiment.some((s: any) => s.value > 0)

  const mentionsData = reportData?.mentionsVsCompetitors || [
    { brand: activeBrand?.name || 'Your Brand', mentions: isDemoMode ? 2847 : 0, x: 1, color: '#3b82f6' },
    { brand: isDemoMode ? 'Microsoft' : 'Competitor A', mentions: isDemoMode ? 2156 : 0, x: 2, color: '#ef4444' },
    { brand: 'Competitor B', mentions: isDemoMode ? 1923 : 0, x: 3, color: '#10b981' },
    { brand: 'Competitor C', mentions: isDemoMode ? 1687 : 0, x: 4, color: '#f59e0b' },
    { brand: 'Competitor D', mentions: isDemoMode ? 1456 : 0, x: 5, color: '#8b5cf6' }
  ]
  
  // KPI values
  const totalMentions = reportData?.totalMentions || (isDemoMode ? 2847 : 0)
  const averagePosition = reportData?.averagePosition || (isDemoMode ? 156 : 0)
  
  // Mentions over time data
  const mentionsOverTimeData = reportData?.mentionsOverTime || (isDemoMode ? [
    { date: '2024-12-15', mentions: 45, averagePosition: 120 },
    { date: '2024-12-16', mentions: 52, averagePosition: 98 },
    { date: '2024-12-17', mentions: 38, averagePosition: 156 },
    { date: '2024-12-18', mentions: 67, averagePosition: 89 },
    { date: '2024-12-19', mentions: 43, averagePosition: 134 },
    { date: '2024-12-20', mentions: 58, averagePosition: 112 }
  ] : [])

  // Dynamic dot scaling to keep stacks in 4-12 range
  const maxMentions = Math.max(...mentionsData.map(item => item.mentions))
  const targetMaxDots = 10 // Sweet spot for visibility
  const dotUnit = maxMentions > targetMaxDots ? Math.ceil(maxMentions / targetMaxDots) : 1
  
  // Create dots for each brand with dynamic scaling
  const dotData = mentionsData.flatMap(item => {
    const dots = []
    const visibleDots = Math.max(1, Math.floor(item.mentions / dotUnit)) // Ensure at least 1 dot
    
    for (let i = 0; i < visibleDots; i++) {
      dots.push({
        brand: item.brand,
        x: item.x,
        y: i + 1,
        color: item.color,
        mentions: item.mentions, // Keep original count for tooltip
        dotUnit: dotUnit // Include dot unit for tooltip
      })
    }
    return dots
  })

  // Data for portrayal type table - BRAND ONLY (no competitors)
  const portrayalData = reportData?.portrayalTypes ? 
    reportData.portrayalTypes : 
    (isDemoMode ? [
      {
        brand: activeBrand?.name || 'Your Brand',
        type: 'feature_focus',
        count: 28,
        percentage: 35,
        example: '"Your Brand offers comprehensive solutions for..."'
      },
      {
        brand: activeBrand?.name || 'Your Brand',
        type: 'description',
        count: 25,
        percentage: 31,
        example: '"Your Brand is a platform that provides..."'
      },
      {
        brand: activeBrand?.name || 'Your Brand',
        type: 'listing',
        count: 18,
        percentage: 22,
        example: '"Options include Your Brand, which specializes in..."'
      },
      {
        brand: activeBrand?.name || 'Your Brand',
        type: 'recommendation',
        count: 9,
        percentage: 12,
        example: '"I recommend Your Brand for its advanced features..."'
      }
    ] : [])

  return (
    <TooltipProvider>
      <div className="p-8">
        {/* Breadcrumbs & Actions */}
        <div className="flex items-center justify-between mb-6">
          <nav className="text-sm text-slate-500">
            <span>Reports</span>
            <span className="mx-2">/</span>
            <span className="text-slate-900 font-medium">Visibility</span>
          </nav>
          

          {/* Manual Report Generation Button (Test User Only) */}
          {isTestUser && !isDemoMode && (
            <Button 
              onClick={generateManualReport}
              disabled={isGeneratingReport}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isGeneratingReport ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Generate Report
                </>
              )}
            </Button>
          )}
          
          {/* Fallback button for testing (visible when in demo mode) */}
          {isTestUser && isDemoMode && (
            <Button 
              variant="outline"
              onClick={() => alert('Please select a real brand (not demo) to generate reports')}
              className="text-orange-600 border-orange-300"
            >
              <Play className="w-4 h-4 mr-2" />
              Generate Report (Demo Mode)
            </Button>
          )}
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

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            <span className="ml-2 text-slate-600">Loading visibility...</span>
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
              <CardTitle className="text-sm font-medium">Brand Mentions</CardTitle>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-4 w-4 text-slate-400" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Total number of times your brand was mentioned by AI models</p>
                </TooltipContent>
              </Tooltip>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalMentions.toLocaleString()}</div>
              <p className="text-xs text-slate-500">total mentions</p>
            </CardContent>
          </Card>

          {/* Share of Voice */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Share of Voice</CardTitle>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-4 w-4 text-slate-400" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="font-semibold mb-1">Your brand's visibility compared to competitors</p>
                  <p className="text-xs">This shows what percentage of the conversation your brand owns when AI models discuss you alongside the competitors you selected during onboarding. A higher percentage means your brand appears more frequently than your competitors.</p>
                </TooltipContent>
              </Tooltip>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {reportData?.shareOfVoice && reportData.shareOfVoice.length > 0 
                  ? `${reportData.shareOfVoice.find((s: any) => s.isBrand)?.percentage || 0}%`
                  : 'N/A'}
              </div>
              <p className="text-xs text-slate-500">
                {reportData?.shareOfVoice && reportData.shareOfVoice.length > 0
                  ? 'of mentions vs your competitors'
                  : 'no data available'}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Row 1: Brand Mentions Over Time + Sentiment Distribution */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Chart 1: Brand Mentions Over Time */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-medium">Brand Mentions Over Time</CardTitle>
              <p className="text-xs text-slate-500">Daily brand mentions across all active prompts</p>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={mentionsOverTimeData} margin={{ top: 20, right: 20, left: 20, bottom: 5 }}>
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
                      formatter={(value: any) => [`${value} mentions`, 'Brand Mentions']}
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
                      dot={{ fill: '#ef4444', strokeWidth: 2, r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Sentiment Distribution */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Sentiment Distribution</CardTitle>
              <p className="text-xs text-slate-500">Overall sentiment of brand mentions</p>
            </CardHeader>
            <CardContent>
              {(hasRealSentimentData || isDemoMode) && sentimentData.some((s: any) => s.value > 0) ? (
                <>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={sentimentData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {sentimentData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <RechartsTooltip
                          contentStyle={{
                            backgroundColor: 'white',
                            border: '1px solid #e2e8f0',
                            borderRadius: '8px',
                            fontSize: '12px'
                          }}
                          formatter={(value: any, name: any) => [`${value}%`, name]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-4 space-y-2">
                    {sentimentData.map((entry, index) => (
                      <div key={`legend-${index}`} className="flex items-center justify-between text-sm">
                        <div className="flex items-center">
                          <span className="inline-block w-3 h-3 rounded-full mr-2" style={{ backgroundColor: entry.color }}></span>
                          {entry.name}
                        </div>
                        <span className="font-medium">{entry.value}%</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="h-64 flex items-center justify-center text-slate-500">
                  <div className="text-center">
                    <div className="text-sm mb-2">No sentiment data available</div>
                    <div className="text-xs">Generate reports to see sentiment analysis</div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Chart 3: Coverage Score Over Time - Vega-Lite Stacked Bar Chart */}
        <div className="grid gap-6 mb-8">
          <CoverageStackedBarChart 
            data={reportData?.coverageOverTime || []}
            brandName={activeBrand?.name || 'Your Brand'}
            isLoading={isLoading}
          />
        </div>

        {/* Row 2: Brand vs Competitors + Portrayal Types */}
        <div className="grid grid-cols-2 gap-6 mb-8">
          {/* Brand vs Competitors Dot Plot */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Brand vs Competitors: Response Counts</CardTitle>
              <p className="text-xs text-slate-500">Number of responses where each entity was mentioned</p>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart data={dotData} margin={{ top: 20, right: 20, bottom: 60, left: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis 
                      type="number" 
                      dataKey="x" 
                      domain={[0.5, 5.5]}
                      tick={false}
                      axisLine={true}
                      axisLineColor="#e2e8f0"
                    />
                    <YAxis 
                      type="number" 
                      dataKey="y"
                      tick={true}
                      axisLine={true}
                      axisLineColor="#e2e8f0"
                      tickLine={true}
                      tickLineColor="#e2e8f0"
                      domain={[0, Math.ceil((Math.max(...dotData.map(d => d.y)) + 2) * 1.1)]}
                      tickFormatter={(value) => (value * dotUnit).toLocaleString()}
                      label={{ 
                        value: 'Mentions', 
                        angle: -90, 
                        position: 'insideLeft', 
                        style: { textAnchor: 'middle', fill: '#64748b', marginLeft: '10px' } 
                      }}
                    />
                    <RechartsTooltip 
                      content={({ active, payload, coordinate }) => {
                        if (!active || !payload || payload.length === 0) return null
                        
                        // Find the specific dot being hovered by checking coordinates
                        // Only show data for the exact dot, not all dots at the same level
                        const hoveredData = payload.find(p => p.payload) || payload[0]
                        const data = hoveredData.payload
                        
                        return (
                          <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-sm">
                            <div className="font-medium text-slate-900">
                              {data.brand}
                            </div>
                            <div className="text-slate-600">
                              {data.mentions.toLocaleString()} mentions
                            </div>
                          </div>
                        )
                      }}
                      cursor={false} // Prevent cross-brand highlighting
                      shared={false} // Disable shared tooltip mode
                      allowEscapeViewBox={{ x: false, y: false }}
                    />
                    {mentionsData.map((brand, index) => (
                      <Scatter
                        key={`scatter-${brand.brand}`}
                        name={brand.brand} // Unique name per brand
                        data={dotData.filter(dot => dot.brand === brand.brand)}
                        dataKey="y"
                        fill="white"
                        stroke={brand.color}
                        strokeWidth={2}
                        r={6}
                        isAnimationActive={false} // Disable animation to prevent tooltip conflicts
                      />
                    ))}
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
              {/* Legend for dot scaling */}
              <div className="mt-2 text-center">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-slate-50 rounded text-xs text-slate-600">
                  <div className="w-2 h-2 rounded-full bg-white border border-slate-400"></div>
                  <span>Each dot = {dotUnit.toLocaleString()} mentions</span>
                  </div>
              </div>
              
              {/* X-axis labels with color swatches - single row */}
              <div className="mt-4 flex justify-between px-4">
                {mentionsData.map((item, index) => (
                  <div key={index} className="text-xs text-slate-600 text-center flex flex-col items-center" style={{ width: `${100/mentionsData.length}%` }}>
                    <div className="flex items-center gap-1 mb-1">
                    <div 
                        className="w-2 h-2 rounded-full border" 
                        style={{ backgroundColor: 'white', borderColor: item.color }}
                    />
                      <div className="font-medium">{item.brand}</div>
                    </div>
                    <div className="text-slate-500">{item.mentions.toLocaleString()} mentions</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Brand Portrayal Types */}
          <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              Brand Portrayal Analysis (How your brand is positioned in AI responses)
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-4 w-4 text-slate-400" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>This table shows how your brand was mentioned across AI responses: whether as a recommended choice, feature-focused description, listing option, or other portrayal types.</p>
                </TooltipContent>
              </Tooltip>
            </CardTitle>
            <p className="text-xs text-slate-500 mt-2">
              Analysis of how your brand appears in AI responses - showing the different ways it's positioned and described.
            </p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Portrayal Type</TableHead>
                  <TableHead>Count</TableHead>
                  <TableHead>Percentage</TableHead>
                  <TableHead>Example Snippet</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {portrayalData.map((row, index) => {
                  const typeInfo = getPortrayalTypeInfo(row.type || '')
                  return (
                    <TableRow key={index}>
                      <TableCell>
                        <Tooltip>
                          <TooltipTrigger>
                            <span className="font-medium cursor-help">{typeInfo.label}</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{typeInfo.description}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell>{row.count || 0}</TableCell>
                      <TableCell>{row.percentage || 0}%</TableCell>
                      <TableCell className="text-xs text-slate-600 italic max-w-xs">
                        {row.example || 'No example available'}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        </div>

        {/* Brand Domain Citations */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  Brand Website Citations
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-4 w-4 text-slate-400" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>When AI models cite your brand's own website URLs in their responses.</p>
                    </TooltipContent>
                  </Tooltip>
                </CardTitle>
                <p className="text-xs text-slate-500 mt-2">
                  URLs from your website that AI models reference when discussing your brand.
                </p>
              </div>
              {brandCitationsData && brandCitationsData.totalCitations > 0 && (
                <div className="text-sm text-slate-600">
                  <span className="font-semibold">{brandCitationsData.totalMentions}</span> total mentions across{' '}
                  <span className="font-semibold">{brandCitationsData.totalCitations}</span> URLs
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <BrandDomainCitationsTable
              citations={brandCitationsData?.citations || []}
              isLoading={isBrandCitationsLoading}
            />
          </CardContent>
        </Card>
          </>
        )}
      </div>
    </TooltipProvider>
  )
} 