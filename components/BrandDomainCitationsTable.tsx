'use client'

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { ExternalLink, Loader2 } from "lucide-react"

interface CitationData {
  url: string
  mentions_count: number
  first_seen_at: string
  last_seen_at: string
  providers: string[]
}

interface BrandDomainCitationsTableProps {
  citations: CitationData[]
  isLoading?: boolean
}

export const BrandDomainCitationsTable: React.FC<BrandDomainCitationsTableProps> = ({ 
  citations, 
  isLoading 
}) => {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
      </div>
    )
  }

  if (citations.length === 0) {
    return (
      <div className="text-center py-8 text-slate-500">
        <p className="text-sm">No brand domain citations found</p>
        <p className="text-xs mt-1">AI models haven't cited your website URLs yet</p>
      </div>
    )
  }

  return (
    <div className="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>URL</TableHead>
            <TableHead className="text-right">Mentions</TableHead>
            <TableHead>Providers</TableHead>
            <TableHead>Last Seen</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {citations.map((citation, index) => (
            <TableRow key={index}>
              <TableCell className="font-mono text-xs max-w-md">
                <a 
                  href={citation.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                >
                  <span className="truncate">
                    {citation.url.length > 60 
                      ? citation.url.substring(0, 60) + '...' 
                      : citation.url}
                  </span>
                  <ExternalLink className="h-3 w-3 flex-shrink-0" />
                </a>
              </TableCell>
              <TableCell className="text-right">
                <Badge variant="default" className="bg-green-100 text-green-800 hover:bg-green-200">
                  {citation.mentions_count}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
                  {citation.providers.map((provider, idx) => (
                    <Badge 
                      key={idx} 
                      variant="outline" 
                      className="text-xs"
                    >
                      {provider === 'perplexity' ? 'Perplexity' : 'Google AO'}
                    </Badge>
                  ))}
                </div>
              </TableCell>
              <TableCell className="text-sm text-slate-500">
                {new Date(citation.last_seen_at).toLocaleDateString()}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

