"use client"

import { LineChart, Line, XAxis, YAxis, ResponsiveContainer } from "recharts"

const data = [
  { date: "Jun 18", current: 12.1, previous: 12.3 },
  { date: "Jun 19", current: 12.3, previous: 12.4 },
  { date: "Jun 20", current: 12.5, previous: 12.2 },
  { date: "Jun 21", current: 12.4, previous: 12.1 },
  { date: "Jun 22", current: 12.2, previous: 11.9 },
  { date: "Jun 23", current: 12.0, previous: 11.8 },
  { date: "Jun 24", current: 12.2, previous: 11.7 },
]

export function VisibilityChart() {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#6B7280" }} />
          <YAxis
            domain={[10.5, 14.5]}
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 12, fill: "#6B7280" }}
            tickFormatter={(value) => `${value}%`}
          />
          <Line
            type="monotone"
            dataKey="current"
            stroke="#3B82F6"
            strokeWidth={2}
            dot={{ fill: "#3B82F6", strokeWidth: 2, r: 4 }}
            activeDot={{ r: 6, fill: "#3B82F6" }}
          />
          <Line type="monotone" dataKey="previous" stroke="#D1D5DB" strokeWidth={2} strokeDasharray="5 5" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
