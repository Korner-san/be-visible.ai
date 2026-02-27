import React, { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, Cell, PieChart, Pie, LabelList
} from 'recharts';
import { TrendingUp, HelpCircle } from 'lucide-react';
import { TimeRange } from '../types';
import { supabase } from '../lib/supabase';

// Competitor color palette: Purple, Deep Red, Red, Orange, Yellow
const COMPETITOR_COLORS = ['#481643', '#970e33', '#d90226', '#fb5607', '#ffbd00'];

// Mock data used when no real data is available
const MOCK_COMPETITORS = [
  { name: 'Incredibuild', score: 94, mentionRate: 78, voice: 45, citation: 35, color: '#481643', website: 'incredibuild.com' },
  { name: 'GitLab CI', score: 82, mentionRate: 65, voice: 25, citation: 22, color: '#970e33', website: 'gitlab.com' },
  { name: 'CircleCI', score: 79, mentionRate: 61, voice: 15, citation: 18, color: '#d90226', website: 'circleci.com' },
  { name: 'Travis CI', score: 71, mentionRate: 52, voice: 10, citation: 15, color: '#fb5607', website: 'travis-ci.com' },
  { name: 'Jenkins', score: 65, mentionRate: 48, voice: 5, citation: 10, color: '#ffbd00', website: 'jenkins.io' },
];

const MOCK_TREND = [
  { date: 'Dec 10', Incredibuild: 72, 'GitLab CI': 78, CircleCI: 70, 'Travis CI': 62, Jenkins: 60 },
  { date: 'Dec 15', Incredibuild: 75, 'GitLab CI': 79, CircleCI: 71, 'Travis CI': 63, Jenkins: 61 },
  { date: 'Dec 20', Incredibuild: 80, 'GitLab CI': 80, CircleCI: 73, 'Travis CI': 65, Jenkins: 62 },
  { date: 'Dec 25', Incredibuild: 88, 'GitLab CI': 81, CircleCI: 76, 'Travis CI': 68, Jenkins: 63 },
  { date: 'Dec 30', Incredibuild: 91, 'GitLab CI': 82, CircleCI: 78, 'Travis CI': 70, Jenkins: 64 },
  { date: 'Jan 03', Incredibuild: 94, 'GitLab CI': 82, CircleCI: 79, 'Travis CI': 71, Jenkins: 65 },
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

interface CompetitorRow {
  name: string;
  mentionRate: number;
  citation: number;
  color: string;
  website: string;
}

function getDateRange(timeRange: TimeRange): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  switch (timeRange) {
    case TimeRange.SEVEN_DAYS: from.setDate(from.getDate() - 7); break;
    case TimeRange.NINETY_DAYS: from.setDate(from.getDate() - 90); break;
    default: from.setDate(from.getDate() - 30);
  }
  return {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
  };
}

