import React, { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, Cell, PieChart, Pie, LabelList
} from 'recharts';
import { TrendingUp, HelpCircle, Plus, Check, Loader2, Radar } from 'lucide-react';
import { TimeRange, Competitor } from '../types';
import { supabase } from '../lib/supabase';

// Competitor color palette
const COMPETITOR_COLORS = ['#FFBD00', '#FB5607', '#D90226', '#970E33', '#481643'];

// Mock data used when no real data is available
const MOCK_COMPETITORS = [
  { name: 'Incredibuild', score: 94, mentionRate: 78, voice: 45, citation: 35, color: '#FFBD00', website: 'incredibuild.com' },
  { name: 'GitLab CI', score: 82, mentionRate: 65, voice: 25, citation: 22, color: '#FB5607', website: 'gitlab.com' },
  { name: 'CircleCI', score: 79, mentionRate: 61, voice: 15, citation: 18, color: '#D90226', website: 'circleci.com' },
  { name: 'Travis CI', score: 71, mentionRate: 52, voice: 10, citation: 15, color: '#970E33', website: 'travis-ci.com' },
  { name: 'Jenkins', score: 65, mentionRate: 48, voice: 5, citation: 10, color: '#481643', website: 'jenkins.io' },
];

const MOCK_TREND = [
  { date: 'Dec 10', Incredibuild: 72, 'GitLab CI': 78, CircleCI: 70, 'Travis CI': 62, Jenkins: 60 },
  { date: 'Dec 15', Incredibuild: 75, 'GitLab CI': 79, CircleCI: 71, 'Travis CI': 63, Jenkins: 61 },
  { date: 'Dec 20', Incredibuild: 80, 'GitLab CI': 80, CircleCI: 73, 'Travis CI': 65, Jenkins: 62 },
  { date: 'Dec 25', Incredibuild: 88, 'GitLab CI': 81, CircleCI: 76, 'Travis CI': 68, Jenkins: 63 },
  { date: 'Dec 30', Incredibuild: 91, 'GitLab CI': 82, CircleCI: 78, 'Travis CI': 70, Jenkins: 64 },
  { date: 'Jan 03', Incredibuild: 94, 'GitLab CI': 82, CircleCI: 79, 'Travis CI': 71, Jenkins: 65 },
];

interface DetectedEntity {
  name: string;
  mentionRate: number;
  visibilityScore: number;
  visibilityIndex?: number;
}

const ALL_MODELS = ['chatgpt', 'google_ai_overview', 'claude'];

interface CompetitorsPageProps {
  brandId?: string | null;
  timeRange?: TimeRange;
  competitors?: Competitor[];
  onAddCompetitor?: (comp: Competitor) => void;
  selectedModels?: string[];
  customDateRange?: { from: string; to: string };
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
  trend?: number | null;
}

