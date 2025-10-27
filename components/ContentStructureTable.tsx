'use client'

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Info } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip"

interface ContentCategory {
  category: string
  count: number
  totalScans?: number // Total number of URL scans (includes duplicates)
  percentage: number
  primaryIntent: string
  avgCitationLongevity: number
}

interface ContentStructureTableProps {
  data: ContentCategory[]
  isLoading?: boolean
}

// Helper to format category labels to Title case
const formatCategoryLabel = (category: string): string => {
  const labels: Record<string, string> = {
    // New 8-category system
    'QA_BLOCK': 'Q&A or FAQ block',
    'DATA_DRIVEN_REPORT': 'Original research or data report',
    'COMPARISON_TABLE': 'Product or service comparison',
    'CASE_STUDY': 'Case study',
    'DOCS_PAGE': 'Official documentation',
    'FORUM_THREAD': 'Community discussion',
    'TUTORIAL_STEP_BY_STEP': 'How-to tutorial',
    'LONG_FORM_ARTICLE': 'Editorial or thought leadership article',
    
    // Old system
    'DEFINITIVE_QA_BLOCK': 'Definitive Q&A block',
    'ORIGINAL_DATA_STUDY': 'Original data study',
    'PRODUCT_COMPARISON_MATRIX': 'Product comparison matrix',
    'NARRATIVE_CASE_STUDY': 'Narrative case study',
    'OFFICIAL_DOCUMENTATION': 'Official documentation',
    'COMMUNITY_DISCUSSION': 'Community discussion',
    'TACTICAL_GUIDE': 'Tactical guide',
    'FOUNDATIONAL_AUTHORITY': 'Foundational authority',
    
    // Additional categories
    'BLOG_POST': 'Blog post',
    'NEWS_ARTICLE': 'News article',
    'TUTORIAL': 'Tutorial',
    'COMPARISON_REVIEW': 'Comparison review',
    'OTHER': 'Other'
  }
  
  if (labels[category]) return labels[category]
  
  // Transform ALL_CAPS_WITH_UNDERSCORES to Title case
  return category
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

const CONTENT_CATEGORY_INFO: Record<string, { label: string; description: string; color: string }> = {
  // New 8-category system
  'QA_BLOCK': {
    label: formatCategoryLabel('QA_BLOCK'),
    description: 'Short, structured text designed to answer a single question. Commonly found in FAQ or glossary sections. Often uses schema such as "FAQPage" or "HowTo" for direct extraction by AI models.',
    color: 'bg-blue-100 text-blue-800'
  },
  'DATA_DRIVEN_REPORT': {
    label: formatCategoryLabel('DATA_DRIVEN_REPORT'),
    description: 'Content presenting proprietary data, research, or surveys. Includes numbers, charts, or visualized datasets with a clear methodology. Recognized by AI models as original and verifiable information sources.',
    color: 'bg-purple-100 text-purple-800'
  },
  'COMPARISON_TABLE': {
    label: formatCategoryLabel('COMPARISON_TABLE'),
    description: 'Content comparing multiple tools, platforms, or services. Often structured as tables, lists, or "X vs Y" style articles. Includes "Top 5", "Best of", or feature-by-feature comparisons.',
    color: 'bg-orange-100 text-orange-800'
  },
  'CASE_STUDY': {
    label: formatCategoryLabel('CASE_STUDY'),
    description: 'Narrative content describing a real-world scenario. Highlights a specific challenge, the actions taken, and measurable outcomes. Used to document results, performance, or success examples.',
    color: 'bg-green-100 text-green-800'
  },
  'DOCS_PAGE': {
    label: formatCategoryLabel('DOCS_PAGE'),
    description: 'Technical or instructional reference material from help centers, APIs, or developer sites. Includes installation guides, configuration steps, and parameter explanations. Structured for accuracy and reusability by AI systems.',
    color: 'bg-yellow-100 text-yellow-800'
  },
  'FORUM_THREAD': {
    label: formatCategoryLabel('FORUM_THREAD'),
    description: 'Threaded conversations, forum posts, or community Q&A exchanges. Includes peer‑to‑peer troubleshooting, shared experiences, and informal advice. Reflects public opinion or real‑world problem solving.',
    color: 'bg-pink-100 text-pink-800'
  },
  'TUTORIAL_STEP_BY_STEP': {
    label: formatCategoryLabel('TUTORIAL_STEP_BY_STEP'),
    description: 'Structured instructional guide divided into sequential steps. Each step clearly marked with ordered headings or visual markers. Explains a process, setup, or workflow from start to finish.',
    color: 'bg-indigo-100 text-indigo-800'
  },
  'LONG_FORM_ARTICLE': {
    label: formatCategoryLabel('LONG_FORM_ARTICLE'),
    description: 'In‑depth, long‑form writing with analysis or commentary. May include opinions, frameworks, or explanatory narratives. Characterized by longer paragraphs and contextual depth.',
    color: 'bg-gray-100 text-gray-800'
  },
  
  // Old system (for backward compatibility)
  'DEFINITIVE_QA_BLOCK': {
    label: formatCategoryLabel('DEFINITIVE_QA_BLOCK'),
    description: 'Highly structured, short paragraphs designed to answer a single question. The AI extracts this with minimal editing.',
    color: 'bg-blue-100 text-blue-800'
  },
  'ORIGINAL_DATA_STUDY': {
    label: formatCategoryLabel('ORIGINAL_DATA_STUDY'),
    description: 'Content containing proprietary research, unique data sets, or survey results with a clear methodology.',
    color: 'bg-purple-100 text-purple-800'
  },
  'PRODUCT_COMPARISON_MATRIX': {
    label: formatCategoryLabel('PRODUCT_COMPARISON_MATRIX'),
    description: 'Content presented in tables, bulleted lists, or side-by-side feature comparisons.',
    color: 'bg-orange-100 text-orange-800'
  },
  'NARRATIVE_CASE_STUDY': {
    label: formatCategoryLabel('NARRATIVE_CASE_STUDY'),
    description: 'Long-form content detailing a problem, solution, and clear numerical result.',
    color: 'bg-green-100 text-green-800'
  },
  'OFFICIAL_DOCUMENTATION': {
    label: formatCategoryLabel('OFFICIAL_DOCUMENTATION'),
    description: 'Structured content from help centers, API docs, or knowledge bases. Cited when the AI needs authoritative, technical instructions.',
    color: 'bg-yellow-100 text-yellow-800'
  },
  'COMMUNITY_DISCUSSION': {
    label: formatCategoryLabel('COMMUNITY_DISCUSSION'),
    description: 'Forum posts, discussion threads, Q&A exchanges, and community-driven conversations.',
    color: 'bg-pink-100 text-pink-800'
  },
  'TACTICAL_GUIDE': {
    label: formatCategoryLabel('TACTICAL_GUIDE'),
    description: 'Content providing actionable instructions, workflows, or implementation guides.',
    color: 'bg-indigo-100 text-indigo-800'
  },
  'FOUNDATIONAL_AUTHORITY': {
    label: formatCategoryLabel('FOUNDATIONAL_AUTHORITY'),
    description: 'Content that establishes fundamental concepts, definitions, or frameworks.',
    color: 'bg-gray-100 text-gray-800'
  },
  
  // Additional categories
  'BLOG_POST': {
    label: formatCategoryLabel('BLOG_POST'),
    description: 'Informative article or post typically published on a blog with personal insights, news, or educational content.',
    color: 'bg-slate-100 text-slate-800'
  },
  'NEWS_ARTICLE': {
    label: formatCategoryLabel('NEWS_ARTICLE'),
    description: 'Timely news coverage or press releases about events, announcements, or industry developments.',
    color: 'bg-cyan-100 text-cyan-800'
  },
  'TUTORIAL': {
    label: formatCategoryLabel('TUTORIAL'),
    description: 'Step-by-step instructional content teaching how to accomplish a specific task.',
    color: 'bg-indigo-100 text-indigo-800'
  },
  'COMPARISON_REVIEW': {
    label: formatCategoryLabel('COMPARISON_REVIEW'),
    description: 'Detailed comparison of products or services with evaluation criteria and recommendations.',
    color: 'bg-orange-100 text-orange-800'
  },
  'OTHER': {
    label: formatCategoryLabel('OTHER'),
    description: 'Content that doesn\'t fit into standard categories, such as landing pages or mixed-format content.',
    color: 'bg-gray-100 text-gray-800'
  }
}

const INTENT_LABELS: Record<string, string> = {
  'FOUNDATIONAL_AUTHORITY': 'Foundational Authority',
  'COMPETITIVE_CONSENSUS': 'Competitive Consensus',
  'REAL_TIME_SIGNAL': 'Real-Time Signal',
  'COMMUNITY_VALIDATION': 'Community Validation',
  'TACTICAL_GUIDE': 'Tactical Guide'
}

export function ContentStructureTable({ data, isLoading }: ContentStructureTableProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Content Structure Analysis</CardTitle>
          <p className="text-xs text-slate-500">
            Content types that have the most effect on how AI models answer questions
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Content Structure Analysis</CardTitle>
          <p className="text-xs text-slate-500">
            Content types that have the most effect on how AI models answer questions
          </p>
        </CardHeader>
        <CardContent>
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              No content structure data available for the selected period. Data will appear after the next daily report generation.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  return (
    <TooltipProvider>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            Content Structure Analysis
            <Tooltip>
              <TooltipTrigger>
                <Info className="h-4 w-4 text-slate-400" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="font-semibold mb-1">Content Strategy Signal</p>
                <p className="text-xs">
                  This shows which content formats AI models prefer when citing sources. High percentages in "Definitive Q&A Block" suggest you should prioritize well-structured FAQ content.
                </p>
              </TooltipContent>
            </Tooltip>
          </CardTitle>
          <p className="text-xs text-slate-500">
            Content types that have the most effect on how AI models answer questions
          </p>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Content Structure</TableHead>
                <TableHead className="text-right">
                  <Tooltip>
                    <TooltipTrigger className="cursor-help flex items-center justify-end gap-1">
                      Total URLs
                      <Info className="h-3 w-3" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="text-xs">Total number of URLs scanned from citations during the selected date range. This helps compare daily and period-to-period content variability.</p>
                    </TooltipContent>
                  </Tooltip>
                </TableHead>
                <TableHead className="text-right">
                  <Tooltip>
                    <TooltipTrigger className="cursor-help flex items-center justify-end gap-1">
                      Unique URLs
                      <Info className="h-3 w-3" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="text-xs">The total count of unique pages of this format that were cited across all domains.</p>
                    </TooltipContent>
                  </Tooltip>
                </TableHead>
                <TableHead className="text-right">
                  <Tooltip>
                    <TooltipTrigger className="cursor-help flex items-center justify-end gap-1">
                      % of Total
                      <Info className="h-3 w-3" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="text-xs">The percentage of all citations that use this content structure.</p>
                    </TooltipContent>
                  </Tooltip>
                </TableHead>
                <TableHead className="text-right">
                  <Tooltip>
                    <TooltipTrigger className="cursor-help flex items-center justify-end gap-1">
                      Primary Intent
                      <Info className="h-3 w-3" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="text-xs">The most common user query intent that led to citing this content structure.</p>
                    </TooltipContent>
                  </Tooltip>
                </TableHead>
                <TableHead className="text-right">
                  <Tooltip>
                    <TooltipTrigger className="cursor-help flex items-center justify-end gap-1">
                      Avg. Longevity
                      <Info className="h-3 w-3" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="text-xs">The average number of days content of this type continues to be cited after first appearing.</p>
                    </TooltipContent>
                  </Tooltip>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((category) => {
                const info = CONTENT_CATEGORY_INFO[category.category] || {
                  label: formatCategoryLabel(category.category),
                  description: `${formatCategoryLabel(category.category)} content type.`,
                  color: 'bg-gray-100 text-gray-800'
                }
                
                return (
                  <TableRow key={category.category}>
                    <TableCell>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge variant="secondary" className={info.color}>
                            {info.label}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p className="text-xs">{info.description}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell className="text-right font-medium text-slate-600">
                      {category.totalScans || category.count}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {category.count}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline">
                        {category.percentage}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      {INTENT_LABELS[category.primaryIntent] || category.primaryIntent}
                    </TableCell>
                    <TableCell className="text-right text-xs text-slate-500">
                      {category.avgCitationLongevity} days
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </TooltipProvider>
  )
}