export const CompetitorsPage: React.FC<CompetitorsPageProps> = ({ brandId, timeRange = TimeRange.THIRTY_DAYS }) => {
  // SOV state
  const [sovSlices, setSovSlices] = useState<SovSlice[]>([]);
  const [sovBrandPct, setSovBrandPct] = useState<number>(45);
  const [isLoadingSov, setIsLoadingSov] = useState(false);
  const [hasRealSov, setHasRealSov] = useState(false);

  // Competitor metrics state
  const [trendData, setTrendData] = useState<any[]>([]);
  const [mentionData, setMentionData] = useState<CompetitorRow[]>([]);
  const [citationData, setCitationData] = useState<CompetitorRow[]>([]);
  const [competitorNames, setCompetitorNames] = useState<string[]>([]);
  const [brandName, setBrandName] = useState<string>('Brand');
  const [isLoadingMetrics, setIsLoadingMetrics] = useState(false);
  const [hasRealMetrics, setHasRealMetrics] = useState(false);

  useEffect(() => {
    if (!brandId) return;

    const { from, to } = getDateRange(timeRange);

    // Fetch share of voice
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

        if (error || !reports || reports.length === 0) { setHasRealSov(false); return; }

        const entityMap: Record<string, { name: string; mentions: number; type: string }> = {};
        let totalMentions = 0;

        for (const report of reports) {
          const sov = report.share_of_voice_data as any;
          if (!sov?.entities) continue;
          for (const entity of sov.entities) {
            const key = entity.name.toLowerCase();
            if (entityMap[key]) entityMap[key].mentions += entity.mentions;
            else entityMap[key] = { name: entity.name, mentions: entity.mentions, type: entity.type };
          }
          totalMentions += sov.total_mentions || 0;
        }

        if (totalMentions === 0) { setHasRealSov(false); return; }

        const entities = Object.values(entityMap).sort((a, b) => b.mentions - a.mentions);
        const brand = entities.find(e => e.type === 'brand');
        const competitors = entities.filter(e => e.type === 'competitor');
        const others = entities.filter(e => e.type === 'other');
        const otherMentions = others.reduce((sum, e) => sum + e.mentions, 0);

        const slices: SovSlice[] = [];
        let colorIdx = 0;
        if (brand) slices.push({ name: brand.name, voice: Math.round((brand.mentions / totalMentions) * 100), color: COMPETITOR_COLORS[colorIdx++ % COMPETITOR_COLORS.length] });
        for (const comp of competitors) {
          const pct = Math.round((comp.mentions / totalMentions) * 100);
          if (pct > 0) slices.push({ name: comp.name, voice: pct, color: COMPETITOR_COLORS[colorIdx++ % COMPETITOR_COLORS.length] });
        }
        if (otherMentions > 0) {
          const pct = Math.round((otherMentions / totalMentions) * 100);
          if (pct > 0) slices.push({ name: 'Other', voice: pct, color: '#94a3b8' });
        }
        const sum = slices.reduce((s, item) => s + item.voice, 0);
        if (sum !== 100 && slices.length > 0) slices[0].voice += 100 - sum;

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

    // Fetch competitor metrics (visibility trend, mention rate, citation share)
    const fetchCompetitorMetrics = async () => {
      setIsLoadingMetrics(true);
      try {
        const { data: reports, error } = await supabase
          .from('daily_reports')
          .select('report_date, competitor_metrics')
          .eq('brand_id', brandId)
          .eq('status', 'completed')
          .not('competitor_metrics', 'is', null)
          .gte('report_date', from)
          .lte('report_date', to)
          .order('report_date', { ascending: true });

        if (error || !reports || reports.length === 0) {
          setHasRealMetrics(false);
          return;
        }

        // Deduplicate by report_date — keep the row with the highest brand_visibility_score
        // (duplicate rows can appear if the end-of-day processor ran on the same date twice)
        const bestByDate = new Map<string, any>();
        for (const r of reports) {
          const cm = r.competitor_metrics as any;
          const score = cm?.brand_visibility_score ?? -1;
          const existing = bestByDate.get(r.report_date);
          const existingScore = (existing?.competitor_metrics as any)?.brand_visibility_score ?? -1;
          if (score > existingScore) {
            bestByDate.set(r.report_date, r);
          }
        }
        const dedupedReports = Array.from(bestByDate.values())
          .sort((a, b) => a.report_date.localeCompare(b.report_date));

        // Extract brand name and competitor names from first report
        const firstMetrics = dedupedReports[0].competitor_metrics as any;
        const compNames = (firstMetrics.competitors || []).map((c: any) => c.name);
        setCompetitorNames(compNames);

        // Get brand name
        const { data: brandData } = await supabase
          .from('brands')
          .select('name')
          .eq('id', brandId)
          .single();
        const bName = brandData?.name || 'Brand';
        setBrandName(bName);

        // Build trend data (one point per day)
        const trend: any[] = dedupedReports.map(r => {
          const cm = r.competitor_metrics as any;
          const dateLabel = new Date(r.report_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          const point: any = { date: dateLabel };
          point[bName] = cm.brand_visibility_score || 0;
          for (const comp of (cm.competitors || [])) {
            point[comp.name] = comp.visibility_score || 0;
          }
          return point;
        });
        setTrendData(trend);

        // Aggregate mention rates and citation shares across all days
        const mentionAgg: Record<string, { totalMentions: number; totalResponses: number }> = {};
        const citationAgg: Record<string, { totalShare: number; count: number }> = {};

        // Init brand
        mentionAgg[bName] = { totalMentions: 0, totalResponses: 0 };
        citationAgg[bName] = { totalShare: 0, count: 0 };
        for (const name of compNames) {
          mentionAgg[name] = { totalMentions: 0, totalResponses: 0 };
          citationAgg[name] = { totalShare: 0, count: 0 };
        }

        for (const r of dedupedReports) {
          const cm = r.competitor_metrics as any;

          // Brand
          mentionAgg[bName].totalMentions += cm.brand_mention_count || 0;
          mentionAgg[bName].totalResponses += cm.total_responses || 0;
          if (cm.brand_citation_share !== null && cm.brand_citation_share !== undefined) {
            citationAgg[bName].totalShare += cm.brand_citation_share;
            citationAgg[bName].count++;
          }

          // Competitors
          for (const comp of (cm.competitors || [])) {
            if (mentionAgg[comp.name]) {
              mentionAgg[comp.name].totalMentions += comp.mention_count || 0;
              mentionAgg[comp.name].totalResponses += comp.total_responses || 0;
            }
            if (citationAgg[comp.name] && comp.citation_share !== null && comp.citation_share !== undefined) {
              citationAgg[comp.name].totalShare += comp.citation_share;
              citationAgg[comp.name].count++;
            }
          }
        }

        // Build mention rate bars: brand first, then competitors sorted by rate
        const allNames = [bName, ...compNames];
        const mentionRows: CompetitorRow[] = allNames.map((name, idx) => {
          const agg = mentionAgg[name];
          const rate = agg.totalResponses > 0 ? Math.round((agg.totalMentions / agg.totalResponses) * 100) : 0;
          const comp = MOCK_COMPETITORS.find(m => m.name === name);
          return {
            name,
            mentionRate: rate,
            citation: 0,
            color: COMPETITOR_COLORS[idx % COMPETITOR_COLORS.length],
            website: comp?.website || '',
          };
        }).sort((a, b) => b.mentionRate - a.mentionRate);
        setMentionData(mentionRows);

        // Build citation share rows
        const citationRows: CompetitorRow[] = allNames.map((name, idx) => {
          const agg = citationAgg[name];
          const avgShare = agg.count > 0 ? parseFloat((agg.totalShare / agg.count).toFixed(1)) : 0;
          const comp = MOCK_COMPETITORS.find(m => m.name === name);
          return {
            name,
            mentionRate: 0,
            citation: avgShare,
            color: COMPETITOR_COLORS[idx % COMPETITOR_COLORS.length],
            website: comp?.website || '',
          };
        }).sort((a, b) => b.citation - a.citation);
        setCitationData(citationRows);

        setHasRealMetrics(true);
      } catch (err) {
        console.error('Competitor metrics fetch error:', err);
        setHasRealMetrics(false);
      } finally {
        setIsLoadingMetrics(false);
      }
    };

    fetchShareOfVoice();
    fetchCompetitorMetrics();
  }, [brandId, timeRange]);

  // Determine which data to show
  const pieData = hasRealSov ? sovSlices : MOCK_COMPETITORS.map(c => ({ name: c.name, voice: c.voice, color: c.color }));
  const centerPct = hasRealSov ? sovBrandPct : 45;

  const activeTrend = hasRealMetrics ? trendData : MOCK_TREND;
  const activeMention = hasRealMetrics ? mentionData : MOCK_COMPETITORS.map((c, i) => ({ ...c, color: COMPETITOR_COLORS[i % COMPETITOR_COLORS.length] }));
  const activeCitation = hasRealMetrics ? citationData : MOCK_COMPETITORS.map((c, i) => ({ ...c, color: COMPETITOR_COLORS[i % COMPETITOR_COLORS.length] }));

  // For trend chart, we need the line keys
  const trendLineKeys = hasRealMetrics
    ? [brandName, ...competitorNames]
    : ['Incredibuild', 'GitLab CI', 'CircleCI', 'Travis CI', 'Jenkins'];

  // Y-axis domain for trend: find min across all data points
  const allTrendValues = activeTrend.flatMap(point =>
    trendLineKeys.map(key => (point as any)[key] as number).filter(v => v !== undefined)
  );
  const minTrend = allTrendValues.length > 0 ? Math.max(0, Math.floor(Math.min(...allTrendValues) / 10) * 10 - 10) : 0;
  const maxTrend = allTrendValues.length > 0 ? Math.min(100, Math.ceil(Math.max(...allTrendValues) / 10) * 10 + 10) : 100;

  const renderCustomLabel = (props: any) => {
    const { x, y, width, value } = props;
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

  const isLoading = isLoadingSov || isLoadingMetrics;
  const hasAnyReal = hasRealSov || hasRealMetrics;

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
            <div className="flex items-center gap-2">
              {isLoadingMetrics ? (
                <span className="text-[9px] font-bold text-amber-500 bg-amber-50 px-2 py-0.5 rounded-full animate-pulse">LOADING</span>
              ) : hasRealMetrics ? (
                <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">LIVE DATA</span>
              ) : (
                <span className="text-[9px] font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full">SAMPLE</span>
              )}
              <TrendingUp size={16} className="text-slate-200" />
            </div>
          </div>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={activeTrend} margin={{ left: -25, right: 15, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 9, fill: '#94a3b8', fontWeight: 600 }}
                  axisLine={false}
                  tickLine={false}
                  tickMargin={10}
                />
                <YAxis
                  domain={[minTrend, maxTrend]}
                  tick={{ fontSize: 9, fill: '#94a3b8', fontWeight: 600 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{ borderRadius: '10px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: '11px' }}
                  formatter={(value: number) => [`${value.toFixed(1)}%`, undefined]}
                />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: '8px', fontSize: '9px', fontWeight: 700 }} />
                {trendLineKeys.map((key, idx) => (
                  <Line
                    key={key}
                    type="monotone"
                    dataKey={key}
                    stroke={COMPETITOR_COLORS[idx % COMPETITOR_COLORS.length]}
                    strokeWidth={idx === 0 ? 3 : 2}
                    dot={false}
                    activeDot={{ r: 5 }}
                    strokeDasharray={idx === 0 ? undefined : '5 5'}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Share of Voice Donut */}
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
                <Pie data={pieData} cx="50%" cy="50%" innerRadius="65%" outerRadius="90%" paddingAngle={4} dataKey="voice" stroke="none" cornerRadius={6}>
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

        {/* Mention Rate Benchmark */}
        <div className="col-span-12 lg:col-span-6 bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col h-[380px]">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h3 className="text-[15px] font-bold text-gray-400 tracking-wide">Mention rate benchmark</h3>
              <p className="text-[11px] text-slate-500 mt-0.5 font-medium italic">Efficiency of brand capture across models</p>
            </div>
            {isLoadingMetrics ? (
              <span className="text-[9px] font-bold text-amber-500 bg-amber-50 px-2 py-0.5 rounded-full animate-pulse">LOADING</span>
            ) : hasRealMetrics ? (
              <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">LIVE DATA</span>
            ) : (
              <span className="text-[9px] font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full">SAMPLE</span>
            )}
          </div>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={activeMention}
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
                  formatter={(value: number) => [`${value}%`, 'Mention Rate']}
                />
                <Bar dataKey="mentionRate" radius={[4, 4, 0, 0]} barSize={20}>
                  {activeMention.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                  <LabelList dataKey="mentionRate" content={renderCustomLabel} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Citation Share Ranking */}
        <div className="col-span-12 lg:col-span-6 bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col h-[380px]">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h3 className="text-[15px] font-bold text-gray-400 tracking-wide">Citation share ranking</h3>
              <p className="text-[11px] text-slate-500 mt-0.5 font-medium italic">Relative performance in citation volume</p>
            </div>
            {isLoadingMetrics ? (
              <span className="text-[9px] font-bold text-amber-500 bg-amber-50 px-2 py-0.5 rounded-full animate-pulse">LOADING</span>
            ) : hasRealMetrics ? (
              <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">LIVE DATA</span>
            ) : (
              <span className="text-[9px] font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full">SAMPLE</span>
            )}
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto custom-scrollbar">
            {activeCitation.map((c: any, idx: number) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-gray-50/50 rounded-xl border border-gray-100 hover:border-slate-200 transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs text-white" style={{ backgroundColor: c.color }}>
                    {c.name.charAt(0)}
                  </div>
                  <div>
                    <div className="text-xs font-black text-slate-800">{c.name}</div>
                    {c.website && <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{c.website}</div>}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-black text-slate-900">{c.citation}%</div>
                  <div className="text-[8px] font-bold text-slate-400 uppercase">Share</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
