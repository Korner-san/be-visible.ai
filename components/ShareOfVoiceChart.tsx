'use client'

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts"
import { Loader2 } from "lucide-react"

interface ShareOfVoiceData {
  entity: string
  responseCount: number
  percentage: number
  isBrand: boolean
}

interface ShareOfVoiceChartProps {
  data: ShareOfVoiceData[]
  totalResponses: number
  isLoading?: boolean
}

export const ShareOfVoiceChart: React.FC<ShareOfVoiceChartProps> = ({ 
  data, 
  totalResponses,
  isLoading 
}) => {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Share of Voice: Your Brand vs Competitors</CardTitle>
          <p className="text-xs text-slate-500">Loading competitive visibility data...</p>
        </CardHeader>
        <CardContent>
          <div className="h-80 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Share of Voice: Your Brand vs Competitors</CardTitle>
          <p className="text-xs text-slate-500">How often your brand appears compared to the competitors you selected</p>
        </CardHeader>
        <CardContent>
          <div className="h-80 flex items-center justify-center text-slate-500">
            <div className="text-center">
              <p className="text-sm">No competitive data available yet</p>
              <p className="text-xs mt-1">Generate reports to see how your brand compares to competitors</p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Share of Voice: Your Brand vs Competitors</CardTitle>
        <p className="text-xs text-slate-500">
          How often your brand appears compared to the competitors you selected. Each bar shows how many AI responses mentioned that brand. Higher percentages mean stronger visibility in the AI conversation.
        </p>
      </CardHeader>
      <CardContent>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart 
              data={data} 
              layout="vertical"
              margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis 
                type="number" 
                stroke="#64748b"
                fontSize={12}
                label={{ value: 'Response Count', position: 'insideBottom', offset: -5 }}
              />
              <YAxis 
                type="category" 
                dataKey="entity" 
                stroke="#64748b"
                fontSize={12}
                width={90}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  fontSize: '12px'
                }}
                formatter={(value: any, name: any, props: any) => {
                  const percentage = props.payload.percentage
                  return [`${value} responses (${percentage}%)`, 'Count']
                }}
              />
              <Bar dataKey="responseCount" radius={[0, 4, 4, 0]}>
                {data.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={entry.isBrand ? '#3b82f6' : '#94a3b8'} 
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        
        {/* Legend */}
        <div className="mt-4 flex items-center justify-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-blue-500 rounded"></div>
            <span className="text-slate-600">Your Brand</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-slate-400 rounded"></div>
            <span className="text-slate-600">Competitors</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

