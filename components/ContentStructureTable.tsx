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
  percentage: number
  primaryIntent: string
  avgCitationLongevity: number
}

interface ContentStructureTableProps {
  data: ContentCategory[]
  isLoading?: boolean
}

const CONTENT_CATEGORY_INFO: Record<string, { label: string; description: string; color: string }> = {
  'DEFINITIVE_QA_BLOCK': {
    label: 'Definitive Q&A Block',
    description: "The AI's Answer Key. Highly structured, short paragraphs designed to answer a single question (often tagged with FAQ/HowTo Schema). The AI extracts this with minimal editing. Goal: Be concise, clear, and factually correct.",
    color: 'bg-blue-100 text-blue-800'
  },
  'PRODUCT_COMPARISON_MATRIX': {
    label: 'Product Comparison Matrix',
    description: 'The Feature Summary. Content presented in tables, bulleted lists, or side-by-side feature comparisons. Ideal for satisfying Competitive Consensus queries. Goal: Use clear HTML/Markdown tables with up-to-date data.',
    color: 'bg-orange-100 text-orange-800'
  },
  'OFFICIAL_DOCUMENTATION': {
    label: 'Official Documentation',
    description: 'The Trusted Source Code. Structured content from help centers, API docs, or knowledge bases. Cited when the AI needs authoritative, technical instructions. Goal: Must be perfectly accessible, fast, and free of broken links to win technical queries.',
    color: 'bg-yellow-100 text-yellow-800'
  },
  'NARRATIVE_CASE_STUDY': {
    label: 'Narrative Case Study',
    description: 'The Proof Point. Long-form content detailing a problem, solution, and clear numerical result (e.g., "Client achieved 25% ROI"). These citations are used to build trust and demonstrate Experience. Goal: Ensure the "Result" is quotable in one sentence.',
    color: 'bg-green-100 text-green-800'
  },
  'ORIGINAL_DATA_STUDY': {
    label: 'Original Data Study',
    description: 'The Unique Asset. Content containing proprietary research, unique data sets, or survey results with a clear methodology. The AI is citing this because the fact exists nowhere else. Goal: Invest in annual research that the entire industry must reference.',
    color: 'bg-purple-100 text-purple-800'
  },
  'COMMUNITY_DISCUSSION': {
    label: 'Community Discussion',
    description: 'The Social Proof. Forum posts, discussion threads, Q&A exchanges, and community-driven conversations where users interact and share experiences. Cited when the AI needs real-world validation or user experiences. Goal: Foster active community engagement and collect authentic user stories.',
    color: 'bg-pink-100 text-pink-800'
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
                  label: category.category,
                  description: 'No description available',
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

