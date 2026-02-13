import React, { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, Cell, PieChart, Pie, LabelList
} from 'recharts';
import { TrendingUp, BarChart3, HelpCircle } from 'lucide-react';
import { TimeRange } from '../types';
import { supabase } from '../lib/supabase';

// Competitor color palette from design: Purple, Deep Red, Red, Orange, Yellow
const COMPETITOR_COLORS = ['#481643', '#970e33', '#d90226', '#fb5607', '#ffbd00'];

// Competitor data with new color palette from image: Purple, Deep Red, Red, Orange, Yellow
const competitorsData = [
  { name: 'Incredibuild', score: 94, mentionRate: 78, mentions: 242, total: 311, voice: 45, citation: 35, color: '#481643', website: 'incredibuild.com' },
  { name: 'GitLab CI', score: 82, mentionRate: 65, mentions: 202, total: 311, voice: 25, citation: 22, color: '#970e33', website: 'gitlab.com' },
  { name: 'CircleCI', score: 79, mentionRate: 61, mentions: 189, total: 311, voice: 15, citation: 18, color: '#d90226', website: 'circleci.com' },
  { name: 'Travis CI', score: 71, mentionRate: 52, mentions: 161, total: 311, voice: 10, citation: 15, color: '#fb5607', website: 'travis-ci.com' },
  { name: 'Jenkins', score: 65, mentionRate: 48, mentions: 149, total: 311, voice: 5, citation: 10, color: '#ffbd00', website: 'jenkins.io' },
];

const trendData = [
  { date: 'Dec 10', Incredibuild: 72, GitLab: 78, CircleCI: 70, Travis: 62, Jenkins: 60 },
  { date: 'Dec 15', Incredibuild: 75, GitLab: 79, CircleCI: 71, Travis: 63, Jenkins: 61 },
  { date: 'Dec 20', Incredibuild: 80, GitLab: 80, CircleCI: 73, Travis: 65, Jenkins: 62 },
  { date: 'Dec 25', Incredibuild: 88, GitLab: 81, CircleCI: 76, Travis: 68, Jenkins: 63 },
  { date: 'Dec 30', Incredibuild: 91, GitLab: 82, CircleCI: 78, Travis: 70, Jenkins: 64 },
  { date: 'Jan 03', Incredibuild: 94, GitLab: 82, CircleCI: 79, Travis: 71, Jenkins: 65 },
];

interface CompetitorsPageProps {
  brandId?: string | null;
  timeRange?: TimeRange;
}

interface SovSlice {
  name: string;
  voice: number;
  color: string;
}

function getDateRange(timeRange: TimeRange): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  switch (timeRange) {
    case TimeRange.SEVEN_DAYS:
      from.setDate(from.getDate() - 7);
      break;
    case TimeRange.NINETY_DAYS:
      from.setDate(from.getDate() - 90);
      break;
    default:
      from.setDate(from.getDate() - 30);
  }
  return {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
  };
}

