"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Info, Download, Mail, FileText, ExternalLink, Sparkles, ChevronLeft, ChevronRight, Loader2 } from "lucide-react"
import { useBrandsStore } from "@/store/brands"

export default function ReportsCitations() {
  const { brands, activeBrandId } = useBrandsStore()
  const activeBrand = brands.find(brand => brand.id === activeBrandId)
  const isDemoMode = activeBrand?.isDemo || false
  
  const [citationsData, setCitationsData] = useState<any>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  const ITEMS_PER_PAGE = 10
  
  // Load citations data
  useEffect(() => {
    const loadCitations = async () => {
      if (!activeBrandId || isDemoMode) {
        setIsLoading(false)
        return
      }
      
      try {
        setIsLoading(true)
        setError(null)
        
        const response = await fetch(`/api/reports/citations?brandId=${activeBrandId}&page=${currentPage}&limit=${ITEMS_PER_PAGE}`)
        const data = await response.json()
        
        if (data.success) {
          setCitationsData(data.data)
        } else {
          setError(data.error || 'Failed to load citations')
        }
      } catch (err) {
        console.error('Error loading citations:', err)
        setError('Failed to load citations data')
      } finally {
        setIsLoading(false)
      }
    }
    
    loadCitations()
  }, [activeBrandId, isDemoMode, currentPage])
  
  // Mock data for demo mode
  const demoData = {
    domains: [
      {
        domain: 'techcrunch.com',
        urls: 45,
        brandMentions: 12,
        category: 'News',
        lastSeen: '2025-09-25'
      },
      {
        domain: 'forbes.com',
        urls: 23,
        brandMentions: 8,
        category: 'Business',
        lastSeen: '2025-09-24'
      },
      {
        domain: 'venturebeat.com',
        urls: 67,
        brandMentions: 15,
        category: 'Technology',
        lastSeen: '2025-09-23'
      }
    ],
    summary: {
      totalCitations: 135,
      totalDomains: 45,
      brandMentionCitations: 89,
      categoryCounts: {
        'Technology': 67,
        'News': 45,
        'Business': 23
      }
    },
    pagination: {
      currentPage: 1,
      totalDomainPages: 5,
      totalDomains: 45
    }
  }
  
  const displayData = isDemoMode ? demoData : citationsData

  return (
    <TooltipProvider>
      <div className="p-8">
        {/* Breadcrumbs */}
        <div className="mb-6">
          <nav className="text-sm text-slate-500">
            <span>Reports</span>
            <span className="mx-2">/</span>
            <span className="text-slate-900 font-medium">Citations</span>
          </nav>
        </div>

        {/* Demo Brand Alert */}
        {isDemoMode && (
          <Alert className="mb-6 border-amber-200 bg-amber-50">
            <Sparkles className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800">
              <strong>Demo Report:</strong> Viewing citation data for {activeBrand?.name}. 
              Switch to your brand to see real citation metrics.
            </AlertDescription>
          </Alert>
        )}

        {/* Error State */}
        {error && (
          <Alert className="mb-6 border-red-200 bg-red-50">
            <Info className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800">
              <strong>Error:</strong> {error}
            </AlertDescription>
          </Alert>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            <span className="ml-2 text-slate-600">Loading citations...</span>
          </div>
        )}

        {/* Content */}
        {!isLoading && displayData && (
          <>
            <div className="grid grid-cols-2 gap-6 mb-8">
              {/* Citation Categorization */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    Citation Categorization
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="h-4 w-4 text-slate-400" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Breakdown of citations by content category</p>
                      </TooltipContent>
                    </Tooltip>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Category</TableHead>
                        <TableHead>Count</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {displayData.summary?.categoryCounts ? 
                        Object.entries(displayData.summary.categoryCounts).map(([category, count]) => (
                          <TableRow key={category}>
                            <TableCell>{category}</TableCell>
                            <TableCell>{count}</TableCell>
                          </TableRow>
                        )) : (
                          <TableRow>
                            <TableCell colSpan={2} className="text-center text-slate-500">
                              No categorization data available
                            </TableCell>
                          </TableRow>
                        )
                      }
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Export Action */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Export Citations</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="text-sm text-slate-600">
                      <div className="flex justify-between">
                        <span>Total Citations:</span>
                        <span className="font-medium">{displayData.summary?.totalCitations || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Total Domains:</span>
                        <span className="font-medium">{displayData.summary?.totalDomains || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Brand Mentions:</span>
                        <span className="font-medium">{displayData.summary?.brandMentionCitations || 0}</span>
                      </div>
                    </div>
                    <Button variant="outline" className="w-full" disabled={isDemoMode}>
                      <Download className="h-4 w-4 mr-2" />
                      Download Citation Report
                    </Button>
                    <p className="text-xs text-slate-500">Export all citation data as CSV</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Citations Full Table */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    Citations – Full Table
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="h-4 w-4 text-slate-400" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Complete list of all domains with citations referencing your brand</p>
                      </TooltipContent>
                    </Tooltip>
                  </CardTitle>
                  {displayData.pagination && (
                    <p className="text-xs text-slate-500 mt-1">
                      Showing {displayData.domains?.length || 0} of {displayData.pagination.totalDomains} domains
                    </p>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Domain</TableHead>
                      <TableHead>#URLs</TableHead>
                      <TableHead>Brand Mentions</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Last Seen</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayData.domains && displayData.domains.length > 0 ? (
                      displayData.domains.map((domain: any, index: number) => (
                        <TableRow key={`${domain.domain}-${index}`}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <ExternalLink className="h-4 w-4 text-slate-400" />
                              {domain.domain}
                            </div>
                          </TableCell>
                          <TableCell>{domain.urls}</TableCell>
                          <TableCell>
                            <Badge variant={domain.brandMentions > 0 ? "default" : "secondary"}>
                              {domain.brandMentions}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`${
                              domain.category === 'News' ? 'border-blue-200 text-blue-800' :
                              domain.category === 'Business' ? 'border-green-200 text-green-800' :
                              domain.category === 'Technology' ? 'border-purple-200 text-purple-800' :
                              domain.category === 'Development' ? 'border-orange-200 text-orange-800' :
                              domain.category === 'Documentation' ? 'border-indigo-200 text-indigo-800' :
                              'border-gray-200 text-gray-800'
                            }`}>
                              {domain.category}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-slate-500">
                            {new Date(domain.lastSeen).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button 
                                    variant="outline" 
                                    size="sm"
                                    className="h-8 px-2"
                                    onClick={() => window.open(`https://${domain.domain}`, '_blank')}
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Visit website</p>
                                </TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button 
                                    variant="outline" 
                                    size="sm"
                                    className="h-8 px-2"
                                    onClick={() => window.open(`https://${domain.domain}/contact`, '_blank')}
                                  >
                                    <Mail className="h-3 w-3" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Find contact information</p>
                                </TooltipContent>
                              </Tooltip>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-slate-500">
                          {isDemoMode ? "Switch to your brand to see real citations" : "No citations found"}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>

                {/* Pagination */}
                {displayData.pagination && displayData.pagination.totalDomainPages > 1 && (
                  <div className="flex items-center justify-between mt-6">
                    <div className="text-sm text-slate-600">
                      Page {displayData.pagination.currentPage} of {displayData.pagination.totalDomainPages}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={!displayData.pagination.hasPrevPage || isLoading}
                      >
                        <ChevronLeft className="h-4 w-4 mr-1" />
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(prev => prev + 1)}
                        disabled={!displayData.pagination.hasNextPage || isLoading}
                      >
                        Next
                        <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </TooltipProvider>
  )
} 