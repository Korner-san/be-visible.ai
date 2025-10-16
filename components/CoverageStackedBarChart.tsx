'use client'

import { VegaEmbed } from 'react-vega'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

// Interface for the coverage data from the API
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

// Transform API data to Vega-Lite format
const transformCoverageData = (data: CoverageData[], brandName: string): any[] => {
  const transformedData: any[] = []
  
  data.forEach(day => {
    // Add brand data
    transformedData.push({
      "Date": day.date,
      "Entity": brandName,
      "Coverage %": day.brandCoverage,
      "Mention Count": day.brandCovered,
      "Total Responses": day.totalResponses,
      "Mention Detail": `${day.brandCovered} of ${day.totalResponses} responses`
    })
    
    // Add competitor data
    day.competitors?.forEach(competitor => {
      transformedData.push({
        "Date": day.date,
        "Entity": competitor.name,
        "Coverage %": competitor.coverage,
        "Mention Count": competitor.covered,
        "Total Responses": day.totalResponses,
        "Mention Detail": `${competitor.covered} of ${day.totalResponses} responses`
      })
    })
  })
  
  return transformedData
}

// Generate Vega-Lite specification with dynamic entities and colors
const generateVegaLiteSpec = (entities: string[], brandName: string) => {
  // Define color scheme - Brand gets gold, competitors get different colors
  const colors = [
    "#FFD700", // Gold for brand
    "#FF6B6B", // Red
    "#4ECDC4", // Teal  
    "#45B7D1", // Blue
    "#96CEB4", // Green
    "#FECA57", // Yellow
    "#FF9FF3", // Pink
    "#54A0FF"  // Light Blue
  ]
  
  const domain = entities
  const range = colors.slice(0, entities.length)
  
  return {
    "data": { "name": "table" },
    "config": {
      "view": {
        "continuousWidth": 500,
        "continuousHeight": 250
      },
      "background": "white",
      "title": {
        "color": "black",
        "fontSize": 14
      },
      "axis": {
        "labelFontSize": 12,
        "titleFontSize": 12
      }
    },
    "mark": "bar",
    "encoding": {
      "color": {
        "field": "Entity",
        "scale": {
          "domain": domain,
          "range": range
        },
        "title": "Entity",
        "legend": {
          "orient": "bottom",
          "labelFontSize": 11
        }
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
          "format": "%b %d",
          "labelAngle": -45,
          "labelFontSize": 10
        },
        "field": "Date",
        "title": "Date",
        "type": "temporal",
        "scale": {
          "type": "time"
        }
      },
      "y": {
        "field": "Coverage %",
        "title": "Coverage %",
        "type": "quantitative",
        "scale": {
          "domain": [0, 100]
        },
        "axis": {
          "format": ".0f",
          "labelFontSize": 10
        }
      }
    },
    "width": 500,
    "height": 250,
    "title": {
      "text": `Daily Coverage % Distribution: ${brandName} vs Competitors`,
      "fontSize": 14,
      "anchor": "start"
    },
    "resolve": {
      "scale": {
        "color": "independent"
      }
    }
  }
}

interface CoverageStackedBarChartProps {
  data: CoverageData[]
  brandName: string
  isLoading?: boolean
}

export const CoverageStackedBarChart: React.FC<CoverageStackedBarChartProps> = ({ 
  data,
  brandName,
  isLoading = false 
}) => {
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

  // Extract unique entities for color mapping
  const entities = new Set<string>()
  data.forEach(day => {
    entities.add(brandName)
    day.competitors?.forEach(comp => entities.add(comp.name))
  })
  const entityList = Array.from(entities)

  // Transform data for Vega-Lite
  const chartData = transformCoverageData(data, brandName)
  
  // Debug logging
  console.log('🔍 [CoverageStackedBarChart] Raw data:', data)
  console.log('🔍 [CoverageStackedBarChart] Transformed chart data:', chartData)
  console.log('🔍 [CoverageStackedBarChart] Entities:', entityList)
  
  // Generate dynamic spec
  const vegaSpec = generateVegaLiteSpec(entityList, brandName)

  return (
    <Card className="col-span-4">
      <CardHeader>
        <CardTitle className="text-lg font-medium">Coverage Over Time (Brand vs Competitors)</CardTitle>
        <p className="text-xs text-slate-500">
          % of AI responses mentioning each entity (max 4 competitors shown)
        </p>
      </CardHeader>
      <CardContent>
        <div className="h-80 w-full overflow-hidden">
          <VegaEmbed 
            spec={vegaSpec} 
            data={{ table: chartData }}
            renderer="svg"
            options={{
              renderer: 'svg',
              actions: false
            }}
          />
        </div>
      </CardContent>
    </Card>
  )
}
