
import React, { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

export const MentionRate: React.FC = () => {
  const [mentionValue, setMentionValue] = useState(55);
  const [fillColor, setFillColor] = useState('#d5002b');

  // Palette from image: Purple (Darkest) -> Maroon -> Red -> Orange -> Yellow (Brightest)
  const palette = [
    { pct: 0, color: '#45143f' },   // Deep Purple
    { pct: 25, color: '#8c0b31' },  // Maroon
    { pct: 50, color: '#d5002b' },  // Red
    { pct: 75, color: '#ff5925' },  // Orange
    { pct: 100, color: '#ffbd00' }  // Yellow
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

      if (lower.pct === upper.pct) return lower.color;

      const range = upper.pct - lower.pct;
      const progress = (value - lower.pct) / range;
      
      const lowerRgb = hexToRgb(lower.color);
      const upperRgb = hexToRgb(upper.color);
      
      const r = Math.round(lowerRgb.r + (upperRgb.r - lowerRgb.r) * progress);
      const g = Math.round(lowerRgb.g + (upperRgb.g - lowerRgb.g) * progress);
      const b = Math.round(lowerRgb.b + (upperRgb.b - lowerRgb.b) * progress);
      
      return `rgb(${r}, ${g}, ${b})`;
    };

    setFillColor(getColor(mentionValue));
  }, [mentionValue]);

  const data = [
    { name: 'Mentioned', value: mentionValue },
    { name: 'Remaining', value: 100 - mentionValue },
  ];

  return (
    <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm h-full flex flex-col">
      <div className="mb-4">
        <h3 className="text-[15px] font-black text-gray-400 tracking-wide">Mention rate</h3>
        <p className="text-[11px] text-slate-500 mt-0.5 font-medium">Frequency of brand appearace</p>
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
            {mentionValue}%
          </span>
          <span className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Rate</span>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-gray-100 flex items-center gap-4">
         <span className="text-[10px] font-black text-gray-400 uppercase w-8">Test</span>
         <input 
           type="range" 
           min="0" 
           max="100" 
           value={mentionValue} 
           onChange={(e) => setMentionValue(Number(e.target.value))}
           className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer"
           style={{ accentColor: fillColor }}
         />
      </div>
    </div>
  );
};
