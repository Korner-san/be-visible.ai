'use client'

import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface ShareData {
  name: string;
  value: number;
  color: string;
}

const data: ShareData[] = [
  { name: 'Your Brand', value: 45, color: '#2C1308' },
  { name: 'Other entities', value: 55, color: '#ea580c' },
];

export const ShareOfVoice: React.FC = () => {
  return (
    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm h-full flex flex-col">
      <div className="mb-4">
        <h3 className="text-[15px] font-bold text-gray-400 tracking-wide">Share of voice</h3>
        <p className="text-[11px] text-slate-500 mt-0.5 font-medium">Competitive presence distribution</p>
      </div>

      <div className="flex-1 flex items-center gap-4 min-h-0">
        {/* Chart */}
        <div className="w-1/2 h-full relative">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius="60%"
                outerRadius="90%"
                paddingAngle={6}
                dataKey="value"
                stroke="none"
                cornerRadius={8}
                startAngle={90}
                endAngle={-270}
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  borderRadius: '10px',
                  border: 'none',
                  boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                  padding: '10px',
                  fontSize: '11px'
                }}
                itemStyle={{ fontWeight: 800 }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-2xl font-black text-slate-900 leading-none">45%</span>
            <span className="text-[9px] font-bold text-gray-400 tracking-tighter mt-1">Brand</span>
          </div>
        </div>

        {/* Legend */}
        <div className="w-1/2 space-y-1.5 overflow-y-auto custom-scrollbar">
          {data.map((item) => (
            <div key={item.name} className="flex items-center justify-between p-2 hover:bg-slate-50 rounded-lg transition-all border border-transparent">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }}></span>
                <span className="text-[11px] font-bold text-slate-600 truncate max-w-[80px]">{item.name}</span>
              </div>
              <span className="text-xs font-black text-slate-900 tabular-nums">{item.value}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
