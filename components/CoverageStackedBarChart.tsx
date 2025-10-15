'use client'

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Vega } from 'react-vega'

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

// Final Vega-Lite specification with white background and proper styling
const FINAL_VEGA_LITE_SPEC = {
  "config": {
    "view": {
      "continuousWidth": 400,
      "continuousHeight": 300
    },
    "background": "white",
    "title": {
      "color": "black"
    }
  },
  "mark": "bar",
  "encoding": {
    "color": {
      "field": "Entity",
      "scale": {
        "domain": [
          "Brand",
          "Firebase",
          "Heroku",
          "Netlify"
        ],
        "range": [
          "#FFD700",
          "#FFDA03",
          "#C48C00",
          "#36454F"
        ]
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

export const CoverageStackedBarChart: React.FC<CoverageStackedBarChartProps> = ({ 
  data, 
  showCompetitors = true,
  isLoading,
  brandName = "Brand"
}) => {
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

  // Get unique entities for dynamic color mapping
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

  // Create dynamic spec with actual entities
  const dynamicSpec = {
    ...FINAL_VEGA_LITE_SPEC,
    encoding: {
      ...FINAL_VEGA_LITE_SPEC.encoding,
      color: {
        ...FINAL_VEGA_LITE_SPEC.encoding.color,
        scale: {
          domain: entities,
          range: colors.slice(0, entities.length)
        }
      }
    }
  }

  // Vega data object
  const vegaData = {
    table: transformedData
  }

  // Vega spec with data binding
  const vegaSpec = {
    ...dynamicSpec,
    data: { name: "table" }
  }

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
        <div className="h-80 w-full">
          <Vega spec={vegaSpec} data={vegaData} actions={false} />
        </div>
      </CardContent>
    </Card>
  )
}
