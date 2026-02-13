
import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { ShareData } from '../../types';

// Color palette: brand = dark brown, competitors = brown/orange shades, other = gray
const ENTITY_COLORS: Record<string, string> = {
  brand: '#2C1308',
  competitor_0: '#ea580c',
  competitor_1: '#c2410c',
  competitor_2: '#9a3412',
  competitor_3: '#7c2d12',
  other: '#94a3b8',
};

function getEntityColor(type: string, competitorIndex: number): string {
  if (type === 'brand') return ENTITY_COLORS.brand;
  if (type === 'competitor') return ENTITY_COLORS[`competitor_${competitorIndex % 4}`] || ENTITY_COLORS.competitor_0;
  return ENTITY_COLORS.other;
}

const MOCK_DATA: ShareData[] = [
  { name: 'Incredibuild', value: 45, color: '#2C1308' },
  { name: 'Other entities', value: 55, color: '#ea580c' },
];

interface ShareOfVoiceEntity {
  name: string;
  mentions: number;
  type: 'brand' | 'competitor' | 'other';
}

interface ShareOfVoiceData {
  entities: ShareOfVoiceEntity[];
  total_mentions: number;
  calculated_at: string;
}

interface ShareOfVoiceProps {
  data?: ShareOfVoiceData;
  isLoading?: boolean;
}

function buildChartData(sovData: ShareOfVoiceData): ShareData[] {
  const { entities, total_mentions } = sovData;
  if (!entities || entities.length === 0 || total_mentions === 0) return [];

  let competitorIdx = 0;

  // Separate brand, competitors, and others
  const brand = entities.find(e => e.type === 'brand');
  const competitors = entities.filter(e => e.type === 'competitor');
  const others = entities.filter(e => e.type === 'other');

  const chartItems: ShareData[] = [];

  // Brand first
  if (brand) {
    chartItems.push({
      name: brand.name,
      value: Math.round((brand.mentions / total_mentions) * 100),
      color: getEntityColor('brand', 0),
    });
  }

  // Competitors
  for (const comp of competitors) {
    chartItems.push({
      name: comp.name,
      value: Math.round((comp.mentions / total_mentions) * 100),
      color: getEntityColor('competitor', competitorIdx++),
    });
  }

  // Aggregate "other" entities into one slice
  const otherMentions = others.reduce((sum, e) => sum + e.mentions, 0);
  if (otherMentions > 0) {
    chartItems.push({
      name: 'Other entities',
      value: Math.round((otherMentions / total_mentions) * 100),
      color: getEntityColor('other', 0),
    });
  }

  // Fix rounding: ensure values sum to 100
  const sum = chartItems.reduce((s, item) => s + item.value, 0);
  if (sum !== 100 && chartItems.length > 0) {
    chartItems[0].value += 100 - sum;
  }

  return chartItems;
}

export const ShareOfVoice: React.FC<ShareOfVoiceProps> = ({ data: sovData, isLoading }) => {
  const hasRealData = sovData && sovData.entities && sovData.entities.length > 0 && sovData.total_mentions > 0;
  const chartData = hasRealData ? buildChartData(sovData) : MOCK_DATA;
  const brandItem = chartData.find((_, i) => i === 0); // Brand is always first
  const brandPercent = brandItem ? brandItem.value : 45;

  return (
    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm h-full flex flex-col">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-[15px] font-bold text-gray-400 tracking-wide">Share of voice</h3>
          <p className="text-[11px] text-slate-500 mt-0.5 font-medium">Competitive presence distribution</p>
        </div>
        {isLoading ? (
          <span className="text-[9px] font-bold text-amber-500 bg-amber-50 px-2 py-0.5 rounded-full animate-pulse">LOADING</span>
        ) : hasRealData ? (
          <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">LIVE DATA</span>
        ) : (
          <span className="text-[9px] font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full">SAMPLE</span>
        )}
      </div>

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
    </div>
  );
};
