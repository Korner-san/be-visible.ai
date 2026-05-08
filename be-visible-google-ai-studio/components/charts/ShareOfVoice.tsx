
import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { ShareData } from '../../types';

const BRAND_COLOR = '#1e1b4b';
const OTHER_COLOR = '#f97316';

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
}

function buildTwoSliceData(sovData: ShareOfVoiceData): ShareData[] {
  const { entities, total_mentions } = sovData;
  if (!entities || entities.length === 0 || total_mentions === 0) return [];
  const brand = entities.find(e => e.type === 'brand');
  const brandMentions = brand ? brand.mentions : 0;
  const otherMentions = total_mentions - brandMentions;
  const brandPct = parseFloat(((brandMentions / total_mentions) * 100).toFixed(2));
  const otherPct = parseFloat((100 - brandPct).toFixed(2));
  return [
    { name: brand?.name || 'Brand', value: brandPct, color: BRAND_COLOR },
    { name: 'Other entities', value: otherPct, color: OTHER_COLOR },
  ];
}

export const ShareOfVoice: React.FC<ShareOfVoiceProps> = ({ data: sovData, trend, timePeriodLabel, isLoading, brandId }) => {
  const hasRealData = sovData && sovData.entities && sovData.entities.length > 0 && sovData.total_mentions > 0;
  const showSample = !brandId;
  const chartData = hasRealData ? buildTwoSliceData(sovData!) : (showSample ? MOCK_DATA : []);
  const brandPercent = hasRealData ? (chartData[0]?.value ?? 0) : (showSample ? 45 : 0);
  const computingMode = !isLoading && !hasRealData && !showSample;
  const brandName = hasRealData ? (chartData[0]?.name || 'Brand') : 'Brand';

  return (
    <div className="bg-white rounded-2xl h-full flex flex-col shadow-card hover:shadow-elevated transition-smooth" style={{ border: '1px solid #e8edf4', padding: '20px' }}>
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h3 className="text-[15px] font-semibold text-slate-800 leading-tight">Share of voice</h3>
          <p className="text-xs text-slate-400 mt-0.5">Brand presence in AI responses</p>
        </div>
        <div className="flex items-center gap-2">
          {trend != null && (
            <span className={trend > 0 ? 'trend-up' : trend < 0 ? 'trend-down' : 'trend-flat'}>
              {trend > 0 ? <TrendingUp size={11} /> : trend < 0 ? <TrendingDown size={11} /> : '→'}
              {trend > 0 ? '+' : ''}{trend}% <span className="opacity-60 ml-0.5 text-[10px]">{timePeriodLabel || 'vs prev'}</span>
            </span>
          )}
          {isLoading ? (
            <span className="badge-loading">Loading</span>
          ) : hasRealData ? (
            <span className="badge-live"><span className="pulse-dot"></span>Live</span>
          ) : brandId ? (
            <span className="badge-computing">Computing</span>
          ) : (
            <span className="badge-sample">Sample</span>
          )}
        </div>
      </div>

      {computingMode ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-4">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ backgroundColor: '#fffbeb' }}>
            <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-slate-500">Computing your data…</p>
          <p className="text-xs text-slate-400 leading-relaxed">Share of voice will be available after your full analysis completes</p>
        </div>
      ) : (
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-5 gap-5 items-center min-h-0">
          {/* Donut chart */}
          <div className="relative h-44 sm:col-span-2">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%" cy="50%"
                  innerRadius={52} outerRadius={78}
                  paddingAngle={3}
                  dataKey="value"
                  stroke="none"
                  cornerRadius={4}
                  startAngle={90} endAngle={-270}
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    borderRadius: '12px',
                    border: '1px solid #e8edf4',
                    boxShadow: 'var(--shadow-elevated)',
                    padding: '8px 12px',
                    fontSize: '11px',
                  }}
                  itemStyle={{ fontWeight: 700 }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-2xl font-bold text-slate-900 tabular-nums leading-none">{Number(brandPercent).toFixed(2)}%</span>
              <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider mt-1">Brand</span>
            </div>
          </div>

          {/* Legend */}
          <div className="sm:col-span-3 space-y-1.5 overflow-y-auto">
            {chartData.map((item, idx) => (
              <div
                key={item.name}
                className={`flex items-center justify-between p-2.5 rounded-xl transition-smooth ${idx === 0 ? '' : 'hover:bg-slate-50'}`}
                style={idx === 0 ? { background: 'rgba(30,27,75,0.05)', border: '1px solid rgba(30,27,75,0.10)' } : {}}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }}></span>
                  <span className="text-sm font-medium text-slate-700 truncate">{item.name}</span>
                  {idx === 0 && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-md font-semibold uppercase tracking-wide text-white" style={{ background: BRAND_COLOR }}>You</span>
                  )}
                </div>
                <span className="text-sm font-bold text-slate-800 tabular-nums">{Number(item.value).toFixed(2)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
