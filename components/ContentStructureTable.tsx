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
    description: 'Concise text blocks, often schema-tagged or in FAQ sections, designed for direct answer extraction',
    color: 'bg-blue-100 text-blue-800'
  },
  'ORIGINAL_DATA_STUDY': {
    label: 'Original Data Study',
    description: 'Content focused on proprietary research, surveys, or unique data sets with stated methodology',
    color: 'bg-purple-100 text-purple-800'
  },
  'PRODUCT_COMPARISON_MATRIX': {
    label: 'Product Comparison Matrix',
    description: 'Content presented in bulleted lists, tables, or side-by-side product feature layouts',
    color: 'bg-orange-100 text-orange-800'
  },
  'NARRATIVE_CASE_STUDY': {
    label: 'Narrative Case Study',
    description: 'Story-driven content detailing a client win, problem/solution, or a project outcome',
    color: 'bg-green-100 text-green-800'
  },
  'OFFICIAL_DOCUMENTATION': {
    label: 'Official Documentation',
    description: 'Structured content from official help centers, APIs, or knowledge bases',
    color: 'bg-yellow-100 text-yellow-800'
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
                <TableHead className="text-right">Unique URLs</TableHead>
                <TableHead className="text-right">% of Total</TableHead>
                <TableHead className="text-right">Primary Intent</TableHead>
                <TableHead className="text-right">Avg. Longevity</TableHead>
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

