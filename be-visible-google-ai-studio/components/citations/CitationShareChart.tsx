
import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { HelpCircle } from 'lucide-react';
import { TimeRange } from '../../types';
import { supabase } from '../../lib/supabase';

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

export const CitationShareChart: React.FC<CitationShareChartProps> = ({ brandId, timeRange = TimeRange.THIRTY_DAYS }) => {
  const [data, setData] = useState(MOCK_DATA);
  const [avgShare, setAvgShare] = useState(24.8);
  const [brandDomain, setBrandDomain] = useState('incredibuild.com');
  const [isLoading, setIsLoading] = useState(false);
  const [hasRealData, setHasRealData] = useState(false);

  useEffect(() => {
    if (!brandId) {
      setData(MOCK_DATA);
      setAvgShare(24.8);
      setBrandDomain('incredibuild.com');
      setHasRealData(false);
      return;
    }

    const fetchData = async () => {
      setIsLoading(true);
      try {
        const { from, to } = getDateRange(timeRange);

        const [statsResult, brandResult] = await Promise.all([
          supabase
            .from('citation_share_stats')
            .select('report_date, citation_share, citation_count, total_citations, rank')
            .eq('brand_id', brandId)
            .eq('domain_type', 'brand')
            .gte('report_date', from)
            .lte('report_date', to)
            .order('report_date', { ascending: true }),
          supabase
            .from('brands')
            .select('domain')
            .eq('id', brandId)
            .single(),
        ]);

        if (brandResult.data?.domain) {
          setBrandDomain(brandResult.data.domain);
        }

        if (statsResult.error) {
          console.error('Error fetching citation share stats:', statsResult.error);
          setHasRealData(false);
          setData(MOCK_DATA);
          setAvgShare(24.8);
          setIsLoading(false);
          return;
        }

        const rows = statsResult.data || [];
        if (rows.length === 0) {
          setHasRealData(false);
          setData(MOCK_DATA);
          setAvgShare(24.8);
          setIsLoading(false);
          return;
        }

        const chartData = rows.map((row: any) => {
          const d = new Date(row.report_date);
          const formatted = d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
          return { date: formatted, value: parseFloat((row.citation_share ?? 0).toFixed(1)) };
        });

        const avg = rows.reduce((sum: number, r: any) => sum + (r.citation_share ?? 0), 0) / rows.length;

        setData(chartData);
        setAvgShare(parseFloat(avg.toFixed(1)));
        setHasRealData(true);
      } catch (err) {
        console.error('Citation share fetch error:', err);
        setHasRealData(false);
        setData(MOCK_DATA);
        setAvgShare(24.8);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [brandId, timeRange]);

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
          <p className="text-[11px] text-slate-500 mt-0.5 font-medium">Percentage of total citations linking to {brandDomain}</p>
        </div>

        <div className="text-right">
           <div className="text-2xl font-black text-brand-brown">
             {isLoading ? '...' : `${avgShare}%`}
           </div>
           <div className="text-[9px] font-black text-gray-400 tracking-wider">Avg. citation share</div>
        </div>
      </div>

      <div className="flex-1 w-full min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-6 h-6 border-2 border-gray-200 border-t-brand-brown rounded-full animate-spin" />
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
