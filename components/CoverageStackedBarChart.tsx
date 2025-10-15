'use client'

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useEffect, useRef } from "react"

interface CoverageData {
  date: string
  brandCoverage: number // 0-100%
  brandCovered: number
  totalResponses: number
  competitors?: Array<{
    name: string
    coverage: number
    covered: number
  }>
}

interface CoverageStackedBarChartProps {
  data: CoverageData[]
  showCompetitors?: boolean
  isLoading?: boolean
  brandName?: string
}

export const CoverageStackedBarChart: React.FC<CoverageStackedBarChartProps> = ({ 
  data, 
  showCompetitors = true,
  isLoading,
  brandName = "Brand"
}) => {
  const chartRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!data || data.length === 0 || isLoading || !chartRef.current) return

    // Load Vega-Lite scripts dynamically
    const loadScript = (src: string): Promise<void> => {
      return new Promise((resolve, reject) => {
        const script = document.createElement('script')
        script.src = src
        script.onload = () => resolve()
        script.onerror = reject
        document.head.appendChild(script)
      })
    }

    const renderChart = async () => {
      try {
        // Load scripts if not already loaded
        if (!window.vega || !window.vegaLite || !window.vegaEmbed) {
          await Promise.all([
            loadScript('https://cdn.jsdelivr.net/npm/vega@5.21.0'),
            loadScript('https://cdn.jsdelivr.net/npm/vega-lite@5.2.0'),
            loadScript('https://cdn.jsdelivr.net/npm/vega-embed@6.20.2')
          ])
        }

        // Transform data to the format expected by Vega-Lite
        const transformedData = data.flatMap(day => {
          const entities = []
          
          // Add brand data
          entities.push({
            Date: day.date,
            Entity: brandName,
            "Coverage %": day.brandCoverage,
            "Mention Count": day.brandCovered,
            "Total Responses": day.totalResponses,
            "Mention Detail": `${day.brandCovered} of ${day.totalResponses} responses`
          })

          // Add competitor data
          if (showCompetitors && day.competitors) {
            day.competitors.forEach(comp => {
              entities.push({
                Date: day.date,
                Entity: comp.name,
                "Coverage %": comp.coverage,
                "Mention Count": comp.covered,
                "Total Responses": day.totalResponses,
                "Mention Detail": `${comp.covered} of ${day.totalResponses} responses`
              })
            })
          }

          return entities
        })

        // Get unique entities for color mapping
        const entities = Array.from(new Set(transformedData.map(d => d.Entity)))
        const colors = [
          "#FFD700", // Gold for brand
          "#FFDA03", // Light gold
          "#C48C00", // Dark gold
          "#36454F", // Charcoal
          "#FF6B6B", // Coral
          "#4ECDC4", // Teal
          "#45B7D1", // Blue
          "#96CEB4", // Mint
          "#FFEAA7", // Yellow
          "#DDA0DD"  // Plum
        ]

        const spec = {
          "config": {
            "view": {
              "continuousWidth": 400,
              "continuousHeight": 300
            }
          },
          "data": {
            "values": transformedData
          },
          "mark": "bar",
          "encoding": {
            "color": {
              "field": "Entity",
              "scale": {
                "domain": entities,
                "range": colors.slice(0, entities.length)
              },
              "title": "Entity"
            },
            "tooltip": [
              {
                "field": "Date",
                "format": "%Y-%m-%d",
                "title": "Date",
                "type": "temporal"
              },
              {
                "field": "Entity",
                "type": "nominal"
              },
              {
                "field": "Coverage %",
                "format": ".1f",
                "title": "Coverage %",
                "type": "quantitative"
              },
              {
                "field": "Mention Detail",
                "title": "Mentions",
                "type": "nominal"
              }
            ],
            "x": {
              "axis": {
                "format": "%b %d"
              },
              "field": "Date",
              "title": "Date",
              "type": "temporal"
            },
            "y": {
              "field": "Coverage %",
              "title": "Coverage %",
              "type": "quantitative"
            }
          },
          "height": 400,
          "width": 600,
          "title": "Daily Coverage % Distribution (Stacked Bars)"
        }

        // Clear previous chart
        if (chartRef.current) {
          chartRef.current.innerHTML = ''
        }

        // Render the chart
        await window.vegaEmbed(chartRef.current, spec, { mode: "vega-lite" })
      } catch (error) {
        console.error('Error rendering Vega-Lite chart:', error)
        if (chartRef.current) {
          chartRef.current.innerHTML = '<div class="text-red-500 p-4">Error loading chart. Please refresh the page.</div>'
        }
      }
    }

    renderChart()
  }, [data, showCompetitors, isLoading, brandName])

  if (isLoading) {
    return (
      <Card className="col-span-4">
        <CardHeader>
          <CardTitle className="text-lg font-medium">Coverage Over Time (Brand vs Competitors)</CardTitle>
          <p className="text-xs text-slate-500">Loading...</p>
        </CardHeader>
        <CardContent>
          <div className="h-80 flex items-center justify-center">
            <div className="text-slate-400">Loading chart data...</div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!data || data.length === 0) {
    return (
      <Card className="col-span-4">
        <CardHeader>
          <CardTitle className="text-lg font-medium">Coverage Over Time (Brand vs Competitors)</CardTitle>
          <p className="text-xs text-slate-500">How often brand and competitors appear in AI responses</p>
        </CardHeader>
        <CardContent>
          <div className="h-80 flex items-center justify-center">
            <div className="text-center text-slate-500">
              <p className="text-sm">No coverage data available</p>
              <p className="text-xs mt-1">for selected models in the selected date range</p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="col-span-4">
      <CardHeader>
        <CardTitle className="text-lg font-medium">Coverage Over Time (Brand vs Competitors)</CardTitle>
        <p className="text-xs text-slate-500">
          % of AI responses mentioning each entity (stacked view)
        </p>
      </CardHeader>
      <CardContent>
        <div className="h-80 overflow-hidden">
          <div ref={chartRef} className="w-full h-full" />
        </div>
      </CardContent>
    </Card>
  )
}

// Add type declarations for global Vega objects
declare global {
  interface Window {
    vega: any
    vegaLite: any
    vegaEmbed: any
  }
}
