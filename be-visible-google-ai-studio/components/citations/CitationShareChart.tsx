
import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { HelpCircle } from 'lucide-react';
import { TimeRange } from '../../types';
import { supabase } from '../../lib/supabase';

const ALL_MODELS = ['chatgpt', 'google_ai_overview', 'claude'];

const MOCK_DATA = [
  { date: 'Dec 10', value: 12 },
  { date: 'Dec 12', value: 14 },
  { date: 'Dec 14', value: 13 },
  { date: 'Dec 16', value: 18 },
  { date: 'Dec 18', value: 22 },
  { date: 'Dec 20', value: 20 },
  { date: 'Dec 22', value: 24 },
  { date: 'Dec 24', value: 28 },
  { date: 'Dec 26', value: 30 },
  { date: 'Dec 28', value: 32 },
  { date: 'Dec 30', value: 34 },
  { date: 'Jan 01', value: 33 },
  { date: 'Jan 03', value: 35 },
];

interface CitationShareChartProps {
  brandId?: string | null;
  timeRange?: TimeRange;
  customDateRange?: { from: string; to: string };
  selectedModels?: string[];
}

function getDateRange(timeRange: TimeRange, customDateRange?: { from: string; to: string }): { from: string; to: string } {
  if (timeRange === TimeRange.CUSTOM && customDateRange?.from && customDateRange?.to) {
    return { from: customDateRange.from, to: customDateRange.to };
  }
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

function getPreviousPeriod(from: string, to: string): { from: string; to: string } {
  const fromMs = new Date(from + 'T00:00:00').getTime();
  const toMs = new Date(to + 'T00:00:00').getTime();
  const diffMs = toMs - fromMs;
  const prevTo = new Date(fromMs - 24 * 60 * 60 * 1000);
  const prevFrom = new Date(prevTo.getTime() - diffMs);
  return {
    from: prevFrom.toISOString().split('T')[0],
    to: prevTo.toISOString().split('T')[0],
  };
}

async function fetchAvgCitationShare(brandId: string, from: string, to: string): Promise<number | null> {
  const { data, error } = await supabase
    .from('citation_share_stats')
    .select('citation_share')
    .eq('brand_id', brandId)
    .eq('domain_type', 'brand')
    .gte('report_date', from)
    .lte('report_date', to);
  if (error || !data || data.length === 0) return null;
  const avg = data.reduce((sum: number, r: any) => sum + (r.citation_share ?? 0), 0) / data.length;
  return parseFloat(avg.toFixed(1));
}

export const CitationShareChart: React.FC<CitationShareChartProps> = ({ brandId, timeRange = TimeRange.THIRTY_DAYS, customDateRange, selectedModels = ALL_MODELS }) => {
  const [data, setData] = useState(MOCK_DATA);
  const [avgShare, setAvgShare] = useState(24.8);
  const [trend, setTrend] = useState<number | null>(null);
  const [brandDomain, setBrandDomain] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasRealData, setHasRealData] = useState(false);

  useEffect(() => {
    if (!brandId) {
      setData(MOCK_DATA);
      setAvgShare(24.8);
      setTrend(null);
      setBrandDomain('incredibuild.com');
      setHasRealData(false);
      return;
    }

    const fetchData = async () => {
      setIsLoading(true);
      try {
        const { from, to } = getDateRange(timeRange, customDateRange);
        const { from: prevFrom, to: prevTo } = getPreviousPeriod(from, to);
        const isFiltered = selectedModels.length < ALL_MODELS.length;

        // Always fetch brand domain
        const brandResult = await supabase.from('brands').select('domain').eq('id', brandId).single();
        const domain = brandResult.data?.domain || '';
        if (domain) setBrandDomain(domain);

        if (!isFiltered) {
          // Unfiltered path: use precomputed citation_share_stats
          const [statsResult, prevAvg] = await Promise.all([
            supabase
              .from('citation_share_stats')
              .select('report_date, citation_share, citation_count, total_citations, rank')
              .eq('brand_id', brandId)
              .eq('domain_type', 'brand')
              .gte('report_date', from)
              .lte('report_date', to)
              .order('report_date', { ascending: true }),
            fetchAvgCitationShare(brandId, prevFrom, prevTo),
          ]);

          if (statsResult.error || !statsResult.data || statsResult.data.length === 0) {
            setHasRealData(false); setData(MOCK_DATA); setAvgShare(24.8); setTrend(null);
            return;
          }

          const rows = statsResult.data;
          const chartData = rows.map((row: any) => ({
            date: new Date(row.report_date).toLocaleDateString('en-US', { month: 'short', day: '2-digit' }),
            value: parseFloat((row.citation_share ?? 0).toFixed(1)),
          }));
          const currentAvg = parseFloat((rows.reduce((s: number, r: any) => s + (r.citation_share ?? 0), 0) / rows.length).toFixed(1));
          setData(chartData);
          setAvgShare(currentAvg);
          setHasRealData(true);
          setTrend(prevAvg !== null ? parseFloat((currentAvg - prevAvg).toFixed(1)) : null);
        } else {
          // Filtered path: compute citation share from prompt_results for selected provider(s)
          if (!domain) { setHasRealData(false); setData(MOCK_DATA); setAvgShare(24.8); setTrend(null); return; }

          // Get report IDs + dates for the period
          const { data: reportRows } = await supabase
            .from('daily_reports')
            .select('id, report_date')
            .eq('brand_id', brandId)
            .eq('status', 'completed')
            .gte('report_date', from)
            .lte('report_date', to);

          if (!reportRows || reportRows.length === 0) {
            setHasRealData(false); setData(MOCK_DATA); setAvgShare(24.8); setTrend(null); return;
          }

          const reportIdToDate: Record<string, string> = {};
          for (const r of reportRows) reportIdToDate[r.id] = r.report_date;
          const reportIds = Object.keys(reportIdToDate);

          const { data: prData } = await supabase
            .from('prompt_results')
            .select('daily_report_id, chatgpt_citations')
            .in('provider', selectedModels)
            .in('daily_report_id', reportIds)
            .not('chatgpt_citations', 'is', null);

          if (!prData || prData.length === 0) {
            setHasRealData(false); setData(MOCK_DATA); setAvgShare(24.8); setTrend(null); return;
          }

          // Aggregate per date: brand citations vs total
          const dateAgg: Record<string, { brand: number; total: number }> = {};
          for (const pr of prData) {
            const date = reportIdToDate[pr.daily_report_id];
            if (!date) continue;
            if (!dateAgg[date]) dateAgg[date] = { brand: 0, total: 0 };
            const urls = (pr.chatgpt_citations as string[]) || [];
            dateAgg[date].total += urls.length;
            dateAgg[date].brand += urls.filter(url => {
              try { return new URL(url).hostname.includes(domain); } catch { return false; }
            }).length;
          }

          const chartData = Object.entries(dateAgg)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, { brand, total }]) => ({
              date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: '2-digit' }),
              value: total > 0 ? parseFloat(((brand / total) * 100).toFixed(1)) : 0,
            }));

          if (chartData.length === 0) { setHasRealData(false); setData(MOCK_DATA); setAvgShare(24.8); setTrend(null); return; }

          const currentAvg = parseFloat((chartData.reduce((s, d) => s + d.value, 0) / chartData.length).toFixed(1));
          setData(chartData);
          setAvgShare(currentAvg);
          setHasRealData(true);
          setTrend(null); // Previous period trend for filtered mode not computed
        }
      } catch (err) {
        console.error('Citation share fetch error:', err);
        setHasRealData(false);
        setData(MOCK_DATA);
        setAvgShare(24.8);
        setTrend(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [brandId, timeRange, customDateRange?.from, customDateRange?.to, selectedModels.join(',')]);

  // Helper to ensure exactly 7 equidistant ticks
  const getTicks = (dataset: any[], count: number) => {
    if (dataset.length === 0) return [];
    const result = [];
    const step = (dataset.length - 1) / (count - 1);
    for (let i = 0; i < count; i++) {
      const index = Math.round(i * step);
      if (dataset[index]) {
        result.push(dataset[index].date);
      }
    }
    return [...new Set(result)];
  };

  const ticks = getTicks(data, 7);

  return (
    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col h-full">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-[15px] font-bold text-gray-400 tracking-wide flex items-center gap-2">
            Citation share over time
            <div className="group relative">
               <HelpCircle size={14} className="text-gray-300 cursor-help" />
               <div className="absolute left-0 bottom-full mb-2 w-72 bg-slate-900 text-white text-[10px] p-3 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-xl normal-case font-medium">
                 <p className="font-bold mb-1">What is Citation Share?</p>
                 Citation share shows what percentage of all citations in AI responses point to your website vs competitors.
               </div>
            </div>
            {hasRealData && (
              <span className="ml-1 px-1.5 py-0.5 text-[8px] font-black tracking-widest bg-emerald-100 text-emerald-700 rounded">LIVE DATA</span>
            )}
            {!hasRealData && (
              <span className="ml-1 px-1.5 py-0.5 text-[8px] font-black tracking-widest bg-amber-100 text-amber-600 rounded">SAMPLE</span>
            )}
          </h3>
          {brandDomain && <p className="text-[11px] text-slate-500 mt-0.5 font-medium">Percentage of total citations linking to {brandDomain}</p>}
        </div>

        <div className="text-right flex flex-col items-end gap-1">
           <div className="text-2xl font-black text-brand-brown">
             {isLoading ? '...' : (brandId && !hasRealData ? '–' : `${avgShare}%`)}
           </div>
           <div className="text-[9px] font-black text-gray-400 tracking-wider">Avg. citation share</div>
           {trend != null && hasRealData && (
             <span
               className="text-[9px] font-black px-2 py-0.5 rounded-full inline-flex items-center gap-0.5 border whitespace-nowrap"
               style={trend > 0
                 ? { color: '#16a34a', backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }
                 : trend < 0
                 ? { color: '#7B3218', backgroundColor: 'rgba(231,179,115,0.18)', borderColor: 'rgba(150,61,31,0.25)' }
                 : { color: '#94a3b8', backgroundColor: '#f8fafc', borderColor: '#e2e8f0' }
               }
             >
               {trend > 0 ? '↑' : trend < 0 ? '↓' : '→'}{trend > 0 ? '+' : ''}{trend}% <span className="opacity-70 ml-0.5">vs prev</span>
             </span>
           )}
        </div>
      </div>

      <div className="flex-1 w-full min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-6 h-6 border-2 border-gray-200 border-t-brand-brown rounded-full animate-spin" />
          </div>
        ) : (brandId && !hasRealData) ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-4">
            <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center">
              <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-xs font-semibold text-gray-400">Computing your data…</p>
            <p className="text-[10px] text-gray-300 leading-relaxed">Available after your full analysis completes</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
              <defs>
                <linearGradient id="colorCitation" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2C1308" stopOpacity={0.1}/>
                  <stop offset="95%" stopColor="#2C1308" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 9, fill: '#94a3b8', fontWeight: 600 }}
                axisLine={false}
                tickLine={false}
                tickMargin={10}
                ticks={ticks}
              />
              <YAxis
                tick={{ fontSize: 9, fill: '#94a3b8', fontWeight: 600 }}
                axisLine={false}
                tickLine={false}
                unit="%"
              />
              <Tooltip
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '11px' }}
                itemStyle={{ color: '#2C1308', fontWeight: 800 }}
                formatter={(value: number) => [`${value}%`, 'Share']}
              />
              <Area
                type="linear"
                dataKey="value"
                stroke="#2C1308"
                strokeWidth={3.5}
                fillOpacity={1}
                fill="url(#colorCitation)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};
