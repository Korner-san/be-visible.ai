
import React, { useState } from 'react';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { TrendDataPoint } from '../../types';
import { HelpCircle, Loader2 } from 'lucide-react';

const mockData: TrendDataPoint[] = [
  { date: 'Dec 10', score: 72 },
  { date: 'Dec 12', score: 68 },
  { date: 'Dec 14', score: 70 },
  { date: 'Dec 16', score: 75 },
  { date: 'Dec 18', score: 78 },
  { date: 'Dec 20', score: 76 },
  { date: 'Dec 22', score: 80 },
  { date: 'Dec 24', score: 82 },
  { date: 'Dec 26', score: 85 },
  { date: 'Dec 28', score: 88 },
  { date: 'Dec 30', score: 91 },
  { date: 'Jan 01', score: 92 },
  { date: 'Jan 03', score: 94 },
];

interface VisibilityTrendProps {
  data?: TrendDataPoint[];
  currentScore?: number;
  trendPercent?: number;
  isLoading?: boolean;
}

export const VisibilityTrend: React.FC<VisibilityTrendProps> = ({ data: propData, currentScore, trendPercent, isLoading }) => {
  const data = propData && propData.length > 0 ? propData : mockData;
  const score = currentScore ?? 94;
  const [percentage, setPercentage] = useState(81.6);
  const displayPercent = trendPercent ?? percentage;
  const brandBrown = '#2C1308';

  const stops = [
    { r: 32,  g: 19,  b: 16  }, 
    { r: 41,  g: 26,  b: 19  }, 
    { r: 56,  g: 33,  b: 24  }, 
    { r: 77,  g: 40,  b: 26  }, 
    { r: 135, g: 75,  b: 52  }  
  ];

  const getTicks = (dataset: TrendDataPoint[], count: number) => {
    if (dataset.length === 0) return [];
    const result = [];
    const step = (dataset.length - 1) / (count - 1);
    for (let i = 0; i < count; i++) {
      const index = Math.round(i * step);
      if (dataset[index]) {
        result.push(dataset[index].date);
      }
    }
    return [...new Set(result)];
  };

  const ticks = getTicks(data, 7);

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

  const dynamicColor = getDynamicColor(displayPercent);
  const dynamicBg = dynamicColor.replace('rgb', 'rgba').replace(')', ', 0.15)');
  const dynamicBorder = dynamicColor.replace('rgb', 'rgba').replace(')', ', 0.3)');

  // Dynamic Y-axis domain based on actual data
  const scores = data.map(d => d.score);
  const minScore = Math.min(...scores);
  const yMin = Math.max(0, Math.floor((minScore - 10) / 10) * 10);

  if (isLoading) {
    return (
      <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm h-full flex flex-col items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
        <span className="text-xs text-gray-400 mt-2">Loading visibility data...</span>
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
             {Math.round(score)}
           </div>
           <div
             className="text-[8px] font-black px-1.5 py-0.5 rounded-full inline-flex border transition-all duration-500 tracking-tight mt-1"
             style={{
               color: dynamicColor,
               backgroundColor: dynamicBg,
               borderColor: dynamicBorder
             }}
           >
             {displayPercent >= 0 ? '↗' : '↘'} {displayPercent >= 0 ? '+' : ''}{displayPercent.toFixed(1)}%
           </div>
        </div>
      </div>

      <div className="flex-1 w-full min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 5, left: -30, bottom: 0 }}>
            <defs>
              <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={dynamicColor} stopOpacity={0.2}/>
                <stop offset="95%" stopColor={dynamicColor} stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis 
              dataKey="date" 
              tick={{ fontSize: 9, fill: '#94a3b8', fontWeight: 600 }} 
              axisLine={false}
              tickLine={false}
              tickMargin={10}
              ticks={ticks}
            />
            <YAxis
              domain={[yMin, 100]}
              tick={{ fontSize: 9, fill: '#94a3b8', fontWeight: 600 }} 
              axisLine={false}
              tickLine={false}
            />
            <Tooltip 
              contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', padding: '8px', fontSize: '11px' }}
              itemStyle={{ color: dynamicColor, fontWeight: 800 }}
              cursor={{ stroke: dynamicColor, strokeWidth: 1, strokeDasharray: '4 4' }}
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

      <div className="mt-4 pt-3 border-t border-gray-50 flex items-center justify-between">
         {!propData ? (
           <div className="flex items-center gap-2 bg-gray-50 px-2 py-1 rounded-lg border border-gray-100">
             <span className="text-[8px] font-bold text-gray-400">Simulation engine</span>
             <input
               type="range"
               min="0"
               max="100"
               step="0.1"
               value={percentage}
               onChange={(e) => setPercentage(Number(e.target.value))}
               className="w-12 h-0.5 bg-gray-200 rounded-lg appearance-none cursor-pointer"
               style={{ accentColor: dynamicColor }}
             />
           </div>
         ) : (
           <span className="text-[8px] font-bold text-green-500 bg-green-50 px-2 py-1 rounded-lg border border-green-100">LIVE DATA</span>
         )}
         <button className="text-[9px] font-bold text-gray-400 tracking-widest hover:text-brand-brown transition-colors">
           Download raw logs
         </button>
      </div>
    </div>
  );
};
