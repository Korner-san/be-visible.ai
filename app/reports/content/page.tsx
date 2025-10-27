"use client"

import { useState, useEffect } from "react"
import { Sparkles } from "lucide-react"
import { useTimeRangeStore } from "@/store/timeRange"
import { useBrandsStore } from "@/store/brands"
import { useDateFilter } from "@/contexts/DateFilterContext"
import { useModelFilter } from "@/store/modelFilter"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ContentStructureTable } from "@/components/ContentStructureTable"
import { ContentDiagnostics } from "@/components/ContentDiagnostics"

export default function ReportsContent() {
  const { range } = useTimeRangeStore()
  const { brands, activeBrandId } = useBrandsStore()
  const { getDateRangeForAPI } = useDateFilter()
  const { selectedModels, getModelsForAPI } = useModelFilter()
  const activeBrand = brands.find(brand => brand.id === activeBrandId)
  const isDemoMode = activeBrand?.isDemo || false
  
  const [contentCategoriesData, setContentCategoriesData] = useState<any>(null)
  const [diagnosticsData, setDiagnosticsData] = useState<any>(null)
  const [expandedDiagnosticsData, setExpandedDiagnosticsData] = useState<any>(null)
  const [isCategoriesLoading, setIsCategoriesLoading] = useState(true)
  
  // Load content categories data
  useEffect(() => {
    const loadContentCategories = async () => {
      if (!activeBrandId || isDemoMode) {
        setIsCategoriesLoading(false)
        return
      }
      
      try {
        setIsCategoriesLoading(true)
        
        const { from, to } = getDateRangeForAPI()
        const models = getModelsForAPI()
        let url = `/api/reports/content/categories?brandId=${activeBrandId}`
        if (from && to) {
          url += `&from=${from}&to=${to}`
        }
        if (models) {
          url += `&selectedModels=${models}`
        }
        
        const response = await fetch(url)
        const data = await response.json()
        
        setContentCategoriesData(data.categories || [])
        setDiagnosticsData(data.diagnostics || null)
        setExpandedDiagnosticsData(data.expandedDiagnostics || null)
      } catch (err) {
        console.error('Error loading content categories:', err)
      } finally {
        setIsCategoriesLoading(false)
      }
    }
    
    loadContentCategories()
  }, [activeBrandId, isDemoMode, selectedModels, getDateRangeForAPI, getModelsForAPI])


  return (
    <TooltipProvider>
      <div className="p-8">
        {/* Breadcrumbs */}
        <div className="mb-6">
          <nav className="text-sm text-slate-500">
            <span>Reports</span>
            <span className="mx-2">/</span>
            <span className="text-slate-900 font-medium">Content</span>
          </nav>
        </div>

        {/* Demo Brand Alert */}
        {isDemoMode && (
          <Alert className="mb-6 border-amber-200 bg-amber-50">
            <Sparkles className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800">
              <strong>Demo Report:</strong> Viewing content analysis for {activeBrand?.name}. 
              Switch to your brand to see real content metrics.
            </AlertDescription>
          </Alert>
        )}

        {/* Content Structure Analysis */}
        <div className="mb-8">
          <ContentStructureTable 
            data={contentCategoriesData || []} 
            isLoading={isCategoriesLoading} 
          />
        </div>

        {/* Diagnostic Metrics - Shows URL & Classification Inclusion */}
        <div className="mb-8">
          <ContentDiagnostics 
            diagnostics={diagnosticsData}
            expandedDiagnostics={expandedDiagnosticsData}
            isLoading={isCategoriesLoading} 
          />
        </div>

      </div>
    </TooltipProvider>
  )
}