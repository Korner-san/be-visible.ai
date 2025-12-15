"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Download, SlidersHorizontal, Search, Settings } from "lucide-react"
import { useBrandsStore } from "@/store/brands"
import { useDateFilter } from "@/contexts/DateFilterContext"
import { useModelFilter } from "@/store/modelFilter"

import { StatCard } from "@/components/dashboard/StatCard"
import { CitationTable } from "@/components/dashboard/CitationTable"
import { AppSidebar } from "@/components/layout/AppSidebar"

// Icons for cards
import { Quote, Globe, BarChart2, Link as LinkIcon } from "lucide-react"

export default function ReportsCitations() {
  const { brands, activeBrandId } = useBrandsStore()
  const { getDateRangeForAPI } = useDateFilter()
  const { getModelsForAPI } = useModelFilter()
  const activeBrand = brands.find(brand => brand.id === activeBrandId)
  const isDemoMode = activeBrand?.isDemo || false

  const [data, setData] = useState<any>(null)
  const [domainsData, setDomainsData] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Fetch logic (simplified adaptation of previous logic)
  useEffect(() => {
    const loadData = async () => {
      if (!activeBrandId) return
      setIsLoading(true)
      try {
        // In a real implementation, we would fetch summary stats and table data here
        // For now reusing the specific endpoints or mocking structure if endpoints fail to match entirely
        const { from, to } = getDateRangeForAPI()
        const models = getModelsForAPI()

        const params = new URLSearchParams()
        params.append('brandId', activeBrandId)
        if (from && to) {
          params.append('from', from)
          params.append('to', to)
        }
        if (models) params.append('models', models)

        // Fetch Domains Data for Table
        const domainsRes = await fetch(`/api/reports/citations/domains?${params.toString()}`)
        const domainsJson = await domainsRes.json()

        if (domainsJson.success) {
          setDomainsData(domainsJson.data)
        }

        // We could also fetch summary stats: /api/reports/citations
        const statsRes = await fetch(`/api/reports/citations?${params.toString()}&limit=1`)
        const statsJson = await statsRes.json()

        if (statsJson.success) {
          setData(statsJson.data)
        }

      } catch (error) {
        console.error("Failed to load data", error)
      } finally {
        setIsLoading(false)
      }
    }
    loadData()
  }, [activeBrandId, isDemoMode, getDateRangeForAPI, getModelsForAPI])

  // Computed / Mocked Stats for Display based on loaded data
  const totalCitations = data?.summary?.totalCitations || 0
  const uniqueUrls = domainsData?.domains?.reduce((acc: number, d: any) => acc + d.urls_count, 0) || 0
  const avgCoverage = 64 // Placeholder/Computed
  const topDomain = domainsData?.domains?.[0]?.domain || "N/A"

  // Table Data Mapping
  const tableData = domainsData?.domains?.map((d: any) => ({
    domain: d.domain,
    urls_count: d.urls_count,
    mentions_count: d.mentions_count,
    prompt_coverage: d.prompt_coverage,
    model_coverage: d.model_coverage
  })) || []

  // Mock Demo Data if needed
  const displayTableData = isDemoMode ? [
    { domain: "wikipedia.org", urls_count: 1240, mentions_count: 8500, prompt_coverage: 85, model_coverage: 92 },
    { domain: "nytimes.com", urls_count: 842, mentions_count: 5200, prompt_coverage: 78, model_coverage: 88 },
    { domain: "github.com", urls_count: 650, mentions_count: 4100, prompt_coverage: 92, model_coverage: 95 },
    { domain: "stackoverflow.com", urls_count: 420, mentions_count: 2800, prompt_coverage: 65, model_coverage: 70 },
    { domain: "medium.com", urls_count: 310, mentions_count: 1500, prompt_coverage: 50, model_coverage: 60 },
  ] : tableData

  return (
    <div className="space-y-8 p-8 max-w-7xl mx-auto">
      {/* Header Section */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Citation Sources</h1>
          <p className="text-muted-foreground mt-1">
            Monitor and manage where your content is being cited across the web.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline">
            <Settings className="mr-2 h-4 w-4" />
            Configure
          </Button>
          <Button className="bg-primary hover:bg-primary/90">
            <Download className="mr-2 h-4 w-4" />
            Export Report
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Citations"
          value={isDemoMode ? "12,450" : totalCitations.toLocaleString()}
          change="+12%"
          trend="up"
          icon={<Quote className="h-4 w-4" />}
        />
        <StatCard
          title="Top Domain"
          value={isDemoMode ? "Wikipedia.org" : topDomain}
          subtext={isDemoMode ? "2,400 mentions" : "Most cited source"}
          icon={<Globe className="h-4 w-4" />}
        />
        <StatCard
          title="Avg. Coverage"
          value={isDemoMode ? "64%" : `${avgCoverage}%`}
          change="+5%"
          trend="up"
          icon={<BarChart2 className="h-4 w-4" />}
        />
        <StatCard
          title="Unique URLs"
          value={isDemoMode ? "3,892" : uniqueUrls.toLocaleString()}
          subtext="sources"
          icon={<LinkIcon className="h-4 w-4" />}
        />
      </div>

      {/* Table Section */}
      <div className="space-y-4">
        {/* Filters */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2 flex-1">
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search domains..."
                className="pl-9 bg-card"
              />
            </div>
            <Select defaultValue="all">
              <SelectTrigger className="w-[180px] bg-card">
                <SelectValue placeholder="All Coverage" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Coverage</SelectItem>
                <SelectItem value="high">High (&gt;80%)</SelectItem>
                <SelectItem value="low">Low (&gt;20%)</SelectItem>
              </SelectContent>
            </Select>
            <Select defaultValue="30d">
              <SelectTrigger className="w-[180px] bg-card">
                <SelectValue placeholder="Last 30 Days" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Last 7 Days</SelectItem>
                <SelectItem value="30d">Last 30 Days</SelectItem>
                <SelectItem value="90d">Last 3 Months</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="text-sm text-muted-foreground">
            Showing 1-10 of {isDemoMode ? 245 : displayTableData.length}
          </div>
        </div>

        {/* Table Component */}
        <CitationTable data={displayTableData} />

        {/* Footer Pagination (Simplified visual) */}
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" disabled>Previous</Button>
          <Button variant="outline" size="sm" className="bg-primary text-primary-foreground">1</Button>
          <Button variant="outline" size="sm">2</Button>
          <Button variant="outline" size="sm">3</Button>
          <span className="p-2">...</span>
          <Button variant="outline" size="sm">10</Button>
          <Button variant="outline" size="sm">Next</Button>
        </div>
      </div>
    </div>
  )
}