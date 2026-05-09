
import React, { useState, useEffect } from 'react';
import { TimeRange, TrendDataPoint } from '../types';
import { supabase } from '../lib/supabase';
import { VisibilityTrend } from './charts/VisibilityTrend';
import { ArrowRight, Globe, Award, MessageSquare, TrendingUp, ExternalLink } from 'lucide-react';

const ALL_MODELS = ['chatgpt', 'google_ai_overview', 'claude'];

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

async function fetchVisibilityByProvider(
  bId: string,
  from: string,
  to: string,
  models: string[]
): Promise<{ date: string; score: number }[]> {
  const { data: reports } = await supabase
    .from('daily_reports')
    .select('report_date, visibility_score, visibility_score_by_provider')
    .eq('brand_id', bId)
    .eq('status', 'completed')
    .gte('report_date', from)
    .lte('report_date', to)
    .order('report_date', { ascending: true });
  if (!reports || reports.length === 0) return [];

  const isAllModels = ALL_MODELS.every(m => models.includes(m)) && models.length === ALL_MODELS.length;

  return reports.map((r: any) => {
    let score: number;
    if (isAllModels) {
      score = r.visibility_score ?? 0;
    } else {
      const byProv = r.visibility_score_by_provider || {};
      const vals = models.map((m: string) => byProv[m]).filter((v: any) => v != null) as number[];
      score = vals.length > 0 ? parseFloat((vals.reduce((a: number, b: number) => a + b, 0) / vals.length).toFixed(1)) : 0;
    }
    return { date: r.report_date as string, score };
  });
}

const MODEL_LABELS: Record<string, string> = {
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  google_ai_overview: 'Google AIO',
};

const MODEL_COLORS: Record<string, string> = {
  chatgpt: '#10a37f',
  claude: '#c7522a',
  google_ai_overview: '#4285f4',
};

const FaviconImg = ({ domain }: { domain: string }) => {
  const [error, setError] = useState(false);
  if (error) return <Globe size={14} className="text-slate-400 shrink-0" />;
  return (
    <img
      src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
      alt=""
      className="w-4 h-4 object-contain rounded-sm shrink-0"
      onError={() => setError(true)}
    />
  );
};

interface OverviewPageProps {
  brandId?: string | null;
  timeRange?: TimeRange;
  customDateRange?: { from: string; to: string };
  selectedModels?: string[];
  brandName?: string;
  onNavigate: (tab: string) => void;
}

