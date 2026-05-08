
import React, { useState, useEffect } from 'react';
import { Loader2, MessageSquare, TrendingUp, TrendingDown } from 'lucide-react';

interface MentionRateProps {
  value?: number;
  trend?: number | null;
  timePeriodLabel?: string;
  isLoading?: boolean;
  brandId?: string | null;
}

export const MentionRate: React.FC<MentionRateProps> = ({ value: propValue, trend, timePeriodLabel, isLoading, brandId }) => {
  const [demoValue, setDemoValue] = useState(55);
  const displayValue = propValue ?? (brandId ? 0 : demoValue);

  // Color palette: navy → indigo → violet → orange
  const palette = [
    { pct: 0,   r: 30,  g: 27,  b: 75  },
    { pct: 33,  r: 99,  g: 102, b: 241 },
    { pct: 66,  r: 168, g: 85,  b: 247 },
    { pct: 100, r: 249, g: 115, b: 22  },
  ];

  const getColor = (value: number) => {
    let lower = palette[0];
    let upper = palette[palette.length - 1];
    for (let i = 0; i < palette.length - 1; i++) {
      if (value >= palette[i].pct && value <= palette[i + 1].pct) {
        lower = palette[i];
        upper = palette[i + 1];
        break;
      }
    }
    if (lower.pct === upper.pct) return `rgb(${lower.r}, ${lower.g}, ${lower.b})`;
    const t = (value - lower.pct) / (upper.pct - lower.pct);
    const r = Math.round(lower.r + (upper.r - lower.r) * t);
    const g = Math.round(lower.g + (upper.g - lower.g) * t);
    const b = Math.round(lower.b + (upper.b - lower.b) * t);
    return `rgb(${r}, ${g}, ${b})`;
  };

  const fillColor = getColor(displayValue);
  const fillColorSoft = fillColor.replace('rgb', 'rgba').replace(')', ', 0.12)');

  // SVG circle progress
  const radius = 62;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (displayValue / 100) * circumference;

  if (isLoading) {
    return (
      <div className="bg-white h-full flex flex-col items-center justify-center rounded-2xl shadow-card" style={{ border: '1px solid #e8edf4' }}>
        <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
        <span className="text-xs text-slate-400 mt-2">Loading mention data…</span>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl h-full flex flex-col shadow-card hover:shadow-elevated transition-smooth" style={{ border: '1px solid #e8edf4', padding: '20px' }}>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-[15px] font-semibold text-slate-800 leading-tight">Mention rate</h3>
          <p className="text-xs text-slate-400 mt-0.5">Frequency of brand appearance</p>
        </div>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: fillColorSoft }}>
          <MessageSquare size={16} style={{ color: fillColor }} />
        </div>
      </div>

      {/* SVG Circle Progress */}
      <div className="flex items-center justify-center flex-1 py-1">
        <div className="relative w-44 h-44">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 160 160">
            {/* Track */}
            <circle
              cx="80" cy="80" r={radius}
              fill="none"
              stroke="#f1f5f9"
              strokeWidth="14"
            />
            {/* Progress arc */}
            <circle
              cx="80" cy="80" r={radius}
              fill="none"
              stroke="url(#mentionGradient)"
              strokeWidth="14"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(0.4, 0, 0.2, 1)' }}
            />
            <defs>
              <linearGradient id="mentionGradient" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor={fillColor} />
                <stop offset="100%" stopColor={fillColor.replace('rgb', 'rgba').replace(')', ', 0.6)')} />
              </linearGradient>
            </defs>
          </svg>
          {/* Center text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-3xl font-bold tabular-nums leading-none" style={{ color: fillColor }}>
              {Number(displayValue).toFixed(1)}<span className="text-xl text-slate-400">%</span>
            </div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400 mt-1 font-semibold">Rate</div>
          </div>
        </div>
      </div>

      {/* Mini stat comparison */}
      <div className="grid grid-cols-2 gap-2 mt-1">
        <div className="stat-box">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">Current</div>
          <div className="text-sm font-bold text-slate-800 tabular-nums">{Number(displayValue).toFixed(1)}%</div>
        </div>
        <div className="stat-box">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">Prev period</div>
          <div className="text-sm font-bold text-slate-800 tabular-nums">
            {trend != null ? `${(displayValue - trend).toFixed(1)}%` : '—'}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-3 pt-3" style={{ borderTop: '1px solid #f1f3f8' }}>
        {propValue !== undefined ? (
          <span className="badge-live">
            <span className="pulse-dot"></span>
            Live Data
          </span>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold text-slate-400 uppercase">Demo</span>
            <input
              type="range"
              min="0" max="100"
              value={demoValue}
              onChange={(e) => setDemoValue(Number(e.target.value))}
              className="w-20 h-0.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
              style={{ accentColor: fillColor }}
            />
          </div>
        )}
        {trend != null && (
          <span className={trend > 0 ? 'trend-up' : trend < 0 ? 'trend-down' : 'trend-flat'}>
            {trend > 0 ? <TrendingUp size={11} /> : trend < 0 ? <TrendingDown size={11} /> : '→'}
            {trend > 0 ? '+' : ''}{trend.toFixed(1)}%
            <span className="opacity-60 ml-0.5 text-[10px]">{timePeriodLabel || 'vs prev'}</span>
          </span>
        )}
      </div>
    </div>
  );
};
