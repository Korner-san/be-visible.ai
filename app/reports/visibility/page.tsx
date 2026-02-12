"use client"

import { useState, useEffect } from "react"
import { Loader2, Sparkles } from "lucide-react"
import { VisibilityTrend } from "@/components/charts-new/VisibilityTrend"
import { MentionRate } from "@/components/charts-new/MentionRate"
import { ShareOfVoice } from "@/components/charts-new/ShareOfVoice"
import { PositionRanking } from "@/components/charts-new/PositionRanking"
import { useBrandsStore } from "@/store/brands"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useDateFilter } from "@/contexts/DateFilterContext"
import { useModelFilter } from "@/store/modelFilter"

export default function ReportsVisibility() {
  const { brands, activeBrandId } = useBrandsStore()
  const { getDateRangeForAPI } = useDateFilter()
  const { selectedModels, getModelsForAPI } = useModelFilter()
  const activeBrand = brands.find(brand => brand.id === activeBrandId)
  const isDemoMode = activeBrand?.isDemo || false

  const [scoreData, setScoreData] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const loadData = async () => {
      if (!activeBrandId || isDemoMode) {
        setIsLoading(false)
        return
      }

      try {
        setIsLoading(true)

        const { from, to } = getDateRangeForAPI()
        const models = getModelsForAPI()
        let url = `/api/reports/visibility-score?brandId=${activeBrandId}`
        if (from && to) {
          url += `&from=${from}&to=${to}`
        }
        if (models) {
          url += `&models=${models}`
        }

        const response = await fetch(url)
        const data = await response.json()

        if (data.success) {
          setScoreData(data.data)
        }
      } catch (error) {
        console.error('Error loading visibility data:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [activeBrandId, isDemoMode, selectedModels, getDateRangeForAPI, getModelsForAPI])

  return (
    <div className="p-8">
      {/* Demo Brand Alert */}
      {isDemoMode && (
        <Alert className="mb-6 border-amber-200 bg-amber-50">
          <Sparkles className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800">
            <strong>Demo Report:</strong> Viewing visibility data for {activeBrand?.name}.
            Switch to your brand to see real visibility metrics.
          </AlertDescription>
        </Alert>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          <span className="ml-2 text-slate-600">Loading visibility...</span>
        </div>
      )}

      {/* Dashboard Charts */}
      {!isLoading && (
        <div className="grid grid-cols-12 gap-6 animate-fadeIn">
          <div className="col-span-12 lg:col-span-8 h-[340px]">
            <VisibilityTrend
              data={scoreData?.scores}
              currentScore={scoreData?.summary?.currentScore}
              trend={scoreData?.summary?.trend}
            />
          </div>
          <div className="col-span-12 lg:col-span-4 h-[340px]">
            <MentionRate />
          </div>
          <div className="col-span-12 lg:col-span-5 h-[380px]">
            <ShareOfVoice />
          </div>
          <div className="col-span-12 lg:col-span-7 h-[380px]">
            <PositionRanking />
          </div>
        </div>
      )}
    </div>
  )
}
