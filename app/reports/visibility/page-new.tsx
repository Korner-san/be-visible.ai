"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Button } from "@/components/ui/button"
import { PieChart, Pie, Cell, ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, LineChart, Line, Area, AreaChart } from "recharts"
import { Info, Play, Loader2, Sparkles } from "lucide-react"
import { useBrandsStore } from "@/store/brands"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useToast } from "@/hooks/use-toast"
import { useDateFilter } from "@/contexts/DateFilterContext"
import { useModelFilter } from "@/contexts/ModelFilterContext"

export default function ReportsVisibility() {
  const { brands, activeBrandId } = useBrandsStore()
  const { getDateRangeParams, getDateRangeForAPI } = useDateFilter()
  const { getModelFilterForAPI } = useModelFilter()
  const activeBrand = brands.find(brand => brand.id === activeBrandId)
  const isDemoMode = activeBrand?.isDemo || false
  const { toast } = useToast()
  
  const [isGeneratingReport, setIsGeneratingReport] = useState(false)
  const [reportData, setReportData] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  
  // Check if user is test user (for manual trigger button)
  const [isTestUser, setIsTestUser] = useState(false)
  
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true)
      
      try {
        // Check if current user is test user
        const profileResponse = await fetch('/api/user/profile')
        const profileData = await profileResponse.json()
        setIsTestUser(profileData.email === 'kk1995current@gmail.com')
        
        // Load visibility data if not demo mode
        if (!isDemoMode && activeBrandId) {
          const { from, to } = getDateRangeForAPI()
          const selectedModels = getModelFilterForAPI()
          let url = `/api/reports/visibility?brandId=${activeBrandId}`
          if (from && to) {
            url += `&from=${from}&to=${to}`
          }
          if (selectedModels.length < 3) { // Only add models param if not all models are selected
            url += `&models=${selectedModels.join(',')}`
          }
          const visibilityResponse = await fetch(url)
          const visibilityData = await visibilityResponse.json()
          
          if (visibilityData.success) {
            setReportData(visibilityData.data)
          }
        }
      } catch (error) {
        console.error('Error loading data:', error)
      } finally {
        setIsLoading(false)
      }
    }
    
    loadData()
  }, [activeBrandId, isDemoMode, getDateRangeForAPI, getModelFilterForAPI])
  
  // Manual report generation
  const generateManualReport = async () => {
    if (!activeBrandId || isDemoMode) return
    
    setIsGeneratingReport(true)
    
    try {
      toast({
        title: "🤖 Generating Report",
        description: "Running Perplexity analysis on all active prompts...",
        duration: 5000,
      })
      
      const response = await fetch('/api/reports/generate-daily', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          brandId: activeBrandId,
          manual: true
        })
      })
      
      const result = await response.json()
      
      if (result.success) {
        toast({
          title: "✅ Report Generated",
          description: `Processed ${result.totalPrompts} prompts, found ${result.totalMentions} brand mentions`,
          duration: 8000,
        })
        
        // Reload data instead of full page refresh
        const selectedModels = getModelFilterForAPI()
        let reloadUrl = `/api/reports/visibility?brandId=${activeBrandId}`
        if (selectedModels.length < 3) { // Only add models param if not all models are selected
          reloadUrl += `&models=${selectedModels.join(',')}`
        }
        const visibilityResponse = await fetch(reloadUrl)
        const visibilityData = await visibilityResponse.json()
        
        if (visibilityData.success) {
          setReportData(visibilityData.data)
        }
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('Error generating report:', error)
      toast({
        title: "❌ Report Failed",
        description: error instanceof Error ? error.message : "Failed to generate report",
        duration: 8000,
      })
    } finally {
      setIsGeneratingReport(false)
    }
  }

  return (
    <TooltipProvider>
      <div className="p-8">
        <div className="flex items-center justify-between mb-6">
          <nav className="text-sm text-slate-500">
            <span>Reports</span>
            <span className="mx-2">/</span>
            <span className="text-slate-900 font-medium">Visibility</span>
          </nav>
          
          {isTestUser && !isDemoMode && (
            <Button 
              onClick={generateManualReport}
              disabled={isGeneratingReport}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isGeneratingReport ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Generate Report
                </>
              )}
            </Button>
          )}
        </div>

        {isDemoMode && (
          <Alert className="mb-6 border-amber-200 bg-amber-50">
            <Sparkles className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800">
              <strong>Demo Report:</strong> Viewing visibility data for {activeBrand?.name}. 
              Switch to your brand to see real visibility metrics.
            </AlertDescription>
          </Alert>
        )}

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            <span className="ml-2 text-slate-600">Loading visibility...</span>
          </div>
        )}

        {!isLoading && (
          <div className="text-center py-12">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">Visibility Report</h2>
            <p className="text-slate-600">Report content will be displayed here</p>
          </div>
        )}
      </div>
    </TooltipProvider>
  )
}
