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
  avgCitationsPerUrl: number
  dominantModel: string
}

interface DomainCategorizationTableProps {
  data: DomainCategory[]
  isLoading?: boolean
}

const CATEGORY_INFO: Record<string, { label: string; description: string; color: string }> = {
  'FOUNDATIONAL_AUTHORITY': {
    label: 'Foundational Authority',
    description: 'Domains cited for established definitions, history, and technical standards (e.g., Wikipedia, Government, Academic Sites)',
    color: 'bg-blue-100 text-blue-800'
  },
  'COMPETITIVE_CONSENSUS': {
    label: 'Competitive Consensus',
    description: 'Domains cited for comparative data, product features, and reviews (e.g., G2, Capterra, high-tier niche analysts)',
    color: 'bg-purple-100 text-purple-800'
  },
  'REAL_TIME_SIGNAL': {
    label: 'Real-Time Signal',
    description: 'Domains cited for recent events, breaking news, or temporary spikes (e.g., major news publications, press release domains)',
    color: 'bg-orange-100 text-orange-800'
  },
  'COMMUNITY_VALIDATION': {
    label: 'Community Validation',
    description: 'Domains where user experience and peer discussion drive citation (e.g., Reddit, Stack Overflow, specific forums)',
    color: 'bg-green-100 text-green-800'
  },
  'TACTICAL_GUIDE': {
    label: 'Tactical Guide',
    description: 'Domains cited for step-by-step instructions, troubleshooting, or product documentation (e.g., help centers, tutorials)',
    color: 'bg-yellow-100 text-yellow-800'
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
                <TableHead className="text-right">Mentions</TableHead>
                <TableHead className="text-right">Unique Domains</TableHead>
                <TableHead className="text-right">Avg. Citations/URL</TableHead>
                <TableHead className="text-right">Dominant Model</TableHead>
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
                      {category.avgCitationsPerUrl}
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

