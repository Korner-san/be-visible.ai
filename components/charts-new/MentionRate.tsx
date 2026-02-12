'use client'

import React, { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

interface MentionRateProps {
  value?: number;
}

export const MentionRate: React.FC<MentionRateProps> = ({ value = 55 }) => {
  const [fillColor, setFillColor] = useState('#d5002b');

  const palette = [
    { pct: 0, color: '#45143f' },
    { pct: 25, color: '#8c0b31' },
    { pct: 50, color: '#d5002b' },
    { pct: 75, color: '#ff5925' },
    { pct: 100, color: '#ffbd00' }
  ];

  const hexToRgb = (hex: string) => {
    const bigint = parseInt(hex.slice(1), 16);
    return {
      r: (bigint >> 16) & 255,
      g: (bigint >> 8) & 255,
      b: bigint & 255
    };
  };

  useEffect(() => {
    const getColor = (v: number) => {
      let lower = palette[0];
      let upper = palette[palette.length - 1];

      for (let i = 0; i < palette.length - 1; i++) {
        if (v >= palette[i].pct && v <= palette[i + 1].pct) {
          lower = palette[i];
          upper = palette[i + 1];
          break;
        }
      }

      if (lower.pct === upper.pct) return lower.color;

      const range = upper.pct - lower.pct;
      const progress = (v - lower.pct) / range;

      const lowerRgb = hexToRgb(lower.color);
      const upperRgb = hexToRgb(upper.color);

      const r = Math.round(lowerRgb.r + (upperRgb.r - lowerRgb.r) * progress);
      const g = Math.round(lowerRgb.g + (upperRgb.g - lowerRgb.g) * progress);
      const b = Math.round(lowerRgb.b + (upperRgb.b - lowerRgb.b) * progress);

      return `rgb(${r}, ${g}, ${b})`;
    };

    setFillColor(getColor(value));
  }, [value]);

  const data = [
    { name: 'Mentioned', value: value },
    { name: 'Remaining', value: 100 - value },
  ];

  return (
    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm h-full flex flex-col">
      <div className="mb-4">
        <h3 className="text-[15px] font-bold text-gray-400 tracking-wide">Mention rate</h3>
        <p className="text-[11px] text-slate-500 mt-0.5 font-medium">Frequency of brand appearance</p>
      </div>

      <div className="flex-1 relative w-full min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius="70%"
              outerRadius="90%"
              startAngle={90}
              endAngle={-270}
              dataKey="value"
              stroke="none"
              cornerRadius={12}
              paddingAngle={4}
            >
              {data.map((entry, index) => {
                if (index === 0) {
                   return <Cell key={`cell-${index}`} fill={fillColor} className="transition-all duration-300" />;
                }
                return <Cell key={`cell-${index}`} fill="#f1f5f9" />;
              })}
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        {/* Center Label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none space-y-0.5">
          <span className="text-4xl font-black transition-colors duration-300" style={{ color: fillColor }}>
            {value}%
          </span>
          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Rate</span>
        </div>
      </div>
    </div>
  );
};