export const CompetitorsPage: React.FC<CompetitorsPageProps> = ({ brandId, timeRange = TimeRange.THIRTY_DAYS }) => {
  const [sovSlices, setSovSlices] = useState<SovSlice[]>([]);
  const [sovBrandPct, setSovBrandPct] = useState<number>(45);
  const [isLoadingSov, setIsLoadingSov] = useState(false);
  const [hasRealSov, setHasRealSov] = useState(false);

  useEffect(() => {
    if (!brandId) return;

    const { from, to } = getDateRange(timeRange);

    const fetchShareOfVoice = async () => {
      setIsLoadingSov(true);
      try {
        const { data: reports, error } = await supabase
          .from('daily_reports')
          .select('share_of_voice_data')
          .eq('brand_id', brandId)
          .eq('status', 'completed')
          .not('share_of_voice_data', 'is', null)
          .gte('report_date', from)
          .lte('report_date', to);

        if (error || !reports || reports.length === 0) {
          setHasRealSov(false);
          return;
        }

        // Aggregate entities across all days
        const entityMap: Record<string, { name: string; mentions: number; type: string }> = {};
        let totalMentions = 0;

        for (const report of reports) {
          const sov = report.share_of_voice_data as any;
          if (!sov?.entities) continue;

          for (const entity of sov.entities) {
            const key = entity.name.toLowerCase();
            if (entityMap[key]) {
              entityMap[key].mentions += entity.mentions;
            } else {
              entityMap[key] = { name: entity.name, mentions: entity.mentions, type: entity.type };
            }
          }
          totalMentions += sov.total_mentions || 0;
        }

        if (totalMentions === 0) {
          setHasRealSov(false);
          return;
        }

        const entities = Object.values(entityMap).sort((a, b) => b.mentions - a.mentions);

        // Build slices: brand first, then competitors, then aggregate "other"
        const brand = entities.find(e => e.type === 'brand');
        const competitors = entities.filter(e => e.type === 'competitor');
        const others = entities.filter(e => e.type === 'other');
        const otherMentions = others.reduce((sum, e) => sum + e.mentions, 0);

        const slices: SovSlice[] = [];
        let colorIdx = 0;

        if (brand) {
          const pct = Math.round((brand.mentions / totalMentions) * 100);
          slices.push({ name: brand.name, voice: pct, color: COMPETITOR_COLORS[colorIdx++ % COMPETITOR_COLORS.length] });
        }

        for (const comp of competitors) {
          const pct = Math.round((comp.mentions / totalMentions) * 100);
          if (pct > 0) {
            slices.push({ name: comp.name, voice: pct, color: COMPETITOR_COLORS[colorIdx++ % COMPETITOR_COLORS.length] });
          }
        }

        if (otherMentions > 0) {
          const pct = Math.round((otherMentions / totalMentions) * 100);
          if (pct > 0) {
            slices.push({ name: 'Other', voice: pct, color: '#94a3b8' });
          }
        }

        // Fix rounding
        const sum = slices.reduce((s, item) => s + item.voice, 0);
        if (sum !== 100 && slices.length > 0) {
          slices[0].voice += 100 - sum;
        }

        setSovSlices(slices);
        setSovBrandPct(slices[0]?.voice ?? 0);
        setHasRealSov(true);
      } catch (err) {
        console.error('Competitors SOV fetch error:', err);
        setHasRealSov(false);
      } finally {
        setIsLoadingSov(false);
      }
    };

    fetchShareOfVoice();
  }, [brandId, timeRange]);

  // Use real data if available, otherwise fallback to mock
  const pieData = hasRealSov ? sovSlices : competitorsData.map(c => ({ name: c.name, voice: c.voice, color: c.color }));
  const centerPct = hasRealSov ? sovBrandPct : 45;

  const renderCustomLabel = (props: any) => {
    const { x, y, width, value, index } = props;
    const entry = competitorsData[index];
    if (!entry) return null;

    return (
      <g>
        <text
          x={x + width / 2}
          y={y - 12}
          fill="#475569"
          fontSize="9"
          fontWeight="800"
          textAnchor="middle"
          className="font-sans"
        >
          {value}%
        </text>
      </g>
    );
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      <div className="grid grid-cols-12 gap-6 items-stretch">
        {/* Primary Row: Trend Comparison */}
        <div className="col-span-12 lg:col-span-8 bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col h-[340px]">
          <div className="flex items-start justify-between mb-4">
            <div className="space-y-1">
              <h3 className="text-[15px] font-bold text-gray-400 tracking-wide flex items-center gap-2">
                Visibility trend vs competitors
                <HelpCircle size={14} className="text-gray-300" />
              </h3>
              <p className="text-[11px] text-slate-500 font-medium mt-0.5">Cross-model visibility growth comparison</p>
            </div>
            <TrendingUp size={16} className="text-slate-200" />
          </div>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ left: -25, right: 15, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 9, fill: '#94a3b8', fontWeight: 600 }}
                  axisLine={false}
                  tickLine={false}
                  tickMargin={10}
                />
                <YAxis
                  domain={[50, 100]}
                  tick={{ fontSize: 9, fill: '#94a3b8', fontWeight: 600 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{ borderRadius: '10px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: '11px' }}
                />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: '8px', fontSize: '9px', fontWeight: 700 }} />
                <Line type="linear" dataKey="Incredibuild" stroke={competitorsData[0].color} strokeWidth={3} dot={false} activeDot={{ r: 5 }} />
                <Line type="linear" dataKey="GitLab" stroke={competitorsData[1].color} strokeWidth={2} dot={false} strokeDasharray="5 5" />
                <Line type="linear" dataKey="CircleCI" stroke={competitorsData[2].color} strokeWidth={2} dot={false} strokeDasharray="5 5" />
                <Line type="linear" dataKey="Travis" stroke={competitorsData[3].color} strokeWidth={2} dot={false} strokeDasharray="5 5" />
                <Line type="linear" dataKey="Jenkins" stroke={competitorsData[4].color} strokeWidth={2} dot={false} strokeDasharray="5 5" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Share of Voice Donut — real data with competitor breakdown */}
        <div className="col-span-12 lg:col-span-4 bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col h-[340px]">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-[15px] font-bold text-gray-400 tracking-wide">Share of voice</h3>
              <p className="text-[11px] text-slate-500 mt-0.5 font-medium">Market share distribution</p>
            </div>
            {isLoadingSov ? (
              <span className="text-[9px] font-bold text-amber-500 bg-amber-50 px-2 py-0.5 rounded-full animate-pulse">LOADING</span>
            ) : hasRealSov ? (
              <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">LIVE DATA</span>
            ) : (
              <span className="text-[9px] font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full">SAMPLE</span>
            )}
          </div>
          <div className="flex-1 relative min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius="65%"
                  outerRadius="90%"
                  paddingAngle={4}
                  dataKey="voice"
                  stroke="none"
                  cornerRadius={6}
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ fontSize: '11px', borderRadius: '8px' }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-2xl font-black text-slate-800 leading-none">{centerPct}%</span>
              <span className="text-[8px] font-bold text-gray-400 uppercase tracking-tighter mt-1">Primary</span>
            </div>
          </div>
          <div className="mt-4 space-y-1.5 overflow-y-auto custom-scrollbar">
            {pieData.slice(0, 6).map(c => (
              <div key={c.name} className="flex items-center justify-between text-[10px] font-bold uppercase text-slate-500">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c.color }}></div>
                  <span className="truncate max-w-[100px]">{c.name}</span>
                </div>
                <span>{c.voice}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Secondary Row: Benchmarking */}
        <div className="col-span-12 lg:col-span-6 bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col h-[380px]">
          <div className="mb-6">
             <h3 className="text-[15px] font-bold text-gray-400 tracking-wide">Mention rate benchmark</h3>
             <p className="text-[11px] text-slate-500 mt-0.5 font-medium italic">Efficiency of brand capture across models</p>
          </div>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={competitorsData}
                margin={{ top: 25, right: 15, left: -20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 9, fill: '#475569', fontWeight: 800 }}
                  axisLine={false}
                  tickLine={false}
                  tickMargin={12}
                />
                <YAxis
                  domain={[0, 100]}
                  ticks={[0, 25, 50, 75, 100]}
                  tick={{ fontSize: 9, fill: '#94a3b8', fontWeight: 600 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: '#f8fafc', opacity: 0.5 }}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', fontSize: '11px' }}
                />
                <Bar
                  dataKey="mentionRate"
                  radius={[4, 4, 0, 0]}
                  barSize={20}
                >
                  {competitorsData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                  <LabelList dataKey="mentionRate" content={renderCustomLabel} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-6 bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col h-[380px]">
          <div className="mb-6">
             <h3 className="text-[15px] font-bold text-gray-400 tracking-wide">Citation share ranking</h3>
             <p className="text-[11px] text-slate-500 mt-0.5 font-medium italic">Relative performance in citation volume</p>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto custom-scrollbar">
            {competitorsData.map((c, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-gray-50/50 rounded-xl border border-gray-100 hover:border-slate-200 transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs text-white" style={{ backgroundColor: c.color }}>
                    {c.name.charAt(0)}
                  </div>
                  <div>
                    <div className="text-xs font-black text-slate-800">{c.name}</div>
                    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{c.website}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-black text-slate-900">{c.citation}%</div>
                  <div className="text-[8px] font-bold text-slate-400 uppercase">Share</div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-3 border-t border-gray-50 flex justify-center">
            <button className="text-[9px] font-bold text-gray-400 uppercase tracking-widest hover:text-slate-800 transition-colors">Download Detailed Report</button>
          </div>
        </div>
      </div>
    </div>
  );
};
