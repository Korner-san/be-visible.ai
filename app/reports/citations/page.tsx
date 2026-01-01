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
import { useDateFilter } from "@/contexts/DateFilterContext"
import { useModelFilter } from "@/store/modelFilter"
import { CitationsDomainsTable } from "@/components/CitationsDomainsTable"
import { CitationShareChart } from "@/components/CitationShareChart"
import { CitationShareRankings } from "@/components/CitationShareRankings"

export default function ReportsCitations() {
  const { brands, activeBrandId } = useBrandsStore()
  const { getDateRangeParams, getDateRangeForAPI } = useDateFilter()
  const { selectedModels, getModelsForAPI } = useModelFilter()
  const activeBrand = brands.find(brand => brand.id === activeBrandId)
  const isDemoMode = activeBrand?.isDemo || false
  
  const [citationsData, setCitationsData] = useState<any>(null)
  const [summaryData, setSummaryData] = useState<any>(null)
  const [domainsData, setDomainsData] = useState<any>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [isTableLoading, setIsTableLoading] = useState(false)
  const [isDomainsLoading, setIsDomainsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  const ITEMS_PER_PAGE = 8 // Changed to 8 as requested
  
  // Load initial data (summary + first page)
  useEffect(() => {
    const loadInitialData = async () => {
      if (!activeBrandId || isDemoMode) {
        setIsLoading(false)
        return
      }
      
      try {
        setIsLoading(true)
        setError(null)
        
        const { from, to } = getDateRangeForAPI()
        const models = getModelsForAPI()
        let url = `/api/reports/citations?brandId=${activeBrandId}&page=1&limit=${ITEMS_PER_PAGE}`
        if (from && to) {
          url += `&from=${from}&to=${to}`
        }
        if (models) {
          url += `&models=${models}`
        }
        const response = await fetch(url)
        const data = await response.json()
        
        if (data.success) {
          setCitationsData(data.data)
          setSummaryData({
            summary: data.data.summary,
            pagination: data.data.pagination
          })
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
    
    loadInitialData()
  }, [activeBrandId, isDemoMode, getDateRangeForAPI, selectedModels])
  
  // Load table data only when page changes
  useEffect(() => {
    const loadTableData = async () => {
      if (!activeBrandId || isDemoMode || currentPage === 1) {
        return // Skip if it's the first page (already loaded)
      }
      
      try {
        setIsTableLoading(true)
        setError(null)
        
        const { from, to } = getDateRangeForAPI()
        const models = getModelsForAPI()
        let url = `/api/reports/citations?brandId=${activeBrandId}&page=${currentPage}&limit=${ITEMS_PER_PAGE}`
        if (from && to) {
          url += `&from=${from}&to=${to}`
        }
        if (models) {
          url += `&models=${models}`
        }
        const response = await fetch(url)
        const data = await response.json()
        
        if (data.success) {
          setCitationsData(prevData => ({
            ...prevData,
            domains: data.data.domains,
            pagination: data.data.pagination
          }))
        } else {
          setError(data.error || 'Failed to load citations')
        }
      } catch (err) {
        console.error('Error loading citations:', err)
        setError('Failed to load citations data')
      } finally {
        setIsTableLoading(false)
      }
    }
    
    loadTableData()
  }, [activeBrandId, isDemoMode, currentPage, getDateRangeForAPI])
  
  // Load domains data (separate from citations table)
  useEffect(() => {
    const loadDomainsData = async () => {
      if (!activeBrandId || isDemoMode) {
        setIsDomainsLoading(false)
        return
      }
      
      try {
        setIsDomainsLoading(true)
        
        const { from, to } = getDateRangeForAPI()
        const models = getModelsForAPI()
        let url = `/api/reports/citations/domains?brandId=${activeBrandId}`
        if (from && to) {
          url += `&from=${from}&to=${to}`
        }
        if (models) {
          url += `&models=${models}`
        }
        
        const response = await fetch(url)
        const data = await response.json()
        
        if (data.success) {
          setDomainsData(data.data)
        }
      } catch (err) {
        console.error('Error loading domains:', err)
      } finally {
        setIsDomainsLoading(false)
      }
    }
    
    loadDomainsData()
  }, [activeBrandId, isDemoMode, getDateRangeForAPI, selectedModels])
  
  
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
      },
      {
        domain: 'wired.com',
        urls: 34,
        brandMentions: 9,
        category: 'Technology',
        lastSeen: '2025-09-22'
      },
      {
        domain: 'fastcompany.com',
        urls: 28,
        brandMentions: 7,
        category: 'Business',
        lastSeen: '2025-09-21'
      },
      {
        domain: 'theverge.com',
        urls: 41,
        brandMentions: 11,
        category: 'Technology',
        lastSeen: '2025-09-20'
      },
      {
        domain: 'bloomberg.com',
        urls: 19,
        brandMentions: 5,
        category: 'Business',
        lastSeen: '2025-09-19'
      },
      {
        domain: 'arstechnica.com',
        urls: 52,
        brandMentions: 13,
        category: 'Technology',
        lastSeen: '2025-09-18'
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
      totalDomainPages: 6,
      totalDomains: 45,
      hasNextPage: true,
      hasPrevPage: false
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
            {/* Citation Share Chart */}
            <div className="mb-6">
              <CitationShareChart
                brandId={activeBrandId || ''}
                fromDate={getDateRangeForAPI().from || undefined}
                toDate={getDateRangeForAPI().to || undefined}
                isDemoMode={isDemoMode}
              />
            </div>

            {/* Citation Share Rankings */}
            <div className="mb-6">
              <CitationShareRankings
                brandId={activeBrandId || ''}
                isDemoMode={isDemoMode}
              />
            </div>

            {/* NEW: Citations by Domain - Model-Aware with Expandable Rows */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg font-medium flex items-center gap-2">
                      Citation Sources by Domain
                      {isDomainsLoading && (
                        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                      )}
                      <Tooltip>
                        <TooltipTrigger>
                          <Info className="h-4 w-4 text-slate-400" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <div className="max-w-xs">
                            <p className="font-medium mb-2">Citation Sources</p>
                            <p className="text-sm">Unique URLs per domain across all AI responses. Click a domain to expand and see individual URLs with citation frequency.</p>
                            <p className="text-xs mt-2 text-slate-400">URLs are normalized and deduplicated. Respects Model Filter and Date Range.</p>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </CardTitle>
                    {!isDemoMode && domainsData && (
                      <p className="text-xs text-slate-500 mt-1">
                        {domainsData.totalDomains || 0} domains · {
                          domainsData.domains?.reduce((sum: number, d: any) => sum + d.urls_count, 0) || 0
                        } unique URLs
                      </p>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {!isDemoMode ? (
                  <CitationsDomainsTable
                    domains={domainsData?.domains || []}
                    brandId={activeBrandId || ''}
                    dateRange={getDateRangeForAPI()}
                    selectedModels={selectedModels}
                    isLoading={isDomainsLoading}
                  />
                ) : (
                  <div className="text-center py-12 text-slate-500">
                    <p className="text-sm">Switch to your brand to see real citation sources</p>
                    <p className="text-xs mt-1">Demo data coming soon</p>
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