function getDateRange(timeRange: TimeRange, customDateRange?: { from: string; to: string }): { from: string; to: string } {
  if (customDateRange) return customDateRange;
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

const COMP_COLORS = ['#FFBD00', '#FB5607', '#D90226', '#970E33', '#481643', '#64748b'];

// Small trend badge — green for improvement, warm orange/brown for deterioration
const TrendBadge = ({ trend, size = 'sm' }: { trend: number | null | undefined; size?: 'sm' | 'xs' }) => {
  if (trend == null) return null;
  const fontSize = size === 'xs' ? '7px' : '8px';
  const px = size === 'xs' ? '4px' : '5px';
  const style: React.CSSProperties = trend > 0
    ? { color: '#16a34a', backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }
    : trend < 0
    ? { color: '#7B3218', backgroundColor: 'rgba(231,179,115,0.18)', borderColor: 'rgba(150,61,31,0.25)' }
    : { color: '#94a3b8', backgroundColor: '#f8fafc', borderColor: '#e2e8f0' };
  return (
    <span
      className="font-black rounded-full inline-flex items-center border whitespace-nowrap"
      style={{ ...style, fontSize, padding: `1px ${px}` }}
    >
      {trend > 0 ? '↑+' : trend < 0 ? '↓' : '→'}{Math.abs(trend)}%
    </span>
  );
};

export const CompetitorsPage: React.FC<CompetitorsPageProps> = ({
  brandId, timeRange = TimeRange.THIRTY_DAYS, competitors = [], onAddCompetitor,
  selectedModels = ALL_MODELS, customDateRange,
}) => {
  // SOV state
  const [sovSlices, setSovSlices] = useState<SovSlice[]>([]);
  const [sovBrandPct, setSovBrandPct] = useState<number>(45);
  const [sovEntityTrends, setSovEntityTrends] = useState<Record<string, number | null>>({});
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

  // Detected entities state
  const [detectedEntities, setDetectedEntities] = useState<DetectedEntity[]>([]);
  const [brandInEntities, setBrandInEntities] = useState<{ name: string; mentionRate: number; visibilityIndex: number | undefined; insertIndex: number } | null>(null);
  const [isLoadingEntities, setIsLoadingEntities] = useState(false);
  const [addingEntity, setAddingEntity] = useState<string | null>(null);
  const [addedEntities, setAddedEntities] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!brandId) return;

    const { from, to } = getDateRange(timeRange, customDateRange);
    const { from: prevFrom, to: prevTo } = getPreviousPeriod(from, to);
    const isFiltered = selectedModels.length < ALL_MODELS.length;
    // When filtered to a single provider, use that; otherwise merge all selected providers
    const activeProvider = isFiltered && selectedModels.length === 1 ? selectedModels[0] : null;

    // Fetch share of voice + detected entities + SOV trends
    const fetchShareOfVoice = async () => {
      setIsLoadingSov(true);
      setIsLoadingEntities(true);
      try {
        // When filtered, read share_of_voice_by_provider; otherwise read combined share_of_voice_data
        const sovColumn = isFiltered ? 'share_of_voice_by_provider' : 'share_of_voice_data';
        const [{ data: reports, error }, { data: prevReports }] = await Promise.all([
          supabase
            .from('daily_reports')
            .select(isFiltered ? 'share_of_voice_by_provider' : 'share_of_voice_data')
            .eq('brand_id', brandId)
            .eq('status', 'completed')
            .not(sovColumn, 'is', null)
            .gte('report_date', from)
            .lte('report_date', to),
          supabase
            .from('daily_reports')
            .select(isFiltered ? 'share_of_voice_by_provider' : 'share_of_voice_data')
            .eq('brand_id', brandId)
            .eq('status', 'completed')
            .not(sovColumn, 'is', null)
            .gte('report_date', prevFrom)
            .lte('report_date', prevTo),
        ]);

        if (error || !reports || reports.length === 0) {
          setHasRealSov(false);
          setDetectedEntities([]);
          return;
        }

        const totalReports = reports.length;
        const entityMap: Record<string, { name: string; mentions: number; type: string; reportCount: number; positionScoreSum: number }> = {};
        let totalMentions = 0;
        let totalResponses = 0;

        for (const report of reports) {
          // When filtered: merge selected providers from share_of_voice_by_provider
          let sov: any;
          if (isFiltered) {
            const byProvider = report.share_of_voice_by_provider as any;
            if (!byProvider) continue;
            // Merge entities across selected providers
            const mergedMap: Record<string, { name: string; mentions: number; type: string }> = {};
            let mergedTotal = 0;
            for (const provider of selectedModels) {
              const provSov = byProvider[provider];
              if (!provSov?.entities) continue;
              for (const entity of provSov.entities) {
                const key = entity.name.toLowerCase();
                if (mergedMap[key]) {
                  mergedMap[key].mentions += entity.mentions;
                } else {
                  mergedMap[key] = { name: entity.name, mentions: entity.mentions, type: entity.type };
                }
              }
              mergedTotal += provSov.total_mentions || 0;
            }
            sov = { entities: Object.values(mergedMap), total_mentions: mergedTotal };
          } else {
            sov = report.share_of_voice_data as any;
          }
          if (!sov?.entities) continue;
          const seenInReport = new Set<string>();
          for (const entity of sov.entities) {
            const key = entity.name.toLowerCase();
            if (entityMap[key]) {
              entityMap[key].mentions += entity.mentions;
              entityMap[key].positionScoreSum += entity.position_score_sum || 0;
            } else {
              entityMap[key] = { name: entity.name, mentions: entity.mentions, type: entity.type, reportCount: 0, positionScoreSum: entity.position_score_sum || 0 };
            }
            if (!seenInReport.has(key)) {
              entityMap[key].reportCount++;
              seenInReport.add(key);
            }
          }
          totalMentions += sov.total_mentions || 0;
          totalResponses += sov.total_responses || 0;
        }

        if (totalMentions === 0) { setHasRealSov(false); return; }

        const entities = Object.values(entityMap).sort((a, b) => b.mentions - a.mentions);
        const brand = entities.find(e => e.type === 'brand');
        const trackedComps = entities.filter(e => e.type === 'competitor');
        const others = entities.filter(e => e.type === 'other');
        const otherMentions = others.reduce((sum, e) => sum + e.mentions, 0);

        // ── SOV slices ──
        const slices: SovSlice[] = [];
        let colorIdx = 0;
        if (brand) slices.push({ name: brand.name, voice: parseFloat(((brand.mentions / totalMentions) * 100).toFixed(2)), color: COMPETITOR_COLORS[colorIdx++ % COMPETITOR_COLORS.length] });
        for (const comp of trackedComps) {
          const pct = parseFloat(((comp.mentions / totalMentions) * 100).toFixed(2));
          // Always include registered competitors so they appear in the legend, even at 0%
          slices.push({ name: comp.name, voice: pct, color: COMPETITOR_COLORS[colorIdx++ % COMPETITOR_COLORS.length] });
        }
        if (otherMentions > 0) {
          const pct = parseFloat(((otherMentions / totalMentions) * 100).toFixed(2));
          if (pct > 0) slices.push({ name: 'Other', voice: pct, color: '#94a3b8' });
        }

        setSovSlices(slices);
        setSovBrandPct(slices[0]?.voice ?? 0);
        setHasRealSov(true);

        // ── Previous period SOV for trends ──
        const prevEntityPcts: Record<string, number> = {};
        if (prevReports && prevReports.length > 0) {
          const prevTempMap: Record<string, number> = {};
          let prevTotal = 0;
          for (const report of prevReports) {
            let sov: any;
            if (isFiltered) {
              const byProvider = report.share_of_voice_by_provider as any;
              if (!byProvider) continue;
              const mergedMap: Record<string, number> = {};
              let mergedTotal = 0;
              for (const provider of selectedModels) {
                const provSov = byProvider[provider];
                if (!provSov?.entities) continue;
                for (const entity of provSov.entities) {
                  const key = entity.name.toLowerCase();
                  mergedMap[key] = (mergedMap[key] || 0) + entity.mentions;
                }
                mergedTotal += provSov.total_mentions || 0;
              }
              sov = { entities: Object.entries(mergedMap).map(([k, v]) => ({ name: k, mentions: v })), total_mentions: mergedTotal };
            } else {
              sov = report.share_of_voice_data as any;
            }
            if (!sov?.entities) continue;
            for (const entity of sov.entities) {
              const key = entity.name.toLowerCase();
              prevTempMap[key] = (prevTempMap[key] || 0) + entity.mentions;
            }
            prevTotal += sov.total_mentions || 0;
          }
          if (prevTotal > 0) {
            Object.entries(prevTempMap).forEach(([key, mentions]) => {
              prevEntityPcts[key] = Math.round((mentions / prevTotal) * 100);
            });
          }
        }

        const trends: Record<string, number | null> = {};
        for (const slice of slices) {
          const key = slice.name.toLowerCase();
          const prev = prevEntityPcts[key];
          trends[slice.name] = prev !== undefined ? slice.voice - prev : null;
        }
        setSovEntityTrends(trends);

        // ── Detected entities ──
        // Compute raw_score per entity (same formula as visibility-index-calculator.js)
        // then compute percentile rank among ALL entities (same scale as daily_reports.visibility_score)
        const allEntityList = Object.values(entityMap);
        const N = allEntityList.length;
        const entityRawScores: Record<string, number> = {};
        if (totalResponses > 0) {
          for (const e of allEntityList) {
            entityRawScores[e.name.toLowerCase()] = 0.5 * (e.mentions / totalResponses) + 0.5 * (e.positionScoreSum / totalResponses);
          }
        }
        const getPercentile = (key: string): number | undefined => {
          if (totalResponses === 0 || N === 0) return undefined;
          const raw = entityRawScores[key] ?? 0;
          const lowerCount = Object.values(entityRawScores).filter(r => r < raw).length;
          return N > 1 ? Math.round((lowerCount / (N - 1)) * 100) : 100;
        };

        const detected: DetectedEntity[] = entities
          .filter(e => e.type !== 'brand')
          .map(e => ({
            name: e.name,
            mentionRate: parseFloat((Math.min(100, totalResponses > 0 ? (e.mentions / totalResponses) * 100 : 0)).toFixed(1)),
            visibilityScore: Math.round((e.mentions / totalMentions) * 100),
            visibilityIndex: getPercentile(e.name.toLowerCase()),
          }))
          .sort((a, b) => (b.visibilityIndex ?? 0) - (a.visibilityIndex ?? 0));

        // Brand position indicator in the detected entities list
        if (brand && totalResponses > 0) {
          const brandMentionRate = parseFloat((Math.min(100, (brand.mentions / totalResponses) * 100)).toFixed(1));
          const brandVisibility = getPercentile(brand.name.toLowerCase());
          const insertIndex = detected.findIndex(e => (e.visibilityIndex ?? 0) < (brandVisibility ?? 0));
          setBrandInEntities({
            name: brand.name,
            mentionRate: brandMentionRate,
            visibilityIndex: brandVisibility,
            insertIndex: insertIndex === -1 ? detected.length : insertIndex,
          });
        } else {
          setBrandInEntities(null);
        }

        setDetectedEntities(detected);
      } catch (err) {
        console.error('Competitors SOV fetch error:', err);
        setHasRealSov(false);
      } finally {
        setIsLoadingSov(false);
        setIsLoadingEntities(false);
      }
    };

    // Fetch competitor metrics (visibility trend, mention rate, citation share) + previous period trends
    const fetchCompetitorMetrics = async () => {
      setIsLoadingMetrics(true);

      // Compute percentile-based visibility index from SOV data — same formula as Detected Entities
      const computeEntityIndexFromSov = (sov: any, entityName: string): number => {
        if (!sov?.entities?.length || !sov.total_responses) return 0;
        const totalResp = sov.total_responses as number;
        const rawScores: Record<string, number> = {};
        for (const e of sov.entities as any[]) {
          rawScores[e.name.toLowerCase()] =
            0.5 * ((e.mentions || 0) / totalResp) +
            0.5 * ((e.position_score_sum || 0) / totalResp);
        }
        const N = Object.keys(rawScores).length;
        if (N === 0) return 0;
        const key = entityName.toLowerCase();
        const raw = rawScores[key] ?? 0;
        const lowerCount = Object.values(rawScores).filter(r => r < raw).length;
        return N > 1 ? Math.round((lowerCount / (N - 1)) * 100) : (raw > 0 ? 100 : 0);
      };

      try {
        const [{ data: reports, error }, { data: prevReports }] = await Promise.all([
          supabase
            .from('daily_reports')
            .select('report_date, competitor_metrics, share_of_voice_data')
            .eq('brand_id', brandId)
            .eq('status', 'completed')
            .not('competitor_metrics', 'is', null)
            .gte('report_date', from)
            .lte('report_date', to)
            .order('report_date', { ascending: true }),
          supabase
            .from('daily_reports')
            .select('competitor_metrics')
            .eq('brand_id', brandId)
            .eq('status', 'completed')
            .not('competitor_metrics', 'is', null)
            .gte('report_date', prevFrom)
            .lte('report_date', prevTo),
        ]);

        if (error || !reports || reports.length === 0) {
          setHasRealMetrics(false);
          return;
        }

        // Helper: build a zero-metrics object (provider had no results for this report)
        const zeroSlice = (cm: any) => ({
          brand_visibility_score: 0,
          brand_mention_count: 0,
          total_responses: 0,
          brand_citation_share: null,
          competitors: (cm?.competitors || []).map((c: any) => ({
            ...c, visibility_score: 0, mention_rate: 0, mention_count: 0, total_responses: 0, citation_share: null,
          })),
        });

        // Helper: extract the relevant metrics slice from a competitor_metrics blob
        // When filtered to specific models, use by_provider data; otherwise use combined
        const getMetricsSlice = (cm: any): any => {
          if (!cm) return null;
          // No model filter → combined data
          if (!isFiltered) return cm;
          // Old report without per-provider breakdown → no data available for this filter; exclude it
          if (!cm.by_provider) return null;

          if (selectedModels.length === 1) {
            const provData = cm.by_provider[selectedModels[0]];
            // Provider ran but had no results → return zeros (don't fall back to combined)
            return provData ?? zeroSlice(cm);
          }

          // Multiple providers selected — merge only the ones that have data
          const provs = selectedModels.map((p: string) => cm.by_provider[p]).filter(Boolean);
          if (provs.length === 0) return zeroSlice(cm);

          let brandMentions = 0, totalResp = 0;
          const compMentions: Record<string, number> = {};
          for (const p of provs) {
            brandMentions += p.brand_mention_count || 0;
            totalResp += p.total_responses || 0;
            for (const c of (p.competitors || [])) {
              compMentions[c.name] = (compMentions[c.name] || 0) + (c.mention_count || 0);
            }
          }
          const brandVis = totalResp > 0 ? parseFloat(((brandMentions / totalResp) * 100).toFixed(1)) : 0;
          const firstProv = provs[0];
          return {
            brand_visibility_score: brandVis,
            brand_mention_count: brandMentions,
            total_responses: totalResp,
            brand_citation_share: cm.brand_citation_share,
            competitors: (firstProv.competitors || []).map((c: any) => ({
              ...c,
              mention_count: compMentions[c.name] || 0,
              total_responses: totalResp,
              visibility_score: totalResp > 0 ? parseFloat((((compMentions[c.name] || 0) / totalResp) * 100).toFixed(1)) : 0,
              citation_share: (cm.competitors || []).find((orig: any) => orig.name === c.name)?.citation_share ?? null,
            })),
          };
        };

        // Deduplicate by report_date (pick report with highest combined brand_visibility_score)
        const bestByDate = new Map<string, any>();
        for (const r of reports) {
          const cm = r.competitor_metrics as any;
          const score = cm?.brand_visibility_score ?? -1;
          const existing = bestByDate.get(r.report_date);
          const existingScore = (existing?.competitor_metrics as any)?.brand_visibility_score ?? -1;
          if (score > existingScore) bestByDate.set(r.report_date, r);
        }
        const dedupedReports = Array.from(bestByDate.values())
          .sort((a, b) => a.report_date.localeCompare(b.report_date));

        // Use combined competitor list for names (always available regardless of filter)
        const firstCm = dedupedReports[0].competitor_metrics as any;
        const compNames = (firstCm?.competitors || []).map((c: any) => c.name);
        setCompetitorNames(compNames);

        const { data: brandData } = await supabase.from('brands').select('name').eq('id', brandId).single();
        const bName = brandData?.name || 'Brand';
        setBrandName(bName);

        // Build trend line data using SOV-derived visibility index (same as Detected Entities)
        const trend: any[] = dedupedReports.map(r => {
          const sov = (r as any).share_of_voice_data;
          const slice = getMetricsSlice(r.competitor_metrics as any);
          const dateLabel = new Date(r.report_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          const point: any = { date: dateLabel };
          point[bName] = computeEntityIndexFromSov(sov, bName);
          for (const comp of (slice?.competitors || [])) {
            point[comp.name] = computeEntityIndexFromSov(sov, comp.name);
          }
          return point;
        });
        setTrendData(trend);

        // Aggregate current period mention rates and citation shares
        const allNames = [bName, ...compNames];
        const mentionAgg: Record<string, { totalMentions: number; totalResponses: number }> = {};
        const citationAgg: Record<string, { totalShare: number; count: number }> = {};
        for (const name of allNames) {
          mentionAgg[name] = { totalMentions: 0, totalResponses: 0 };
          citationAgg[name] = { totalShare: 0, count: 0 };
        }
        for (const r of dedupedReports) {
          const slice = getMetricsSlice(r.competitor_metrics as any);
          if (!slice) continue;
          mentionAgg[bName].totalMentions += slice.brand_mention_count || 0;
          mentionAgg[bName].totalResponses += slice.total_responses || 0;
          if (slice.brand_citation_share != null) {
            citationAgg[bName].totalShare += slice.brand_citation_share;
            citationAgg[bName].count++;
          }
          for (const comp of (slice.competitors || [])) {
            if (mentionAgg[comp.name]) {
              mentionAgg[comp.name].totalMentions += comp.mention_count || 0;
              mentionAgg[comp.name].totalResponses += comp.total_responses || 0;
            }
            if (citationAgg[comp.name] && comp.citation_share != null) {
              citationAgg[comp.name].totalShare += comp.citation_share;
              citationAgg[comp.name].count++;
            }
          }
        }

        // Aggregate previous period
        const prevMentionAgg: Record<string, { totalMentions: number; totalResponses: number }> = {};
        const prevCitationAgg: Record<string, { totalShare: number; count: number }> = {};
        for (const name of allNames) {
          prevMentionAgg[name] = { totalMentions: 0, totalResponses: 0 };
          prevCitationAgg[name] = { totalShare: 0, count: 0 };
        }
        if (prevReports && prevReports.length > 0) {
          for (const r of prevReports) {
            const slice = getMetricsSlice(r.competitor_metrics as any);
            if (!slice) continue;
            prevMentionAgg[bName].totalMentions += slice.brand_mention_count || 0;
            prevMentionAgg[bName].totalResponses += slice.total_responses || 0;
            if (slice.brand_citation_share != null) {
              prevCitationAgg[bName].totalShare += slice.brand_citation_share;
              prevCitationAgg[bName].count++;
            }
            for (const comp of (slice.competitors || [])) {
              if (prevMentionAgg[comp.name]) {
                prevMentionAgg[comp.name].totalMentions += comp.mention_count || 0;
                prevMentionAgg[comp.name].totalResponses += comp.total_responses || 0;
              }
              if (prevCitationAgg[comp.name] && comp.citation_share != null) {
                prevCitationAgg[comp.name].totalShare += comp.citation_share;
                prevCitationAgg[comp.name].count++;
              }
            }
          }
        }

        // Build mention rows with trends
        const mentionRows: CompetitorRow[] = allNames.map((name, idx) => {
          const agg = mentionAgg[name];
          const currRate = agg.totalResponses > 0 ? parseFloat(((agg.totalMentions / agg.totalResponses) * 100).toFixed(2)) : 0;
          const prevAgg = prevMentionAgg[name];
          const prevRate = prevAgg && prevAgg.totalResponses > 0
            ? parseFloat(((prevAgg.totalMentions / prevAgg.totalResponses) * 100).toFixed(2))
            : null;
          return {
            name,
            mentionRate: currRate,
            citation: 0,
            color: COMPETITOR_COLORS[idx % COMPETITOR_COLORS.length],
            website: '',
            trend: prevRate !== null ? currRate - prevRate : null,
          };
        }).sort((a, b) => b.mentionRate - a.mentionRate);
        setMentionData(mentionRows);

        // Build citation rows with trends
        const citationRows: CompetitorRow[] = allNames.map((name, idx) => {
          const agg = citationAgg[name];
          const currShare = agg.count > 0 ? parseFloat((agg.totalShare / agg.count).toFixed(1)) : 0;
          const prevAgg = prevCitationAgg[name];
          const prevShare = prevAgg && prevAgg.count > 0
            ? parseFloat((prevAgg.totalShare / prevAgg.count).toFixed(1))
            : null;
          return {
            name,
            mentionRate: 0,
            citation: currShare,
            color: COMPETITOR_COLORS[idx % COMPETITOR_COLORS.length],
            website: '',
            trend: prevShare !== null ? parseFloat((currShare - prevShare).toFixed(1)) : null,
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
  }, [brandId, timeRange, customDateRange?.from, customDateRange?.to, selectedModels.join(',')]);

  const showSample = !brandId;

  const allPieData = hasRealSov ? sovSlices : (showSample ? MOCK_COMPETITORS.map(c => ({ name: c.name, voice: c.voice, color: c.color })) : []);
  // Pie chart only renders visible slices; 0% entries appear in the legend only
  const pieData = allPieData.filter(d => d.voice > 0);
  const centerPct = hasRealSov ? sovBrandPct : (showSample ? 45 : 0);

  const activeTrend = hasRealMetrics ? trendData : (showSample ? MOCK_TREND : []);
  const activeMention = hasRealMetrics ? mentionData : (showSample ? MOCK_COMPETITORS.map((c, i) => ({ ...c, color: COMPETITOR_COLORS[i % COMPETITOR_COLORS.length] })) : []);
  const activeCitation = hasRealMetrics ? citationData : (showSample ? MOCK_COMPETITORS.map((c, i) => ({ ...c, color: COMPETITOR_COLORS[i % COMPETITOR_COLORS.length] })) : []);

  const trendLineKeys = hasRealMetrics
    ? [brandName, ...competitorNames]
    : (showSample ? ['Incredibuild', 'GitLab CI', 'CircleCI', 'Travis CI', 'Jenkins'] : []);

  const allTrendValues = activeTrend.flatMap(point =>
    trendLineKeys.map(key => (point as any)[key] as number).filter(v => v !== undefined)
  );
  const minTrend = allTrendValues.length > 0 ? Math.max(0, Math.floor(Math.min(...allTrendValues) / 10) * 10 - 10) : 0;
  const maxTrend = allTrendValues.length > 0 ? Math.min(100, Math.ceil(Math.max(...allTrendValues) / 10) * 10 + 10) : 100;

  // Custom bar label with trend
  const renderMentionLabel = (mentionRows: CompetitorRow[]) => (props: any) => {
    const { x, y, width, value, index } = props;
    const trend = mentionRows[index]?.trend;
    const hasTrend = trend != null;
    return (
      <g>
        <text x={x + width / 2} y={y - (hasTrend ? 20 : 12)} fill="#475569" fontSize="9" fontWeight="800" textAnchor="middle" fontFamily="inherit">
          {value}%
        </text>
        {hasTrend && (
          <text
            x={x + width / 2}
            y={y - 6}
            fill={trend! > 0 ? '#16a34a' : trend! < 0 ? '#7B3218' : '#94a3b8'}
            fontSize="8"
            fontWeight="800"
            textAnchor="middle"
            fontFamily="inherit"
          >
            {trend! > 0 ? '↑+' : trend! < 0 ? '↓' : '→'}{Math.abs(trend!)}%
          </text>
        )}
      </g>
    );
  };

  const handleAddAsCompetitor = async (entityName: string) => {
    if (!brandId || !onAddCompetitor) return;
    setAddingEntity(entityName);
    try {
      let website = '';
      try {
        const res = await fetch('/api/resolve-competitor-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brandId, entityName }),
        });
        if (res.ok) {
          const json = await res.json();
          website = json.url || '';
        }
      } catch {}

      const { data, error } = await supabase
        .from('brand_competitors')
        .upsert({
          brand_id: brandId,
          competitor_name: entityName,
          website,
          is_active: true,
          display_order: competitors.length + 1,
        }, { onConflict: 'brand_id,competitor_name' })
        .select('id')
        .single();

      if (error) { console.error('Failed to add competitor:', error); return; }

      const color = COMP_COLORS[competitors.length % COMP_COLORS.length];
      onAddCompetitor({ id: data?.id || `comp-${Date.now()}`, name: entityName, website, color });
      setAddedEntities(prev => new Set(prev).add(entityName.toLowerCase()));
    } catch (err) {
      console.error('Add competitor error:', err);
    } finally {
      setAddingEntity(null);
    }
  };

  const trackedNames = new Set([
    ...competitors.map(c => c.name.toLowerCase()),
    ...Array.from(addedEntities),
  ]);

  const ComputingPlaceholder = () => (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-4">
      <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center">
        <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <p className="text-xs font-semibold text-gray-400">Computing your data…</p>
      <p className="text-[10px] text-gray-300 leading-relaxed">Available after your full analysis completes</p>
    </div>
  );

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      <div className="grid grid-cols-12 gap-6 items-stretch">
        {/* Visibility Trend vs Competitors */}
        <div className="col-span-12 lg:col-span-8 bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col h-[420px]">
          <div className="flex items-start justify-between mb-4">
            <div className="space-y-1">
              <h3 className="text-[15px] font-bold text-gray-400 tracking-wide flex items-center gap-2">
                Visibility index vs competitors
                <HelpCircle size={14} className="text-gray-300" />
              </h3>
              <p className="text-[11px] text-slate-500 font-medium mt-0.5">Cross-model visibility growth comparison</p>
            </div>
            <div className="flex items-center gap-2">
              {isLoadingMetrics ? (
                <span className="text-[9px] font-bold text-amber-500 bg-amber-50 px-2 py-0.5 rounded-full animate-pulse">LOADING</span>
              ) : hasRealMetrics ? (
                <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">LIVE DATA</span>
              ) : brandId ? (
                <span className="text-[9px] font-bold text-amber-500 bg-amber-50 px-2 py-0.5 rounded-full">COMPUTING</span>
              ) : (
                <span className="text-[9px] font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full">SAMPLE</span>
              )}
              <TrendingUp size={16} className="text-slate-200" />
            </div>
          </div>
          <div className="flex-1 min-h-0">
            {!isLoadingMetrics && !hasRealMetrics && !showSample ? <ComputingPlaceholder /> : (
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
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip
                  contentStyle={{ borderRadius: '10px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: '11px', padding: '8px 12px' }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div style={{ background: 'white', borderRadius: '10px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', padding: '8px 12px', fontSize: '11px', border: '1px solid #f1f5f9' }}>
                        <p style={{ color: '#94a3b8', fontWeight: 600, fontSize: '10px', marginBottom: '6px' }}>{label}</p>
                        {payload.map((entry: any) => (
                          <div key={entry.dataKey} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: entry.color, display: 'inline-block', flexShrink: 0 }} />
                            <span style={{ fontWeight: 700, color: '#475569' }}>{entry.dataKey}:</span>
                            <span style={{ fontWeight: 800, color: entry.color }}>{Number(entry.value).toFixed(1)}%</span>
                          </div>
                        ))}
                      </div>
                    );
                  }}
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
            )}
          </div>
        </div>

        {/* Share of Voice Donut */}
        <div className="col-span-12 lg:col-span-4 bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col h-[420px]">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-[15px] font-bold text-gray-400 tracking-wide">Share of voice</h3>
              <p className="text-[11px] text-slate-500 mt-0.5 font-medium">Market share distribution</p>
            </div>
            {isLoadingSov ? (
              <span className="text-[9px] font-bold text-amber-500 bg-amber-50 px-2 py-0.5 rounded-full animate-pulse">LOADING</span>
            ) : hasRealSov ? (
              <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">LIVE DATA</span>
            ) : brandId ? (
              <span className="text-[9px] font-bold text-amber-500 bg-amber-50 px-2 py-0.5 rounded-full">COMPUTING</span>
            ) : (
              <span className="text-[9px] font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full">SAMPLE</span>
            )}
          </div>
          <div className="flex-1 relative min-h-0">
            {!isLoadingSov && !hasRealSov && !showSample ? <ComputingPlaceholder /> : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius="65%" outerRadius="90%" paddingAngle={4} dataKey="voice" stroke="none" cornerRadius={6}>
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ fontSize: '11px', borderRadius: '8px' }} formatter={(v: number) => [`${v}%`, 'Share']} />
              </PieChart>
            </ResponsiveContainer>
            )}
            {(hasRealSov || showSample) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-2xl font-black text-slate-800 leading-none">{Number(centerPct).toFixed(2)}%</span>
              <span className="text-[8px] font-bold text-gray-400 uppercase tracking-tighter mt-1">Primary</span>
            </div>
            )}
          </div>
          {/* Legend with trend badges */}
          <div className="mt-3 space-y-1.5 overflow-y-auto custom-scrollbar max-h-[108px] shrink-0">
            {allPieData.map(c => {
              const trend = sovEntityTrends[c.name];
              return (
                <div key={c.name} className="flex items-center justify-between text-[10px] font-bold uppercase text-slate-500">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: c.color }}></div>
                    <span className="truncate max-w-[90px]">{c.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span>{Number(c.voice).toFixed(2)}%</span>
                    <TrendBadge trend={trend} size="xs" />
                  </div>
                </div>
              );
            })}
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
            ) : brandId ? (
              <span className="text-[9px] font-bold text-amber-500 bg-amber-50 px-2 py-0.5 rounded-full">COMPUTING</span>
            ) : (
              <span className="text-[9px] font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full">SAMPLE</span>
            )}
          </div>
          <div className="flex-1 min-h-0">
            {!isLoadingMetrics && !hasRealMetrics && !showSample ? <ComputingPlaceholder /> : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={activeMention}
                margin={{ top: 30, right: 15, left: -20, bottom: 5 }}
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
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const entry = payload[0];
                    const row = activeMention.find((m: any) => m.name === entry.payload?.name) as CompetitorRow | undefined;
                    return (
                      <div style={{ background: 'white', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', padding: '8px 12px', fontSize: '11px', border: '1px solid #f1f5f9' }}>
                        <p style={{ fontWeight: 800, color: '#475569', marginBottom: '3px' }}>{entry.payload?.name}</p>
                        <p style={{ color: entry.color, fontWeight: 800 }}>Mention Rate: {entry.value}%</p>
                        {row?.trend != null && (
                          <p style={{ fontSize: '10px', marginTop: '3px', color: row.trend > 0 ? '#16a34a' : row.trend < 0 ? '#7B3218' : '#94a3b8', fontWeight: 700 }}>
                            {row.trend > 0 ? '↑' : row.trend < 0 ? '↓' : '→'} {row.trend > 0 ? '+' : ''}{row.trend}% vs prev period
                          </p>
                        )}
                      </div>
                    );
                  }}
                />
                <Bar dataKey="mentionRate" radius={[4, 4, 0, 0]} barSize={20}>
                  {activeMention.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                  <LabelList dataKey="mentionRate" content={renderMentionLabel(activeMention as CompetitorRow[])} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            )}
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
            ) : brandId ? (
              <span className="text-[9px] font-bold text-amber-500 bg-amber-50 px-2 py-0.5 rounded-full">COMPUTING</span>
            ) : (
              <span className="text-[9px] font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full">SAMPLE</span>
            )}
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto custom-scrollbar">
            {!isLoadingMetrics && !hasRealMetrics && !showSample ? (
              <ComputingPlaceholder />
            ) : activeCitation.map((c: any, idx: number) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-gray-50/50 rounded-xl border border-gray-100 hover:border-slate-200 transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs text-white shrink-0" style={{ backgroundColor: c.color }}>
                    {c.name.charAt(0)}
                  </div>
                  <div>
                    <div className="text-xs font-black text-slate-800">{c.name}</div>
                    {c.website && <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{c.website}</div>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <TrendBadge trend={c.trend} />
                  <div className="text-right">
                    <div className="text-sm font-black text-slate-900">{c.citation}%</div>
                    <div className="text-[8px] font-bold text-slate-400 uppercase">Share</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Detected Entities ─────────────────────────────────────────────── */}
      {brandId && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-brand-brown/5 text-brand-brown flex items-center justify-center">
                <Radar size={16} />
              </div>
              <div>
                <h3 className="text-[15px] font-bold text-gray-400 tracking-wide">Detected Entities</h3>
                <p className="text-[11px] text-slate-500 mt-0.5 font-medium">
                  Entities appearing in your AI responses — add any as a tracked competitor
                </p>
              </div>
            </div>
            {isLoadingEntities ? (
              <span className="text-[9px] font-bold text-amber-500 bg-amber-50 px-2 py-0.5 rounded-full animate-pulse">LOADING</span>
            ) : detectedEntities.length > 0 ? (
              <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                {detectedEntities.length} ENTITIES
              </span>
            ) : null}
          </div>

          {isLoadingEntities ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={20} className="animate-spin text-slate-300" />
            </div>
          ) : detectedEntities.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center px-4">
              <p className="text-xs font-semibold text-gray-400">No entity data yet</p>
              <p className="text-[10px] text-gray-300 mt-1">Available after your first complete report</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              <div className="grid grid-cols-12 gap-4 px-5 py-2.5 bg-gray-50/60">
                <div className="col-span-5 text-[9px] font-black uppercase tracking-widest text-slate-400">Entity</div>
                <div className="col-span-3 text-[9px] font-black uppercase tracking-widest text-slate-400 text-center">Mention Rate</div>
                <div className="col-span-2 text-[9px] font-black uppercase tracking-widest text-slate-400 flex items-center justify-center gap-1">
                  Visibility Index
                  <span className="relative group cursor-help">
                    <HelpCircle size={10} className="text-slate-300 group-hover:text-slate-400 transition-colors" />
                    <div className="absolute left-0 top-full mt-2 hidden group-hover:block w-56 p-3 bg-slate-900 text-white text-[10px] font-medium rounded-lg shadow-2xl z-50 pointer-events-none leading-relaxed border border-white/10 normal-case tracking-normal">
                      A 0–100 score measuring how prominent this entity is across AI responses. Higher means it's mentioned more frequently and tends to rank higher when it appears.
                    </div>
                  </span>
                </div>
                <div className="col-span-2" />
              </div>

              {detectedEntities.map((entity, idx) => {
                const key = entity.name.toLowerCase();
                const isTracked = trackedNames.has(key);
                const isAdding = addingEntity === entity.name;
                return (
                  <React.Fragment key={entity.name}>
                    {brandInEntities && brandInEntities.insertIndex === idx && (
                      <div className="grid grid-cols-12 gap-4 px-5 py-2.5 items-center bg-brand-brown/5 border-y border-brand-brown/10">
                        <div className="col-span-5 flex items-center gap-3">
                          <div className="w-7 h-7 rounded-lg bg-brand-brown/20 flex items-center justify-center text-[10px] font-black text-brand-brown shrink-0">
                            {brandInEntities.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xs font-bold text-brand-brown truncate">{brandInEntities.name}</span>
                            <span className="text-[8px] font-black text-brand-brown bg-brand-brown/10 px-1.5 py-0.5 rounded shrink-0">YOUR BRAND</span>
                          </div>
                        </div>
                        <div className="col-span-3 flex flex-col items-center gap-1.5">
                          <span className="text-[11px] font-black text-brand-brown">{brandInEntities.mentionRate.toFixed(1)}%</span>
                          <div className="w-full h-1.5 bg-brand-brown/10 rounded-full overflow-hidden">
                            <div className="h-full bg-brand-brown rounded-full" style={{ width: `${brandInEntities.mentionRate}%` }} />
                          </div>
                        </div>
                        <div className="col-span-2 flex items-center justify-center">
                          <span className="text-[11px] font-black text-brand-brown">{brandInEntities.visibilityIndex ?? '—'}</span>
                        </div>
                        <div className="col-span-2" />
                      </div>
                    )}
                    <div className="grid grid-cols-12 gap-4 px-5 py-3 items-center hover:bg-gray-50/50 transition-colors">
                    <div className="col-span-5 flex items-center gap-3">
                      <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-500 shrink-0">
                        {entity.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-xs font-bold text-slate-800 truncate">{entity.name}</span>
                    </div>
                    <div className="col-span-3 flex flex-col items-center gap-1.5">
                      <span className="text-[11px] font-black text-slate-600">{Number(entity.mentionRate).toFixed(1)}%</span>
                      <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-brand-brown/60 rounded-full" style={{ width: `${entity.mentionRate}%` }} />
                      </div>
                    </div>
                    <div className="col-span-2 flex items-center justify-center">
                      {entity.visibilityIndex != null ? (
                        <span className="text-[11px] font-black text-slate-700">{entity.visibilityIndex}</span>
                      ) : (
                        <span className="text-[11px] font-black text-slate-300">—</span>
                      )}
                    </div>
                    <div className="col-span-2 flex justify-end">
                      {isTracked ? (
                        <span className="flex items-center gap-1 text-[9px] font-black text-emerald-600 bg-emerald-50 px-2.5 py-1.5 rounded-lg">
                          <Check size={10} /> Tracking
                        </span>
                      ) : (
                        <button
                          onClick={() => handleAddAsCompetitor(entity.name)}
                          disabled={isAdding || !onAddCompetitor}
                          className="flex items-center gap-1 text-[9px] font-black text-brand-brown border border-brand-brown/20 bg-brand-brown/5 hover:bg-brand-brown/10 px-2.5 py-1.5 rounded-lg transition-all disabled:opacity-50 whitespace-nowrap"
                        >
                          {isAdding ? <Loader2 size={10} className="animate-spin" /> : <Plus size={10} />}
                          Add as Competitor
                        </button>
                      )}
                    </div>
                  </div>
                  </React.Fragment>
                );
              })}
              {brandInEntities && brandInEntities.insertIndex >= detectedEntities.length && (
                <div className="grid grid-cols-12 gap-4 px-5 py-2.5 items-center bg-brand-brown/5 border-t border-brand-brown/10">
                  <div className="col-span-5 flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-brand-brown/20 flex items-center justify-center text-[10px] font-black text-brand-brown shrink-0">
                      {brandInEntities.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-bold text-brand-brown truncate">{brandInEntities.name}</span>
                      <span className="text-[8px] font-black text-brand-brown bg-brand-brown/10 px-1.5 py-0.5 rounded shrink-0">YOUR BRAND</span>
                    </div>
                  </div>
                  <div className="col-span-3 flex flex-col items-center gap-1.5">
                    <span className="text-[11px] font-black text-brand-brown">{brandInEntities.mentionRate.toFixed(1)}%</span>
                    <div className="w-full h-1.5 bg-brand-brown/10 rounded-full overflow-hidden">
                      <div className="h-full bg-brand-brown rounded-full" style={{ width: `${brandInEntities.mentionRate}%` }} />
                    </div>
                  </div>
                  <div className="col-span-2 flex items-center justify-center">
                    <span className="text-[11px] font-black text-brand-brown">{brandInEntities.visibilityIndex ?? '—'}</span>
                  </div>
                  <div className="col-span-2" />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