export const OverviewPage: React.FC<OverviewPageProps> = ({
  brandId,
  timeRange = TimeRange.THIRTY_DAYS,
  customDateRange,
  selectedModels = ALL_MODELS,
  brandName,
  onNavigate,
}) => {
  // Section 1: Visibility trend
  const [visData, setVisData] = useState<TrendDataPoint[]>([]);
  const [currentScore, setCurrentScore] = useState<number | undefined>();
  const [trendPercent, setTrendPercent] = useState<number | undefined>();
  const [isLoadingVis, setIsLoadingVis] = useState(false);

  // Sections 2+3: SOV entities + percentile rank
  const [entities, setEntities] = useState<{ name: string; mentions: number; type: string }[]>([]);
  const [percentileRank, setPercentileRank] = useState<number | null>(null);
  const [brandMentions, setBrandMentions] = useState<number>(0);
  const [isLoadingSov, setIsLoadingSov] = useState(false);

  // Section 4: Citation sources
  const [citationSources, setCitationSources] = useState<{ domain: string; mentions: number }[]>([]);
  const [isLoadingCitations, setIsLoadingCitations] = useState(false);

  // Section 5: Recent AI responses
  const [recentChats, setRecentChats] = useState<any[]>([]);
  const [isLoadingChats, setIsLoadingChats] = useState(false);

  useEffect(() => {
    if (!brandId) return;
    const { from, to } = getDateRange(timeRange, customDateRange);

    // -- Section 1: Visibility trend --
    const fetchVisibility = async () => {
      setIsLoadingVis(true);
      try {
        const isFiltered = selectedModels.length < ALL_MODELS.length;
        let points: TrendDataPoint[] = [];

        if (isFiltered) {
          const raw = await fetchVisibilityByProvider(brandId, from, to, selectedModels);
          points = raw.map(({ date, score }) => ({
            date: new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            score,
          }));
        } else {
          const { data } = await supabase
            .from('daily_reports')
            .select('report_date, visibility_score')
            .eq('brand_id', brandId)
            .eq('status', 'completed')
            .not('visibility_score', 'is', null)
            .gte('report_date', from)
            .lte('report_date', to)
            .order('report_date', { ascending: true });

          if (data && data.length > 0) {
            const bestByDate = new Map<string, number>();
            data.forEach((row: any) => {
              const score = parseFloat(row.visibility_score) || 0;
              if (score > (bestByDate.get(row.report_date) ?? -1)) bestByDate.set(row.report_date, score);
            });
            points = Array.from(bestByDate.entries())
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([reportDate, score]) => ({
                date: new Date(reportDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                score,
              }));
          }
        }

        if (points.length > 0) {
          setVisData(points);
          const avgScore = points.reduce((sum, p) => sum + p.score, 0) / points.length;
          setCurrentScore(Math.round(avgScore * 10) / 10);
          const first = points[0].score;
          const latest = points[points.length - 1].score;
          setTrendPercent(first > 0 ? parseFloat((((latest - first) / first) * 100).toFixed(1)) : 0);
        } else {
          setVisData([]);
          setCurrentScore(undefined);
          setTrendPercent(undefined);
        }
      } catch (err) {
        console.error('[Overview] Visibility fetch error:', err);
      } finally {
        setIsLoadingVis(false);
      }
    };

    // -- Sections 2+3: SOV entities --
    const fetchSov = async () => {
      setIsLoadingSov(true);
      try {
        const isFiltered = selectedModels.length < ALL_MODELS.length;
        const selectCol = isFiltered ? 'share_of_voice_by_provider' : 'share_of_voice_data';

        const { data: reports } = await supabase
          .from('daily_reports')
          .select(selectCol)
          .eq('brand_id', brandId)
          .eq('status', 'completed')
          .gte('report_date', from)
          .lte('report_date', to);

        if (!reports || reports.length === 0) return;

        const entityMap: Record<string, { name: string; mentions: number; type: string }> = {};
        let totalMentions = 0;

        for (const report of reports as any[]) {
          let sov: any;
          if (isFiltered) {
            const byProv = report.share_of_voice_by_provider as any;
            if (!byProv) continue;
            const em: Record<string, any> = {};
            let t = 0;
            for (const prov of selectedModels) {
              const d = byProv[prov];
              if (!d?.entities) continue;
              for (const e of d.entities) {
                const key = e.name.toLowerCase();
                if (em[key]) em[key].mentions += e.mentions;
                else em[key] = { name: e.name, mentions: e.mentions, type: e.type };
              }
              t += d.total_mentions || 0;
            }
            if (t === 0) continue;
            sov = { entities: Object.values(em), total_mentions: t };
          } else {
            sov = report.share_of_voice_data as any;
          }

          if (!sov?.entities) continue;
          for (const entity of sov.entities) {
            const key = entity.name.toLowerCase();
            if (entityMap[key]) entityMap[key].mentions += entity.mentions;
            else entityMap[key] = { name: entity.name, mentions: entity.mentions, type: entity.type };
          }
          totalMentions += sov.total_mentions || 0;
        }

        if (totalMentions > 0) {
          const sorted = Object.values(entityMap).sort((a, b) => b.mentions - a.mentions);
          setEntities(sorted);

          const brand = sorted.find(e => e.type === 'brand');
          if (brand) {
            setBrandMentions(brand.mentions);
            const countBelow = sorted.filter(e => e.mentions < brand.mentions).length;
            setPercentileRank(Math.round((countBelow / sorted.length) * 100));
          }
        }
      } catch (err) {
        console.error('[Overview] SOV fetch error:', err);
      } finally {
        setIsLoadingSov(false);
      }
    };

    // -- Section 4: Top citation sources --
    const fetchCitations = async () => {
      setIsLoadingCitations(true);
      try {
        const { data: rows, error } = await supabase.rpc('get_citation_sources', {
          p_brand_id: brandId,
          p_from_date: from,
          p_to_date: to,
        });
        if (!error && rows && rows.length > 0) {
          setCitationSources(
            rows.slice(0, 10).map((r: any) => ({
              domain: r.domain || '',
              mentions: Number(r.mentions_count) || 0,
            }))
          );
        } else {
          setCitationSources([]);
        }
      } catch {
        setCitationSources([]);
      } finally {
        setIsLoadingCitations(false);
      }
    };

    // -- Section 5: Recent AI responses --
    const fetchRecentChats = async () => {
      setIsLoadingChats(true);
      try {
        const { data: reportRows } = await supabase
          .from('daily_reports')
          .select('id')
          .eq('brand_id', brandId)
          .eq('status', 'completed')
          .order('report_date', { ascending: false })
          .limit(10);

        if (!reportRows || reportRows.length === 0) return;

        const reportIds = reportRows.map((r: any) => r.id);
        const { data: results } = await supabase
          .from('prompt_results')
          .select('id, prompt_text, provider, brand_mentioned, created_at, chatgpt_response, claude_response, google_ai_overview_response')
          .in('daily_report_id', reportIds)
          .in('provider', selectedModels)
          .not('prompt_text', 'is', null)
          .eq('provider_status', 'ok')
          .order('created_at', { ascending: false })
          .limit(8);

        if (results) setRecentChats(results);
      } catch (err) {
        console.error('[Overview] Recent chats fetch error:', err);
      } finally {
        setIsLoadingChats(false);
      }
    };

    fetchVisibility();
    fetchSov();
    fetchCitations();
    fetchRecentChats();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandId, timeRange, customDateRange?.from, customDateRange?.to, selectedModels.join(',')]);

  const top10Entities = entities.slice(0, 10);
  const maxEntityMentions = top10Entities[0]?.mentions || 1;
  const maxCitationMentions = citationSources[0]?.mentions || 1;

  const Spinner = () => (
    <div className="flex items-center justify-center py-12">
      <div className="w-6 h-6 border-2 border-slate-200 border-t-brand-brown rounded-full animate-spin" />
    </div>
  );

  const SectionHeader = ({
    icon,
    title,
    navTarget,
  }: {
    icon: React.ReactNode;
    title: string;
    navTarget: string;
  }) => (
    <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid #e8edf4' }}>
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-sm font-bold text-slate-700">{title}</span>
      </div>
      <button
        onClick={() => onNavigate(navTarget)}
        className="text-xs text-brand-brown font-medium hover:underline flex items-center gap-1 transition-smooth"
      >
        See all <ArrowRight size={11} />
      </button>
    </div>
  );

  return (
    <div className="space-y-6 pb-12 animate-fadeIn">

      {/* Section 1: Visibility Index Over Time */}
      <div className="h-[370px]">
        <VisibilityTrend
          data={visData.length > 0 ? visData : undefined}
          currentScore={currentScore}
          trendPercent={trendPercent}
          isLoading={isLoadingVis}
          brandId={brandId}
          brandName={brandName}
        />
      </div>

      {/* Row 2: Percentile rank + Top 10 entities */}
      <div className="grid grid-cols-12 gap-6">

        {/* Section 2: Percentile Rank */}
        <div className="col-span-12 md:col-span-4">
          <div className="bg-white rounded-2xl shadow-card p-6 h-full flex flex-col" style={{ border: '1px solid #e8edf4' }}>
            <div className="flex items-center gap-2 mb-4">
              <Award size={15} className="text-brand-brown" />
              <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Percentile Rank</span>
            </div>
            {isLoadingSov ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-slate-200 border-t-brand-brown rounded-full animate-spin" />
              </div>
            ) : percentileRank !== null ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-4">
                <div className="relative w-36 h-36 flex items-center justify-center">
                  <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 120 120">
                    <circle cx="60" cy="60" r="50" fill="none" stroke="#f1f5f9" strokeWidth="10" />
                    <circle
                      cx="60" cy="60" r="50"
                      fill="none"
                      stroke="#874B34"
                      strokeWidth="10"
                      strokeDasharray={`${(percentileRank / 100) * 314.16} 314.16`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="text-center z-10">
                    <div className="text-4xl font-black text-slate-900 leading-none">{percentileRank}<span className="text-xl font-bold text-slate-500">th</span></div>
                    <div className="text-[10px] text-slate-400 font-medium mt-0.5">percentile</div>
                  </div>
                </div>
                <p className="text-xs text-slate-500 text-center leading-relaxed max-w-[180px]">
                  <span className="font-semibold text-slate-700">{brandName || 'Your brand'}</span> outranks{' '}
                  <span className="font-bold text-brand-brown">{percentileRank}%</span> of all entities mentioned by AI
                </p>
                <p className="text-[10px] text-slate-400">{brandMentions.toLocaleString()} total mentions in period</p>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-sm text-slate-400">No data yet</div>
            )}
          </div>
        </div>

        {/* Section 3: Top 10 Entities */}
        <div className="col-span-12 md:col-span-8">
          <div className="bg-white rounded-2xl shadow-card h-full flex flex-col" style={{ border: '1px solid #e8edf4' }}>
            <SectionHeader
              icon={<TrendingUp size={14} className="text-brand-brown" />}
              title="Top Entities in AI Responses"
              navTarget="Competitors"
            />
            <div className="flex-1 px-5 py-4 overflow-auto">
              {isLoadingSov ? (
                <Spinner />
              ) : top10Entities.length > 0 ? (
                <div className="space-y-3">
                  {top10Entities.map((entity, idx) => {
                    const barPct = Math.max(4, Math.round((entity.mentions / maxEntityMentions) * 100));
                    const isBrand = entity.type === 'brand';
                    return (
                      <div key={entity.name} className="flex items-center gap-3">
                        <span className="text-[10px] font-bold text-slate-300 w-4 shrink-0 text-right">{idx + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className={`text-xs font-semibold truncate ${isBrand ? 'text-brand-brown' : 'text-slate-700'}`}>
                                {entity.name}
                              </span>
                              {isBrand && (
                                <span className="shrink-0 text-[9px] bg-brand-brown/10 text-brand-brown rounded px-1.5 py-0.5 font-bold uppercase tracking-wide">
                                  You
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-400 font-medium shrink-0 ml-3">
                              {entity.mentions.toLocaleString()}
                            </span>
                          </div>
                          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-700"
                              style={{
                                width: `${barPct}%`,
                                backgroundColor: isBrand ? '#874B34' : '#cbd5e1',
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-sm text-slate-400">
                  No entity data for this period
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Row 3: Top citations + Recent chats */}
      <div className="grid grid-cols-12 gap-6">

        {/* Section 4: Top 10 Citation Sources */}
        <div className="col-span-12 md:col-span-6">
          <div className="bg-white rounded-2xl shadow-card flex flex-col" style={{ border: '1px solid #e8edf4' }}>
            <SectionHeader
              icon={<ExternalLink size={14} className="text-brand-brown" />}
              title="Top Citation Sources"
              navTarget="Citations"
            />
            <div className="px-5 py-4">
              {isLoadingCitations ? (
                <Spinner />
              ) : citationSources.length > 0 ? (
                <div className="space-y-3">
                  {citationSources.map((source, idx) => {
                    const barPct = Math.max(4, Math.round((source.mentions / maxCitationMentions) * 100));
                    return (
                      <div key={source.domain} className="flex items-center gap-3">
                        <span className="text-[10px] font-bold text-slate-300 w-4 shrink-0 text-right">{idx + 1}</span>
                        <FaviconImg domain={source.domain} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-semibold text-slate-700 truncate">{source.domain}</span>
                            <span className="text-[10px] text-slate-400 font-medium shrink-0 ml-3">
                              {source.mentions.toLocaleString()}
                            </span>
                          </div>
                          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full bg-indigo-300 transition-all duration-700"
                              style={{ width: `${barPct}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex items-center justify-center py-8 text-sm text-slate-400">
                  No citation data for this period
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Section 5: Recent AI Responses */}
        <div className="col-span-12 md:col-span-6">
          <div className="bg-white rounded-2xl shadow-card flex flex-col" style={{ border: '1px solid #e8edf4' }}>
            <SectionHeader
              icon={<MessageSquare size={14} className="text-brand-brown" />}
              title="Recent AI Responses"
              navTarget="Prompts"
            />
            {isLoadingChats ? (
              <Spinner />
            ) : recentChats.length > 0 ? (
              <div className="divide-y divide-slate-50">
                {recentChats.slice(0, 6).map((chat) => {
                  const response =
                    chat.chatgpt_response ||
                    chat.claude_response ||
                    chat.google_ai_overview_response ||
                    '';
                  const preview = response.slice(0, 110).trim() + (response.length > 110 ? '…' : '');
                  const dateStr = new Date(chat.created_at).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  });
                  return (
                    <div key={chat.id} className="px-5 py-3.5 hover:bg-slate-50/70 transition-colors">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <span className="text-xs font-semibold text-slate-700 line-clamp-1 flex-1 leading-snug">
                          {(chat.prompt_text || '').slice(0, 70)}
                          {(chat.prompt_text?.length || 0) > 70 ? '…' : ''}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                          <span
                            className="text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white leading-none"
                            style={{ backgroundColor: MODEL_COLORS[chat.provider] || '#64748b' }}
                          >
                            {MODEL_LABELS[chat.provider] || chat.provider}
                          </span>
                          <span
                            className={`w-1.5 h-1.5 rounded-full shrink-0 ${chat.brand_mentioned ? 'bg-green-400' : 'bg-slate-200'}`}
                            title={chat.brand_mentioned ? 'Brand mentioned' : 'Not mentioned'}
                          />
                        </div>
                      </div>
                      {preview && (
                        <p className="text-[10px] text-slate-400 leading-relaxed line-clamp-2">{preview}</p>
                      )}
                      <span className="text-[9px] text-slate-300 mt-1 block">{dateStr}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex items-center justify-center py-8 text-sm text-slate-400">
                No recent responses
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
