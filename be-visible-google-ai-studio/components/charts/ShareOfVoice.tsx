
import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { ShareData } from '../../types';

const BRAND_COLOR = '#2C1308';
const OTHER_COLOR = '#ea580c';

const MOCK_DATA: ShareData[] = [
  { name: 'Incredibuild', value: 45, color: BRAND_COLOR },
  { name: 'Other entities', value: 55, color: OTHER_COLOR },
];

interface ShareOfVoiceEntity {
  name: string;
  mentions: number;
  type: 'brand' | 'competitor' | 'other';
}

export interface ShareOfVoiceData {
  entities: ShareOfVoiceEntity[];
  total_mentions: number;
  calculated_at: string;
}

interface ShareOfVoiceProps {
  data?: ShareOfVoiceData;
  trend?: number | null;
  timePeriodLabel?: string;
  isLoading?: boolean;
  brandId?: string | null;
  isAllModels?: boolean;
}

/**
 * Visibility page: always 2 slices — Brand vs everything else
 */
function buildTwoSliceData(sovData: ShareOfVoiceData): ShareData[] {
  const { entities, total_mentions } = sovData;
  if (!entities || entities.length === 0 || total_mentions === 0) return [];

  const brand = entities.find(e => e.type === 'brand');
  const brandMentions = brand ? brand.mentions : 0;
  const otherMentions = total_mentions - brandMentions;

  const brandPct = Math.round((brandMentions / total_mentions) * 100);
  const otherPct = 100 - brandPct;

  return [
    { name: brand?.name || 'Brand', value: brandPct, color: BRAND_COLOR },
    { name: 'Other entities', value: otherPct, color: OTHER_COLOR },
  ];
}

export const ShareOfVoice: React.FC<ShareOfVoiceProps> = ({ data: sovData, trend, timePeriodLabel, isLoading, brandId, isAllModels = true }) => {
  const hasRealData = sovData && sovData.entities && sovData.entities.length > 0 && sovData.total_mentions > 0;
  // Only show Incredibuild sample data in demo mode (no brandId).
  // When a real brand is set but SOV hasn't been computed yet (Phase 1), show computing state.
  const showSample = !brandId;
  const chartData = hasRealData ? buildTwoSliceData(sovData) : (showSample ? MOCK_DATA : []);
  const brandPercent = hasRealData ? (chartData[0]?.value ?? 0) : (showSample ? 45 : 0);
  const computingMode = !isLoading && !hasRealData && !showSample;

  return (
    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm h-full flex flex-col">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-[15px] font-bold text-gray-400 tracking-wide">Share of voice</h3>
          <p className="text-[11px] text-slate-500 mt-0.5 font-medium">
            Brand presence in AI responses
            {!isAllModels && <span className="ml-1 text-[10px] text-amber-500 font-bold">(all models)</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {trend != null && (
            <span
              className="text-[9px] font-black px-2 py-0.5 rounded-full inline-flex items-center gap-0.5 border whitespace-nowrap"
              style={trend > 0
                ? { color: '#16a34a', backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }
                : trend < 0
                ? { color: '#7B3218', backgroundColor: 'rgba(231,179,115,0.18)', borderColor: 'rgba(150,61,31,0.25)' }
                : { color: '#94a3b8', backgroundColor: '#f8fafc', borderColor: '#e2e8f0' }
              }
            >
              {trend > 0 ? '↑' : trend < 0 ? '↓' : '→'}{trend > 0 ? '+' : ''}{trend}% <span className="opacity-70 ml-0.5">{timePeriodLabel || 'vs prev'}</span>
            </span>
          )}
          {isLoading ? (
            <span className="text-[9px] font-bold text-amber-500 bg-amber-50 px-2 py-0.5 rounded-full animate-pulse">LOADING</span>
          ) : hasRealData ? (
            <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">LIVE DATA</span>
          ) : brandId ? (
            <span className="text-[9px] font-bold text-amber-500 bg-amber-50 px-2 py-0.5 rounded-full">COMPUTING</span>
          ) : (
            <span className="text-[9px] font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full">SAMPLE</span>
          )}
        </div>
      </div>

      {computingMode ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-4">
          <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center">
            <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-xs font-semibold text-gray-400">Computing your data…</p>
          <p className="text-[10px] text-gray-300 leading-relaxed">Share of voice will be available after your full analysis completes</p>
        </div>
      ) : (
      <div className="flex-1 flex items-center gap-4 min-h-0">
        {/* Chart */}
        <div className="w-1/2 h-full relative">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
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
                {chartData.map((entry, index) => (
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
            <span className="text-2xl font-black text-slate-900 leading-none">{brandPercent}%</span>
            <span className="text-[9px] font-bold text-gray-400 tracking-tighter mt-1">Brand</span>
          </div>
        </div>

        {/* Legend */}
        <div className="w-1/2 space-y-1.5 overflow-y-auto custom-scrollbar">
          {chartData.map((item) => (
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
      )}
    </div>
  );
};
