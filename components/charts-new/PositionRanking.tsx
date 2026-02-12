'use client'

import React from 'react';

interface CategoryPosition {
  category: string;
  position: number;
  gap: number;
}

const data: CategoryPosition[] = [
  { category: '"Best C++ build accelerator"', position: 1, gap: 1.0 },
  { category: '"Fastest CI/CD tools 2024"', position: 2, gap: 0.85 },
  { category: '"Game development compile times"', position: 1, gap: 1.0 },
  { category: '"Enterprise build system comparison"', position: 3, gap: 0.6 },
  { category: '"Distributed compiling solutions"', position: 5, gap: 0.3 },
];

export const PositionRanking: React.FC = () => {
  const averageRank = 2.4;

  const stops = [
    { r: 231, g: 179, b: 115 },
    { r: 188, g: 99,  b: 58  },
    { r: 150, g: 61,  b: 31  },
    { r: 122, g: 36,  b: 16  },
    { r: 63,  g: 15,  b: 3   }
  ];

  const getDynamicColor = (rank: number) => {
    const t = Math.max(0, Math.min(1, (rank - 1) / 9));
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

  const currentStatusColor = getDynamicColor(averageRank);
  const statusBg = currentStatusColor.replace('rgb', 'rgba').replace(')', ', 0.15)');
  const statusBorder = currentStatusColor.replace('rgb', 'rgba').replace(')', ', 0.3)');

  return (
    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm h-full flex flex-col">
      <div className="mb-4">
        <h3 className="text-[15px] font-bold text-gray-400 tracking-wide">Prompt performance</h3>
        <p className="text-[11px] text-slate-500 mt-0.5 font-medium">Category position rankings</p>
      </div>

      <div className="flex-1 flex flex-col justify-center space-y-4">
        {data.map((item, index) => {
          const itemColor = getDynamicColor(item.position);

          return (
            <div key={index} className="space-y-1">
              <div className="flex justify-between items-end px-1">
                <span className="text-[11px] font-medium text-slate-700 italic">{item.category}</span>
                <div className="flex items-center gap-1.5">
                   <span className="text-[9px] text-gray-400 font-medium">Rank</span>
                   <span className="text-xs font-black transition-colors duration-500" style={{ color: itemColor }}>
                     #{item.position}
                   </span>
                </div>
              </div>

              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden relative">
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out shadow-xs"
                  style={{
                    width: `${item.gap * 100}%`,
                    backgroundColor: itemColor
                  }}
                ></div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 pt-3 border-t border-gray-100 flex justify-between items-center">
        <span className="text-xs font-medium text-slate-500">Avg prompt rank</span>
        <div className="flex items-center gap-3">
           <span className="text-2xl font-black transition-colors duration-500" style={{ color: currentStatusColor }}>
             {averageRank.toFixed(1)}
           </span>
           <span
             className="text-[9px] font-black px-3 py-1 rounded-full border transition-all duration-500 tracking-tight"
             style={{
               color: currentStatusColor,
               backgroundColor: statusBg,
               borderColor: statusBorder
             }}
           >
             {averageRank <= 3 ? 'Top tier' : averageRank <= 6 ? 'Mid tier' : 'Optimize'}
           </span>
        </div>
      </div>
    </div>
  );
};
