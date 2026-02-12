'use client'

import React from 'react';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { HelpCircle } from 'lucide-react';

interface TrendDataPoint {
  date: string;
  score: number;
}

interface VisibilityTrendProps {
  data?: TrendDataPoint[];
  currentScore?: number;
  trend?: string;
}

export const VisibilityTrend: React.FC<VisibilityTrendProps> = ({ data, currentScore, trend }) => {
  const chartData = data && data.length > 0 ? data : [];
  const displayScore = currentScore ?? (chartData.length > 0 ? chartData[chartData.length - 1].score : 0);

  // Calculate percentage change
  const percentage = chartData.length >= 2
    ? ((chartData[chartData.length - 1].score - chartData[0].score) / Math.max(chartData[0].score, 1)) * 100
    : 0;

  const stops = [
    { r: 32,  g: 19,  b: 16  },
    { r: 41,  g: 26,  b: 19  },
    { r: 56,  g: 33,  b: 24  },
    { r: 77,  g: 40,  b: 26  },
    { r: 135, g: 75,  b: 52  }
  ];

  const getTicks = (dataset: TrendDataPoint[], count: number) => {
    if (dataset.length === 0) return [];
    const result: string[] = [];
    const step = (dataset.length - 1) / (count - 1);
    for (let i = 0; i < count; i++) {
      const index = Math.round(i * step);
      if (dataset[index]) {
        result.push(dataset[index].date);
      }
    }
    return [...new Set(result)];
  };

  const ticks = getTicks(chartData, 7);

  const getDynamicColor = (value: number) => {
    const t = Math.max(0, Math.min(1, value / 100));
    const scaledT = t * (stops.length - 1);
    const index = Math.floor(scaledT);
    const fraction = scaledT - index;

    if (index >= stops.length - 1) {
      const s = stops[stops.length - 1];
      return `rgb(${s.r}, ${s.g}, ${s.b})`;
    }

    const start = stops[index];
    const end = stops[index + 1];

    const r = Math.round(start.r + (end.r - start.r) * fraction);
    const g = Math.round(start.g + (end.g - start.g) * fraction);
    const b = Math.round(start.b + (end.b - start.b) * fraction);

    return `rgb(${r}, ${g}, ${b})`;
  };

  const dynamicColor = getDynamicColor(displayScore);
  const dynamicBg = dynamicColor.replace('rgb', 'rgba').replace(')', ', 0.15)');
  const dynamicBorder = dynamicColor.replace('rgb', 'rgba').replace(')', ', 0.3)');

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Format chart data dates for display
  const formattedData = chartData.map(d => ({
    ...d,
    displayDate: formatDate(d.date),
  }));

  if (chartData.length === 0) {
    return (
      <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm h-full flex flex-col">
        <div className="space-y-1 mb-4">
          <h3 className="text-[15px] font-bold text-gray-400 tracking-wide flex items-center gap-2">
            Visibility score over time
            <HelpCircle size={14} className="text-gray-300" />
          </h3>
          <p className="text-[11px] text-slate-500 font-medium mt-0.5">Total Score based on weighted metrics</p>
        </div>
        <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
          No visibility score data available yet
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm h-full flex flex-col">
      <div className="flex items-start justify-between mb-4">
        <div className="space-y-1">
          <h3 className="text-[15px] font-bold text-gray-400 tracking-wide flex items-center gap-2">
            Visibility score over time
            <HelpCircle size={14} className="text-gray-300" />
          </h3>
          <p className="text-[11px] text-slate-500 font-medium mt-0.5">Total Score based on weighted metrics</p>
        </div>

        <div className="text-right">
           <div className="text-2xl font-black transition-colors duration-500" style={{ color: dynamicColor }}>
             {Math.round(displayScore)}
           </div>
           <div
             className="text-[8px] font-black px-1.5 py-0.5 rounded-full inline-flex border transition-all duration-500 tracking-tight mt-1"
             style={{
               color: dynamicColor,
               backgroundColor: dynamicBg,
               borderColor: dynamicBorder
             }}
           >
             {percentage >= 0 ? '\u2197' : '\u2198'} {percentage >= 0 ? '+' : ''}{percentage.toFixed(1)}%
           </div>
        </div>
      </div>

      <div className="flex-1 w-full min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={formattedData} margin={{ top: 5, right: 5, left: -30, bottom: 0 }}>
            <defs>
              <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={dynamicColor} stopOpacity={0.2}/>
                <stop offset="95%" stopColor={dynamicColor} stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis
              dataKey="displayDate"
              tick={{ fontSize: 9, fill: '#94a3b8', fontWeight: 600 }}
              axisLine={false}
              tickLine={false}
              tickMargin={10}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 9, fill: '#94a3b8', fontWeight: 600 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', padding: '8px', fontSize: '11px' }}
              itemStyle={{ color: dynamicColor, fontWeight: 800 }}
              cursor={{ stroke: dynamicColor, strokeWidth: 1, strokeDasharray: '4 4' }}
              labelFormatter={(label) => label}
              formatter={(value: any) => [`${value}/100`, 'Score']}
            />
            <Area
              type="linear"
              dataKey="score"
              stroke={dynamicColor}
              strokeWidth={2.5}
              fillOpacity={1}
              fill="url(#colorScore)"
              className="transition-all duration-500"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
