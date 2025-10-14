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

interface DomainCategory {
  category: string
  count: number
  uniqueDomains: number
  uniqueUrls: number
  shareOfVoice: number
  dominantModel: string
}

interface DomainCategorizationTableProps {
  data: DomainCategory[]
  isLoading?: boolean
}

const CATEGORY_INFO: Record<string, { label: string; description: string; color: string }> = {
  'FOUNDATIONAL_AUTHORITY': {
    label: 'Foundational Authority',
    description: 'The Trust Anchor. Domains consistently cited for basic definitions, industry history, technical standards, or academic consensus. These sources establish the core facts the AI operates on.',
    color: 'bg-blue-100 text-blue-800'
  },
  'COMPETITIVE_CONSENSUS': {
    label: 'Competitive Consensus',
    description: 'The Decision-Maker. Domains frequently cited in comparative (vs.) queries, feature roundups, and product evaluation contexts. The AI uses these to summarize purchase decisions.',
    color: 'bg-purple-100 text-purple-800'
  },
  'TACTICAL_GUIDE': {
    label: 'Tactical Guide',
    description: 'The Problem-Solver. Domains cited for structured, step-by-step instructions, how-to guides, and detailed troubleshooting. The content must be easy for the AI to convert into a numbered list.',
    color: 'bg-yellow-100 text-yellow-800'
  },
  'REAL_TIME_SIGNAL': {
    label: 'Real-Time Signal',
    description: 'The Recency Driver. Domains cited only for breaking news, event coverage, or time-sensitive data. High volume often indicates a successful competitor PR/news cycle.',
    color: 'bg-orange-100 text-orange-800'
  },
  'COMMUNITY_VALIDATION': {
    label: 'Community Validation',
    description: 'The Peer-Trust Role. Domains like Reddit, Quora, and public forums that the AI uses to sample user opinion or validate a common solution.',
    color: 'bg-green-100 text-green-800'
  }
}

export function DomainCategorizationTable({ data, isLoading }: DomainCategorizationTableProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Domain Categorization</CardTitle>
          <p className="text-xs text-slate-500">
            Strategic role of cited domains based on AI trust signals
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
          <CardTitle className="text-sm font-medium">Domain Categorization</CardTitle>
          <p className="text-xs text-slate-500">
            Strategic role of cited domains based on AI trust signals
          </p>
        </CardHeader>
        <CardContent>
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              No domain categorization data available for the selected period. Data will appear after the next daily report generation.
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
            Domain Categorization
            <Tooltip>
              <TooltipTrigger>
                <Info className="h-4 w-4 text-slate-400" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="font-semibold mb-1">How AI models categorize cited domains</p>
                <p className="text-xs">
                  Each domain is classified based on its strategic role in AI responses. High citation counts in "Foundational Authority" indicate domains that are hard to displace.
                </p>
              </TooltipContent>
            </Tooltip>
          </CardTitle>
          <p className="text-xs text-slate-500">
            Strategic role of cited domains based on AI trust signals
          </p>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">
                  <Tooltip>
                    <TooltipTrigger className="cursor-help flex items-center justify-end gap-1">
                      Mentions
                      <Info className="h-3 w-3" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="text-xs">The total number of times any URL from this domain was cited by all models.</p>
                    </TooltipContent>
                  </Tooltip>
                </TableHead>
                <TableHead className="text-right">
                  <Tooltip>
                    <TooltipTrigger className="cursor-help flex items-center justify-end gap-1">
                      Unique Domains
                      <Info className="h-3 w-3" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="text-xs">The total number of unique root domains that fall into this category.</p>
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
                      Share of Voice
                      <Info className="h-3 w-3" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="text-xs">The percentage of all citations across all categories that belong here.</p>
                    </TooltipContent>
                  </Tooltip>
                </TableHead>
                <TableHead className="text-right">
                  <Tooltip>
                    <TooltipTrigger className="cursor-help flex items-center justify-end gap-1">
                      Model Preference
                      <Info className="h-3 w-3" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="text-xs">The AI Model that cited this category most frequently.</p>
                    </TooltipContent>
                  </Tooltip>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((category) => {
                const info = CATEGORY_INFO[category.category] || {
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
                      {category.count.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {category.uniqueDomains}
                    </TableCell>
                    <TableCell className="text-right">
                      {category.uniqueUrls}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline">
                        {category.shareOfVoice}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline">
                        {category.dominantModel}
                      </Badge>
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

