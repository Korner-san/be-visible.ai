
import React, { useState } from 'react';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, ReferenceLine } from 'recharts';
import { TrendDataPoint } from '../../types';
import { HelpCircle, Loader2, TrendingUp, TrendingDown, Download, Sparkles } from 'lucide-react';

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
  brandId?: string | null;
  brandName?: string;
}

export const VisibilityTrend: React.FC<VisibilityTrendProps> = ({ data: propData, currentScore, trendPercent, isLoading, brandId, brandName }) => {
  const hasRealData = propData && propData.length > 0;
  const data = hasRealData ? propData! : (brandId ? [] : mockData);
  const score = currentScore ?? (brandId ? 0 : 94);
  const [percentage, setPercentage] = useState(81.6);
  const displayPercent = trendPercent ?? percentage;

  // Color palette: navy → indigo → violet → orange
  const stops = [
    { r: 30,  g: 27,  b: 75  },
    { r: 99,  g: 102, b: 241 },
    { r: 168, g: 85,  b: 247 },
    { r: 249, g: 115, b: 22  },
  ];

  const getTicks = (dataset: TrendDataPoint[], count: number) => {
    if (dataset.length === 0) return [];
    const result = [];
    const step = (dataset.length - 1) / (count - 1);
    for (let i = 0; i < count; i++) {
      const index = Math.round(i * step);
      if (dataset[index]) result.push(dataset[index].date);
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
  const dynamicFill = dynamicColor.replace('rgb', 'rgba').replace(')', ', 0.18)');

  const scores = data.map(d => d.score);
  const minScore = scores.length > 0 ? Math.min(...scores) : 0;
  const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const yMin = Math.max(0, Math.floor((minScore - 10) / 10) * 10);

  if (isLoading) {
    return (
      <div className="bg-white h-full flex flex-col items-center justify-center rounded-2xl shadow-card" style={{ border: '1px solid #e8edf4' }}>
        <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
        <span className="text-xs text-slate-400 mt-2">Loading visibility data…</span>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl h-full flex flex-col shadow-card hover:shadow-elevated transition-smooth" style={{ border: '1px solid #e8edf4', padding: '20px 20px 16px' }}>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="text-[15px] font-semibold text-slate-800 leading-tight">Visibility index over time</h3>
            <span className="relative group cursor-help">
              <HelpCircle size={13} className="text-slate-300 group-hover:text-slate-400 transition-smooth" />
              <div className="absolute left-0 top-full mt-2 hidden group-hover:block w-56 p-3 bg-slate-900 text-white text-[10px] rounded-xl shadow-elevated z-50 pointer-events-none leading-relaxed" style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
                How visible your brand is relative to other entities in AI answers. Combines whether you were mentioned and where you ranked.
              </div>
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">Percentile rank among all entities in AI responses</p>
        </div>

        {/* Mini stat boxes */}
        <div className="flex items-stretch gap-2 shrink-0">
          {data.length > 0 && (
            <div className="stat-box text-right">
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">Avg</div>
              <div className="text-sm font-bold text-slate-800 tabular-nums">{avgScore}</div>
            </div>
          )}
          <div className="stat-box-primary text-right">
            <div className="text-[10px] uppercase tracking-wider font-medium" style={{ color: 'rgba(255,255,255,0.65)' }}>Current</div>
            <div className="flex items-center gap-1 justify-end">
              <span className="text-sm font-bold tabular-nums text-white">{score.toFixed(1)}</span>
              {displayPercent !== 0 && (
                <span className="inline-flex items-center text-[10px] font-semibold" style={{ color: 'rgba(255,255,255,0.8)' }}>
                  {displayPercent >= 0 ? <TrendingUp size={10} className="mr-0.5" /> : <TrendingDown size={10} className="mr-0.5" />}
                  {displayPercent >= 0 ? '+' : ''}{displayPercent.toFixed(1)}%
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 w-full min-h-0 -mx-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 6, right: 8, left: -28, bottom: 0 }}>
            <defs>
              <linearGradient id="colorScoreVT" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={dynamicColor} stopOpacity={0.28}/>
                <stop offset="100%" stopColor={dynamicColor} stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f3f8" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 500 }}
              axisLine={false} tickLine={false} tickMargin={10}
              ticks={ticks}
            />
            <YAxis
              domain={[yMin, 100]}
              tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 500 }}
              axisLine={false} tickLine={false}
            />
            {data.length > 0 && avgScore > 0 && (
              <ReferenceLine
                y={avgScore}
                stroke="#94a3b8"
                strokeDasharray="4 4"
                strokeOpacity={0.5}
                label={{ value: `avg ${avgScore}`, position: 'right', fill: '#94a3b8', fontSize: 10 }}
              />
            )}
            <Tooltip
              content={({ active, payload, label }: any) => {
                if (!active || !payload?.length) return null;
                return (
                  <div style={{ background: 'white', borderRadius: '12px', padding: '8px 12px', boxShadow: 'var(--shadow-elevated)', fontSize: '11px', border: '1px solid #e8edf4' }}>
                    <p style={{ color: '#94a3b8', fontWeight: 600, marginBottom: '3px', fontSize: '10px' }}>{label}</p>
                    <p style={{ color: dynamicColor, fontWeight: 700 }}>{brandName || 'Brand'}: <span style={{ fontSize: '13px' }}>{payload[0].value}%</span></p>
                  </div>
                );
              }}
              cursor={{ stroke: dynamicColor, strokeWidth: 1, strokeDasharray: '4 4' }}
            />
            <Area
              type="monotone"
              dataKey="score"
              stroke={dynamicColor}
              strokeWidth={2.5}
              fillOpacity={1}
              fill="url(#colorScoreVT)"
              activeDot={{ r: 5, fill: dynamicColor, stroke: 'white', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Footer */}
      <div className="mt-3 pt-3 flex items-center justify-between" style={{ borderTop: '1px solid #f1f3f8' }}>
        <div className="flex items-center gap-3">
          {hasRealData ? (
            <span className="badge-live">
              <span className="pulse-dot"></span>
              Live Data
            </span>
          ) : (
            <div className="flex items-center gap-2 bg-slate-50 px-2.5 py-1 rounded-lg" style={{ border: '1px solid #e8edf4' }}>
              <span className="text-[10px] font-semibold text-slate-400">Simulation</span>
              <input
                type="range"
                min="0" max="100" step="0.1"
                value={percentage}
                onChange={(e) => setPercentage(Number(e.target.value))}
                className="w-12 h-0.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                style={{ accentColor: dynamicColor }}
              />
            </div>
          )}
          {hasRealData && (
            <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] text-slate-400">
              <Sparkles size={11} className="text-brand-indigo" />
              Live data
            </span>
          )}
        </div>
        <button className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-brand-brown transition-smooth">
          <Download size={13} />
          Download raw logs
        </button>
      </div>
    </div>
  );
};
