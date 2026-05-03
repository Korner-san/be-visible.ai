
export interface ChartDataPoint {
  name: string;
  value: number;
  fullMark?: number; // For radial charts
  fill?: string;
}

export interface TrendDataPoint {
  date: string;
  score: number;
}

export interface CategoryPosition {
  category: string;
  position: number;
  gap: number; // 0 to 1 for progress bar length
}

export interface ShareData {
  name: string;
  value: number;
  color: string;
}

export enum TimeRange {
  SEVEN_DAYS = 'Last 7 days',
  THIRTY_DAYS = 'Last 30 days',
  NINETY_DAYS = 'Last 90 days',
  CUSTOM = 'Custom',
}

export interface PromptHistoryPoint {
  date: string;
  visibility: number;
  avgPosition: number | null;
  citationShare: number;
  brandCitations?: number;
  totalCitations?: number;
  mentionRate: number;
  mentionedCount?: number;
  totalResults?: number;
}

export interface PromptStats {
  id: string;
  text: string;
  category: string;
  visibilityScore: number;
  visibilityTrend: number;
  avgPosition: number | null;
  mentionRate: number;
  mentionedCount?: number;
  totalResults?: number;
  positionCount?: number;
  positionSum?: number;
  citationShare: number;
  citations: number;
  citationTrend: number;
  lastRun: string;
  history: PromptHistoryPoint[];
  // Management fields
  isActive: boolean;
  isCopy?: boolean;
  language?: string;
  regions?: string[];
  tags?: string[];
  platforms?: string[];
  lastUpdated?: string;
  // Real stats from prompt_results
  recentResults?: Array<{
    id: string;
    promptText: string;
    response: string;
    mentioned: boolean;
    position?: number | null;
    provider?: string;
    orderedEntities?: Array<{ name: string; position: number; type: string }>;
    citationCount: number;
    citations: string[];
    date: string;
  }>;
}

export type MetricType = 'visibility' | 'avgPosition' | 'citationShare' | 'mentionRate';

export interface Competitor {
  id: string;
  name: string;
  website: string;
  color: string;
}
