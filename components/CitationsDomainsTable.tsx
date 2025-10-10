'use client'

import { useState } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { ChevronDown, ChevronRight, ExternalLink, Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"

interface DomainData {
  domain: string
  urls_count: number
  mentions_count: number
  last_seen_at: string
}

interface URLData {
  url: string
  times_cited: number
  first_seen_at: string
  last_seen_at: string
}

interface CitationsDomainsTableProps {
  domains: DomainData[]
  brandId: string
  dateRange: { from: string | null; to: string | null }
  selectedModels: string[]
  isLoading?: boolean
}

export const CitationsDomainsTable: React.FC<CitationsDomainsTableProps> = ({ 
  domains, 
  brandId,
  dateRange,
  selectedModels,
  isLoading 
}) => {
  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(new Set())
  const [domainUrls, setDomainUrls] = useState<Record<string, URLData[]>>({})
  const [loadingDomains, setLoadingDomains] = useState<Set<string>>(new Set())

  const toggleDomain = async (domain: string) => {
    const isExpanded = expandedDomains.has(domain)
    
    if (isExpanded) {
      // Collapse
      const newExpanded = new Set(expandedDomains)
      newExpanded.delete(domain)
      setExpandedDomains(newExpanded)
    } else {
      // Expand - fetch URLs if not already loaded
      if (!domainUrls[domain]) {
        setLoadingDomains(prev => new Set(prev).add(domain))
        
        try {
          const { from, to } = dateRange
          let url = `/api/reports/citations/urls?brandId=${brandId}&domain=${encodeURIComponent(domain)}`
          if (from && to) {
            url += `&from=${from}&to=${to}`
          }
          if (selectedModels.length > 0) {
            url += `&models=${selectedModels.join(',')}`
          }
          
          const response = await fetch(url)
          const data = await response.json()
          
          if (data.success) {
            setDomainUrls(prev => ({
              ...prev,
              [domain]: data.data.urls
            }))
          }
        } catch (error) {
          console.error('Failed to fetch URLs for domain:', domain, error)
        } finally {
          setLoadingDomains(prev => {
            const newSet = new Set(prev)
            newSet.delete(domain)
            return newSet
          })
        }
      }
      
      const newExpanded = new Set(expandedDomains)
      newExpanded.add(domain)
      setExpandedDomains(newExpanded)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    )
  }

  if (domains.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500">
        <p className="text-sm">No citation data available for selected models</p>
        <p className="text-xs mt-1">Try selecting different models or date range</p>
      </div>
    )
  }

  return (
    <div className="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[50px]"></TableHead>
            <TableHead>Domain</TableHead>
            <TableHead className="text-right">Unique URLs</TableHead>
            <TableHead className="text-right">Mentions</TableHead>
            <TableHead>Last Seen</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {domains.map((domain) => {
            const isExpanded = expandedDomains.has(domain.domain)
            const isLoadingUrls = loadingDomains.has(domain.domain)
            const urls = domainUrls[domain.domain] || []

            return (
              <>
                {/* Main domain row */}
                <TableRow 
                  key={domain.domain}
                  className="cursor-pointer hover:bg-slate-50"
                  onClick={() => toggleDomain(domain.domain)}
                >
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </Button>
                  </TableCell>
                  <TableCell className="font-medium">
                    {domain.domain}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant="secondary">
                      {domain.urls_count}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {domain.mentions_count}
                  </TableCell>
                  <TableCell className="text-sm text-slate-500">
                    {new Date(domain.last_seen_at).toLocaleDateString()}
                  </TableCell>
                </TableRow>

                {/* Expanded URLs rows */}
                {isExpanded && (
                  <TableRow>
                    <TableCell colSpan={5} className="bg-slate-50 p-0">
                      <div className="px-12 py-4">
                        {isLoadingUrls ? (
                          <div className="flex items-center justify-center py-4">
                            <Loader2 className="h-5 w-5 animate-spin text-blue-500 mr-2" />
                            <span className="text-sm text-slate-500">Loading URLs...</span>
                          </div>
                        ) : urls.length > 0 ? (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>URL</TableHead>
                                <TableHead className="text-right">Times Cited</TableHead>
                                <TableHead>First Seen</TableHead>
                                <TableHead>Last Seen</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {urls.map((urlData, idx) => (
                                <TableRow key={idx}>
                                  <TableCell className="font-mono text-xs">
                                    <a 
                                      href={urlData.url} 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      className="text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {urlData.url.length > 80 
                                        ? urlData.url.substring(0, 80) + '...' 
                                        : urlData.url}
                                      <ExternalLink className="h-3 w-3" />
                                    </a>
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {urlData.times_cited}
                                  </TableCell>
                                  <TableCell className="text-sm text-slate-500">
                                    {new Date(urlData.first_seen_at).toLocaleDateString()}
                                  </TableCell>
                                  <TableCell className="text-sm text-slate-500">
                                    {new Date(urlData.last_seen_at).toLocaleDateString()}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        ) : (
                          <div className="text-center py-4 text-slate-500 text-sm">
                            No URLs found for this domain
                          </div>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

