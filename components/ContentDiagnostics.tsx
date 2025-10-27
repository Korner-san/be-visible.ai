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
import { AlertTriangle, Info } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip"

interface DiagnosticMetrics {
  totalCitationsRetrieved: number
  distinctUrlsCited: number
  urlsWithClassification: number
  urlsWithoutClassification: number
  skippedCitations: number
  includedCitations: number
}

interface ContentDiagnosticsProps {
  diagnostics: DiagnosticMetrics | null
  isLoading?: boolean
}

export function ContentDiagnostics({ diagnostics, isLoading }: ContentDiagnosticsProps) {
  if (isLoading) {
    return (
      <Card className="border-amber-200 bg-amber-50/30">
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            Diagnostic Metrics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!diagnostics) {
    return null
  }

  // Check for anomalies
  const hasAnomalies = diagnostics.urlsWithoutClassification > 0
  const citationLossRate = diagnostics.totalCitationsRetrieved > 0
    ? ((diagnostics.skippedCitations / diagnostics.totalCitationsRetrieved) * 100).toFixed(1)
    : '0'

  return (
    <TooltipProvider>
      <Card className="border-amber-200 bg-amber-50/30">
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            Diagnostic Metrics — URL & Classification Inclusion
            <Tooltip>
              <TooltipTrigger>
                <Info className="h-4 w-4 text-slate-400" />
              </TooltipTrigger>
              <TooltipContent className="max-w-md">
                <p className="font-semibold mb-1">Understanding Data Flow</p>
                <p className="text-xs">
                  This diagnostic panel shows how citations flow through the classification pipeline. 
                  If "Distinct URLs Cited" decreases when you expand the date range (e.g., Last 7 Days → Last 30 Days), 
                  it indicates URLs are being excluded due to missing classification data.
                </p>
              </TooltipContent>
            </Tooltip>
          </CardTitle>
          <p className="text-xs text-amber-800">
            Visibility into citation processing and classification coverage
          </p>
        </CardHeader>
        <CardContent>
          {hasAnomalies && (
            <Alert className="mb-4 border-red-200 bg-red-50">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800 text-xs">
                <strong>Data Quality Issue Detected:</strong> {diagnostics.urlsWithoutClassification} URLs 
                ({citationLossRate}% of citations) are cited but have no classification. 
                This may cause unique URL counts to appear lower when expanding date ranges.
              </AlertDescription>
            </Alert>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Metric</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead>Meaning</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">
                  Total Citations Retrieved
                </TableCell>
                <TableCell className="text-right">
                  <Badge variant="secondary" className="font-mono">
                    {diagnostics.totalCitationsRetrieved}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-slate-600">
                  Number of citation rows inside the date range
                </TableCell>
              </TableRow>

              <TableRow>
                <TableCell className="font-medium">
                  Distinct URLs Cited
                </TableCell>
                <TableCell className="text-right">
                  <Badge variant="secondary" className="font-mono">
                    {diagnostics.distinctUrlsCited}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-slate-600">
                  COUNT(DISTINCT url) from citation rows only
                </TableCell>
              </TableRow>

              <TableRow className={diagnostics.urlsWithClassification > 0 ? "bg-green-50" : ""}>
                <TableCell className="font-medium">
                  URLs With Classification
                </TableCell>
                <TableCell className="text-right">
                  <Badge 
                    variant="secondary" 
                    className="font-mono bg-green-100 text-green-800 border-green-200"
                  >
                    {diagnostics.urlsWithClassification}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-slate-600">
                  How many of those URLs exist in url_content_facts
                </TableCell>
              </TableRow>

              <TableRow className={diagnostics.urlsWithoutClassification > 0 ? "bg-red-50" : ""}>
                <TableCell className="font-medium">
                  URLs Without Classification
                </TableCell>
                <TableCell className="text-right">
                  <Badge 
                    variant="secondary" 
                    className={`font-mono ${
                      diagnostics.urlsWithoutClassification > 0 
                        ? "bg-red-100 text-red-800 border-red-200" 
                        : ""
                    }`}
                  >
                    {diagnostics.urlsWithoutClassification}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-slate-600">
                  Distinct URLs that were cited but have no classification yet
                </TableCell>
              </TableRow>

              <TableRow className={diagnostics.skippedCitations > 0 ? "bg-amber-50" : ""}>
                <TableCell className="font-medium">
                  Skipped Citations
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-3 w-3 ml-1 inline text-slate-400" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="text-xs">
                        Citations assigned to "UNCLASSIFIED" category. These URLs were cited 
                        but haven't been processed by the content classifier yet.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TableCell>
                <TableCell className="text-right">
                  <Badge 
                    variant="secondary" 
                    className={`font-mono ${
                      diagnostics.skippedCitations > 0 
                        ? "bg-amber-100 text-amber-800 border-amber-200" 
                        : ""
                    }`}
                  >
                    {diagnostics.skippedCitations}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-slate-600">
                  Number of citation rows assigned to UNCLASSIFIED
                </TableCell>
              </TableRow>

              <TableRow>
                <TableCell className="font-medium">
                  Included Citations
                </TableCell>
                <TableCell className="text-right">
                  <Badge variant="secondary" className="font-mono">
                    {diagnostics.includedCitations}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-slate-600">
                  Citation rows that remained after filtering
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>

          {hasAnomalies && (
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-xs text-blue-800">
                <strong>Next Steps:</strong> The diagnostic data above confirms that URLs without classification 
                are present in the system. When the date range expands, more unclassified URLs appear, 
                which can cause the unique URL count to seem inconsistent. The final fix should ensure 
                all cited URLs appear in the table regardless of classification status.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </TooltipProvider>
  )
}

