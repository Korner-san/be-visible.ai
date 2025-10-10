'use client'

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts"

interface CoverageData {
  date: string
  brandCoverage: number // 0-100%
  brandCovered: number
  totalResponses: number
  competitors?: Array<{
    name: string
    coverage: number
    covered: number
  }>
}

interface CoverageScoreOverTimeProps {
  data: CoverageData[]
  showCompetitors?: boolean
  isLoading?: boolean
}

export const CoverageScoreOverTime: React.FC<CoverageScoreOverTimeProps> = ({ 
  data, 
  showCompetitors = true,
  isLoading 
}) => {
  if (isLoading) {
    return (
      <Card className="col-span-4">
        <CardHeader>
          <CardTitle className="text-lg font-medium">Coverage Over Time (Brand vs Competitors)</CardTitle>
          <p className="text-xs text-slate-500">Loading...</p>
        </CardHeader>
        <CardContent>
          <div className="h-80 flex items-center justify-center">
            <div className="text-slate-400">Loading chart data...</div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!data || data.length === 0) {
    return (
      <Card className="col-span-4">
        <CardHeader>
          <CardTitle className="text-lg font-medium">Coverage Over Time (Brand vs Competitors)</CardTitle>
          <p className="text-xs text-slate-500">How often brand and competitors appear in AI responses</p>
        </CardHeader>
        <CardContent>
          <div className="h-80 flex items-center justify-center">
            <div className="text-center text-slate-500">
              <p className="text-sm">No coverage data available</p>
              <p className="text-xs mt-1">for selected models in the selected date range</p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Get top 3 competitors by average coverage
  const competitorNames = new Set<string>()
  data.forEach(day => {
    day.competitors?.forEach(comp => competitorNames.add(comp.name))
  })

  const competitorAvgCoverage = Array.from(competitorNames).map(name => {
    const totalCoverage = data.reduce((sum, day) => {
      const comp = day.competitors?.find(c => c.name === name)
      return sum + (comp?.coverage || 0)
    }, 0)
    return { name, avg: totalCoverage / data.length }
  })

  const top3Competitors = competitorAvgCoverage
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 3)
    .map(c => c.name)

  const colors = {
    brand: '#3b82f6',
    comp1: '#ef4444',
    comp2: '#10b981',
    comp3: '#f59e0b'
  }

  return (
    <Card className="col-span-4">
      <CardHeader>
        <CardTitle className="text-lg font-medium">Coverage Over Time (Brand vs Competitors)</CardTitle>
        <p className="text-xs text-slate-500">
          % of AI responses mentioning each entity (max 3 competitors shown)
        </p>
      </CardHeader>
      <CardContent>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 20, right: 20, left: 20, bottom: 5 }}>
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
                domain={[0, 100]}
                tickFormatter={(value) => `${value}%`}
                label={{ value: 'Coverage %', angle: -90, position: 'insideLeft' }}
              />
              <Tooltip
                labelFormatter={(value) => new Date(value).toLocaleDateString()}
                content={({ active, payload }) => {
                  if (!active || !payload || payload.length === 0) return null
                  const data = payload[0].payload as CoverageData

                  return (
                    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-xs">
                      <div className="font-semibold mb-2">{new Date(data.date).toLocaleDateString()}</div>
                      <div className="space-y-1">
                        <div className="font-medium text-blue-600">
                          Brand: {data.brandCoverage.toFixed(1)}%
                        </div>
                        <div className="text-slate-500 text-[10px]">
                          ({data.brandCovered}/{data.totalResponses} responses)
                        </div>
                        {data.competitors && data.competitors.length > 0 && (
                          <>
                            <div className="border-t border-slate-200 my-1"></div>
                            {data.competitors.slice(0, 3).map((comp, idx) => (
                              <div key={comp.name}>
                                <div style={{ color: Object.values(colors)[idx + 1] }}>
                                  {comp.name}: {comp.coverage.toFixed(1)}%
                                </div>
                                <div className="text-slate-500 text-[10px]">
                                  ({comp.covered}/{data.totalResponses} responses)
                                </div>
                              </div>
                            ))}
                          </>
                        )}
                      </div>
                    </div>
                  )
                }}
              />
              <Legend />
              
              {/* Brand line */}
              <Line
                type="monotone"
                dataKey="brandCoverage"
                name="Brand"
                stroke={colors.brand}
                strokeWidth={3}
                dot={{ fill: colors.brand, strokeWidth: 2, r: 5 }}
              />
              
              {/* Top 3 competitors */}
              {showCompetitors && top3Competitors.map((compName, idx) => (
                <Line
                  key={compName}
                  type="monotone"
                  dataKey={(day: CoverageData) => {
                    const comp = day.competitors?.find(c => c.name === compName)
                    return comp?.coverage || null
                  }}
                  name={compName}
                  stroke={Object.values(colors)[idx + 1]}
                  strokeWidth={2}
                  dot={{ fill: Object.values(colors)[idx + 1], strokeWidth: 2, r: 4 }}
                  connectNulls={true}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}

