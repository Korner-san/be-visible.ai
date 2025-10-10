'use client'

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"

interface PositionScoreData {
  date: string
  score: number // 0-1, weighted average
  responsesCount: number
  weightedSample: number // sum of weights
}

interface PositionScoreOverTimeProps {
  data: PositionScoreData[]
  isLoading?: boolean
}

export const PositionScoreOverTime: React.FC<PositionScoreOverTimeProps> = ({ data, isLoading }) => {
  if (isLoading) {
    return (
      <Card className="col-span-3">
        <CardHeader>
          <CardTitle className="text-lg font-medium">Competitive Position Score (Daily, Weighted)</CardTitle>
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
      <Card className="col-span-3">
        <CardHeader>
          <CardTitle className="text-lg font-medium">Competitive Position Score (Daily, Weighted)</CardTitle>
          <p className="text-xs text-slate-500">Brand performance when mentioned with competitors</p>
        </CardHeader>
        <CardContent>
          <div className="h-80 flex items-center justify-center">
            <div className="text-center text-slate-500">
              <p className="text-sm">No competitive position data available</p>
              <p className="text-xs mt-1">for selected models in the selected date range</p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="col-span-3">
      <CardHeader>
        <CardTitle className="text-lg font-medium">Competitive Position Score (Daily, Weighted)</CardTitle>
        <p className="text-xs text-slate-500">
          Weighted average of brand position (1.0 = earliest mention, 0.0 = latest). 
          Responses with more competitors have higher influence.
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
                domain={[0, 1]}
                ticks={[0, 0.25, 0.5, 0.75, 1.0]}
                tickFormatter={(value) => value.toFixed(2)}
                label={{ value: 'Position Score (0-1)', angle: -90, position: 'insideLeft' }}
              />
              <Tooltip
                labelFormatter={(value) => new Date(value).toLocaleDateString()}
                content={({ active, payload }) => {
                  if (!active || !payload || payload.length === 0) return null
                  const data = payload[0].payload as PositionScoreData

                  return (
                    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-xs">
                      <div className="font-semibold mb-2">{new Date(data.date).toLocaleDateString()}</div>
                      <div className="space-y-1">
                        <div><span className="font-medium">Position Score:</span> {data.score.toFixed(3)}</div>
                        <div><span className="font-medium">Responses:</span> {data.responsesCount}</div>
                        <div><span className="font-medium">Weighted Sample:</span> {data.weightedSample.toFixed(1)}</div>
                        <div className="text-slate-500 mt-2 text-[10px]">
                          Higher weight = more competitors present
                        </div>
                      </div>
                    </div>
                  )
                }}
              />
              <Line
                type="monotone"
                dataKey="score"
                stroke="#3b82f6"
                strokeWidth={3}
                dot={{ fill: '#3b82f6', strokeWidth: 2, r: 5 }}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}

