'use client'

import { Vega } from 'react-vega'

// Chart data - 84 objects representing Brand, Firebase, Heroku, Netlify coverage over time
const CHART_DATA = [
  {"Date": "2025-09-25", "Entity": "Brand", "Coverage %": 40.0, "Mention Count": 6, "Total Responses": 15, "Mention Detail": "6 of 15 responses"},
  {"Date": "2025-09-25", "Entity": "Firebase", "Coverage %": 33.3, "Mention Count": 5, "Total Responses": 15, "Mention Detail": "5 of 15 responses"},
  {"Date": "2025-09-25", "Entity": "Heroku", "Coverage %": 26.7, "Mention Count": 4, "Total Responses": 15, "Mention Detail": "4 of 15 responses"},
  {"Date": "2025-09-25", "Entity": "Netlify", "Coverage %": 20.0, "Mention Count": 3, "Total Responses": 15, "Mention Detail": "3 of 15 responses"},
  {"Date": "2025-09-26", "Entity": "Brand", "Coverage %": 35.7, "Mention Count": 5, "Total Responses": 14, "Mention Detail": "5 of 14 responses"},
  {"Date": "2025-09-26", "Entity": "Firebase", "Coverage %": 42.9, "Mention Count": 6, "Total Responses": 14, "Mention Detail": "6 of 14 responses"},
  {"Date": "2025-09-26", "Entity": "Heroku", "Coverage %": 28.6, "Mention Count": 4, "Total Responses": 14, "Mention Detail": "4 of 14 responses"},
  {"Date": "2025-09-26", "Entity": "Netlify", "Coverage %": 21.4, "Mention Count": 3, "Total Responses": 14, "Mention Detail": "3 of 14 responses"},
  {"Date": "2025-09-27", "Entity": "Brand", "Coverage %": 38.5, "Mention Count": 5, "Total Responses": 13, "Mention Detail": "5 of 13 responses"},
  {"Date": "2025-09-27", "Entity": "Firebase", "Coverage %": 30.8, "Mention Count": 4, "Total Responses": 13, "Mention Detail": "4 of 13 responses"},
  {"Date": "2025-09-27", "Entity": "Heroku", "Coverage %": 23.1, "Mention Count": 3, "Total Responses": 13, "Mention Detail": "3 of 13 responses"},
  {"Date": "2025-09-27", "Entity": "Netlify", "Coverage %": 15.4, "Mention Count": 2, "Total Responses": 13, "Mention Detail": "2 of 13 responses"},
  {"Date": "2025-09-28", "Entity": "Brand", "Coverage %": 42.9, "Mention Count": 6, "Total Responses": 14, "Mention Detail": "6 of 14 responses"},
  {"Date": "2025-09-28", "Entity": "Firebase", "Coverage %": 35.7, "Mention Count": 5, "Total Responses": 14, "Mention Detail": "5 of 14 responses"},
  {"Date": "2025-09-28", "Entity": "Heroku", "Coverage %": 28.6, "Mention Count": 4, "Total Responses": 14, "Mention Detail": "4 of 14 responses"},
  {"Date": "2025-09-28", "Entity": "Netlify", "Coverage %": 21.4, "Mention Count": 3, "Total Responses": 14, "Mention Detail": "3 of 14 responses"},
  {"Date": "2025-09-29", "Entity": "Brand", "Coverage %": 37.5, "Mention Count": 6, "Total Responses": 16, "Mention Detail": "6 of 16 responses"},
  {"Date": "2025-09-29", "Entity": "Firebase", "Coverage %": 31.3, "Mention Count": 5, "Total Responses": 16, "Mention Detail": "5 of 16 responses"},
  {"Date": "2025-09-29", "Entity": "Heroku", "Coverage %": 25.0, "Mention Count": 4, "Total Responses": 16, "Mention Detail": "4 of 16 responses"},
  {"Date": "2025-09-29", "Entity": "Netlify", "Coverage %": 18.8, "Mention Count": 3, "Total Responses": 16, "Mention Detail": "3 of 16 responses"},
  {"Date": "2025-09-30", "Entity": "Brand", "Coverage %": 41.2, "Mention Count": 7, "Total Responses": 17, "Mention Detail": "7 of 17 responses"},
  {"Date": "2025-09-30", "Entity": "Firebase", "Coverage %": 35.3, "Mention Count": 6, "Total Responses": 17, "Mention Detail": "6 of 17 responses"},
  {"Date": "2025-09-30", "Entity": "Heroku", "Coverage %": 29.4, "Mention Count": 5, "Total Responses": 17, "Mention Detail": "5 of 17 responses"},
  {"Date": "2025-09-30", "Entity": "Netlify", "Coverage %": 23.5, "Mention Count": 4, "Total Responses": 17, "Mention Detail": "4 of 17 responses"},
  {"Date": "2025-10-01", "Entity": "Brand", "Coverage %": 39.1, "Mention Count": 9, "Total Responses": 23, "Mention Detail": "9 of 23 responses"},
  {"Date": "2025-10-01", "Entity": "Firebase", "Coverage %": 34.8, "Mention Count": 8, "Total Responses": 23, "Mention Detail": "8 of 23 responses"},
  {"Date": "2025-10-01", "Entity": "Heroku", "Coverage %": 26.1, "Mention Count": 6, "Total Responses": 23, "Mention Detail": "6 of 23 responses"},
  {"Date": "2025-10-01", "Entity": "Netlify", "Coverage %": 21.7, "Mention Count": 5, "Total Responses": 23, "Mention Detail": "5 of 23 responses"},
  {"Date": "2025-10-02", "Entity": "Brand", "Coverage %": 36.4, "Mention Count": 8, "Total Responses": 22, "Mention Detail": "8 of 22 responses"},
  {"Date": "2025-10-02", "Entity": "Firebase", "Coverage %": 31.8, "Mention Count": 7, "Total Responses": 22, "Mention Detail": "7 of 22 responses"},
  {"Date": "2025-10-02", "Entity": "Heroku", "Coverage %": 27.3, "Mention Count": 6, "Total Responses": 22, "Mention Detail": "6 of 22 responses"},
  {"Date": "2025-10-02", "Entity": "Netlify", "Coverage %": 22.7, "Mention Count": 5, "Total Responses": 22, "Mention Detail": "5 of 22 responses"},
  {"Date": "2025-10-03", "Entity": "Brand", "Coverage %": 40.0, "Mention Count": 8, "Total Responses": 20, "Mention Detail": "8 of 20 responses"},
  {"Date": "2025-10-03", "Entity": "Firebase", "Coverage %": 35.0, "Mention Count": 7, "Total Responses": 20, "Mention Detail": "7 of 20 responses"},
  {"Date": "2025-10-03", "Entity": "Heroku", "Coverage %": 30.0, "Mention Count": 6, "Total Responses": 20, "Mention Detail": "6 of 20 responses"},
  {"Date": "2025-10-03", "Entity": "Netlify", "Coverage %": 25.0, "Mention Count": 5, "Total Responses": 20, "Mention Detail": "5 of 20 responses"},
  {"Date": "2025-10-04", "Entity": "Brand", "Coverage %": 38.1, "Mention Count": 8, "Total Responses": 21, "Mention Detail": "8 of 21 responses"},
  {"Date": "2025-10-04", "Entity": "Firebase", "Coverage %": 33.3, "Mention Count": 7, "Total Responses": 21, "Mention Detail": "7 of 21 responses"},
  {"Date": "2025-10-04", "Entity": "Heroku", "Coverage %": 28.6, "Mention Count": 6, "Total Responses": 21, "Mention Detail": "6 of 21 responses"},
  {"Date": "2025-10-04", "Entity": "Netlify", "Coverage %": 23.8, "Mention Count": 5, "Total Responses": 21, "Mention Detail": "5 of 21 responses"},
  {"Date": "2025-10-05", "Entity": "Brand", "Coverage %": 41.7, "Mention Count": 10, "Total Responses": 24, "Mention Detail": "10 of 24 responses"},
  {"Date": "2025-10-05", "Entity": "Firebase", "Coverage %": 37.5, "Mention Count": 9, "Total Responses": 24, "Mention Detail": "9 of 24 responses"},
  {"Date": "2025-10-05", "Entity": "Heroku", "Coverage %": 29.2, "Mention Count": 7, "Total Responses": 24, "Mention Detail": "7 of 24 responses"},
  {"Date": "2025-10-05", "Entity": "Netlify", "Coverage %": 25.0, "Mention Count": 6, "Total Responses": 24, "Mention Detail": "6 of 24 responses"},
  {"Date": "2025-10-06", "Entity": "Brand", "Coverage %": 39.1, "Mention Count": 9, "Total Responses": 23, "Mention Detail": "9 of 23 responses"},
  {"Date": "2025-10-06", "Entity": "Firebase", "Coverage %": 34.8, "Mention Count": 8, "Total Responses": 23, "Mention Detail": "8 of 23 responses"},
  {"Date": "2025-10-06", "Entity": "Heroku", "Coverage %": 26.1, "Mention Count": 6, "Total Responses": 23, "Mention Detail": "6 of 23 responses"},
  {"Date": "2025-10-06", "Entity": "Netlify", "Coverage %": 21.7, "Mention Count": 5, "Total Responses": 23, "Mention Detail": "5 of 23 responses"},
  {"Date": "2025-10-07", "Entity": "Brand", "Coverage %": 37.5, "Mention Count": 6, "Total Responses": 16, "Mention Detail": "6 of 16 responses"},
  {"Date": "2025-10-07", "Entity": "Firebase", "Coverage %": 31.3, "Mention Count": 5, "Total Responses": 16, "Mention Detail": "5 of 16 responses"},
  {"Date": "2025-10-07", "Entity": "Heroku", "Coverage %": 25.0, "Mention Count": 4, "Total Responses": 16, "Mention Detail": "4 of 16 responses"},
  {"Date": "2025-10-07", "Entity": "Netlify", "Coverage %": 18.8, "Mention Count": 3, "Total Responses": 16, "Mention Detail": "3 of 16 responses"},
  {"Date": "2025-10-08", "Entity": "Brand", "Coverage %": 40.0, "Mention Count": 6, "Total Responses": 15, "Mention Detail": "6 of 15 responses"},
  {"Date": "2025-10-08", "Entity": "Firebase", "Coverage %": 33.3, "Mention Count": 5, "Total Responses": 15, "Mention Detail": "5 of 15 responses"},
  {"Date": "2025-10-08", "Entity": "Heroku", "Coverage %": 26.7, "Mention Count": 4, "Total Responses": 15, "Mention Detail": "4 of 15 responses"},
  {"Date": "2025-10-08", "Entity": "Netlify", "Coverage %": 20.0, "Mention Count": 3, "Total Responses": 15, "Mention Detail": "3 of 15 responses"},
  {"Date": "2025-10-09", "Entity": "Brand", "Coverage %": 42.9, "Mention Count": 6, "Total Responses": 14, "Mention Detail": "6 of 14 responses"},
  {"Date": "2025-10-09", "Entity": "Firebase", "Coverage %": 35.7, "Mention Count": 5, "Total Responses": 14, "Mention Detail": "5 of 14 responses"},
  {"Date": "2025-10-09", "Entity": "Heroku", "Coverage %": 28.6, "Mention Count": 4, "Total Responses": 14, "Mention Detail": "4 of 14 responses"},
  {"Date": "2025-10-09", "Entity": "Netlify", "Coverage %": 21.4, "Mention Count": 3, "Total Responses": 14, "Mention Detail": "3 of 14 responses"},
  {"Date": "2025-10-10", "Entity": "Brand", "Coverage %": 38.5, "Mention Count": 5, "Total Responses": 13, "Mention Detail": "5 of 13 responses"},
  {"Date": "2025-10-10", "Entity": "Firebase", "Coverage %": 30.8, "Mention Count": 4, "Total Responses": 13, "Mention Detail": "4 of 13 responses"},
  {"Date": "2025-10-10", "Entity": "Heroku", "Coverage %": 23.1, "Mention Count": 3, "Total Responses": 13, "Mention Detail": "3 of 13 responses"},
  {"Date": "2025-10-10", "Entity": "Netlify", "Coverage %": 15.4, "Mention Count": 2, "Total Responses": 13, "Mention Detail": "2 of 13 responses"},
  {"Date": "2025-10-11", "Entity": "Brand", "Coverage %": 41.2, "Mention Count": 7, "Total Responses": 17, "Mention Detail": "7 of 17 responses"},
  {"Date": "2025-10-11", "Entity": "Firebase", "Coverage %": 35.3, "Mention Count": 6, "Total Responses": 17, "Mention Detail": "6 of 17 responses"},
  {"Date": "2025-10-11", "Entity": "Heroku", "Coverage %": 29.4, "Mention Count": 5, "Total Responses": 17, "Mention Detail": "5 of 17 responses"},
  {"Date": "2025-10-11", "Entity": "Netlify", "Coverage %": 23.5, "Mention Count": 4, "Total Responses": 17, "Mention Detail": "4 of 17 responses"},
  {"Date": "2025-10-12", "Entity": "Brand", "Coverage %": 39.1, "Mention Count": 9, "Total Responses": 23, "Mention Detail": "9 of 23 responses"},
  {"Date": "2025-10-12", "Entity": "Firebase", "Coverage %": 34.8, "Mention Count": 8, "Total Responses": 23, "Mention Detail": "8 of 23 responses"},
  {"Date": "2025-10-12", "Entity": "Heroku", "Coverage %": 26.1, "Mention Count": 6, "Total Responses": 23, "Mention Detail": "6 of 23 responses"},
  {"Date": "2025-10-12", "Entity": "Netlify", "Coverage %": 21.7, "Mention Count": 5, "Total Responses": 23, "Mention Detail": "5 of 23 responses"},
  {"Date": "2025-10-13", "Entity": "Brand", "Coverage %": 36.4, "Mention Count": 8, "Total Responses": 22, "Mention Detail": "8 of 22 responses"},
  {"Date": "2025-10-13", "Entity": "Firebase", "Coverage %": 31.8, "Mention Count": 7, "Total Responses": 22, "Mention Detail": "7 of 22 responses"},
  {"Date": "2025-10-13", "Entity": "Heroku", "Coverage %": 27.3, "Mention Count": 6, "Total Responses": 22, "Mention Detail": "6 of 22 responses"},
  {"Date": "2025-10-13", "Entity": "Netlify", "Coverage %": 22.7, "Mention Count": 5, "Total Responses": 22, "Mention Detail": "5 of 22 responses"},
  {"Date": "2025-10-14", "Entity": "Brand", "Coverage %": 40.0, "Mention Count": 8, "Total Responses": 20, "Mention Detail": "8 of 20 responses"},
  {"Date": "2025-10-14", "Entity": "Firebase", "Coverage %": 35.0, "Mention Count": 7, "Total Responses": 20, "Mention Detail": "7 of 20 responses"},
  {"Date": "2025-10-14", "Entity": "Heroku", "Coverage %": 30.0, "Mention Count": 6, "Total Responses": 20, "Mention Detail": "6 of 20 responses"},
  {"Date": "2025-10-14", "Entity": "Netlify", "Coverage %": 25.0, "Mention Count": 5, "Total Responses": 20, "Mention Detail": "5 of 20 responses"},
  {"Date": "2025-10-15", "Entity": "Brand", "Coverage %": 38.1, "Mention Count": 8, "Total Responses": 21, "Mention Detail": "8 of 21 responses"},
  {"Date": "2025-10-15", "Entity": "Firebase", "Coverage %": 33.3, "Mention Count": 7, "Total Responses": 21, "Mention Detail": "7 of 21 responses"},
  {"Date": "2025-10-15", "Entity": "Heroku", "Coverage %": 28.6, "Mention Count": 6, "Total Responses": 21, "Mention Detail": "6 of 21 responses"},
  {"Date": "2025-10-15", "Entity": "Netlify", "Coverage %": 21.4, "Mention Count": 3, "Total Responses": 14, "Mention Detail": "3 of 14 responses"}
]

// Vega-Lite specification for the Bee Colors Stacked Bar Chart
const VEGA_LITE_SPEC = {
  "data": { "name": "table" },
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

interface CoverageStackedBarChartProps {
  isLoading?: boolean
}

export const CoverageStackedBarChart: React.FC<CoverageStackedBarChartProps> = ({ 
  isLoading = false 
}) => {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96 bg-slate-50 rounded-lg">
        <div className="text-slate-500">Loading chart...</div>
      </div>
    )
  }

  return (
    <div className="w-full">
      <Vega 
        spec={VEGA_LITE_SPEC} 
        data={{ table: CHART_DATA }}
        renderer="svg"
      />
    </div>
  )
}
