'use client'

import React, { useState, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface CoverageData {
  date: string
  brandCoverage: number
  brandCovered: number
  totalResponses: number
  competitors?: Array<{
    name: string
    coverage: number
    covered: number
  }>
}

interface BrandCoverageChartProps {
  data: CoverageData[]
  brandName: string
  isLoading?: boolean
}

// Custom hexagonal dot component
const CustomHexDot = (props: any) => {
  const { cx, cy, stroke } = props
  const size = 7
  const h = size * Math.sqrt(3) / 2
  
  return (
    <polygon
      points={`${cx},${cy-size} ${cx+h},${cy-size/2} ${cx+h},${cy+size/2} ${cx},${cy+size} ${cx-h},${cy+size/2} ${cx-h},${cy-size/2}`}
      fill={stroke}
      stroke="none"
    />
  )
}

// Custom active dot component
const CustomActiveDot = (props: any) => {
  const { cx, cy, brandColor } = props
  const size = 7
  const h = size * Math.sqrt(3) / 2
  
  return (
    <polygon
      points={`${cx},${cy-size} ${cx+h},${cy-size/2} ${cx+h},${cy+size/2} ${cx},${cy+size} ${cx-h},${cy+size/2} ${cx-h},${cy-size/2}`}
      fill={brandColor}
      stroke="white"
      strokeWidth="1.5"
    />
  )
}

// Hexagonal dotted grid background
const HexagonalDottedGrid = (props: any) => {
  const { x, y, width, height } = props
  const hexagons = []
  const size = 4
  const h = size * Math.sqrt(3) / 2
  
  const seed = 42
  const random = (i: number) => {
    const val = Math.sin(i * seed) * 10000
    return val - Math.floor(val)
  }
  
  for (let i = 0; i < 200; i++) {
    const offsetX = random(i * 2) * width
    const offsetY = random(i * 2 + 1) * height
    
    const cx = x + offsetX
    const cy = y + offsetY
    
    const hexPoints = [
      [cx, cy - size],
      [cx + h, cy - size/2],
      [cx + h, cy + size/2],
      [cx, cy + size],
      [cx - h, cy + size/2],
      [cx - h, cy - size/2]
    ]
    
    hexagons.push(
      <g key={i}>
        {hexPoints.map((point, idx) => (
          <circle
            key={idx}
            cx={point[0]}
            cy={point[1]}
            r="1.2"
            fill="#9ca3af"
            opacity="0.25"
          />
        ))}
      </g>
    )
  }
  
  return <g>{hexagons}</g>
}

// Custom tooltip component
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-4 rounded-lg shadow-xl border-2 border-gray-200">
        <p className="font-bold text-black mb-2 text-sm">{label}</p>
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center gap-2 mb-1">
            <svg width="12" height="12" viewBox="0 0 100 100" className="flex-shrink-0">
              <polygon 
                points="50,5 95,27.5 95,72.5 50,95 5,72.5 5,27.5" 
                fill={entry.color}
              />
            </svg>
            <span className="text-gray-900 text-xs font-medium">
              {entry.name}: <span className="font-bold">{entry.value.toFixed(1)}%</span>
            </span>
          </div>
        ))}
      </div>
    )
  }
  return null
}

// Custom legend component
const CustomLegend = (props: any) => {
  const { payload } = props
  return (
    <div className="flex flex-wrap justify-center gap-4 mt-4">
      {payload.map((entry: any, index: number) => (
        <span key={index} className="inline-flex items-center gap-2 text-black text-sm font-medium">
          <svg width="12" height="12" viewBox="0 0 100 100" className="inline-block">
            <polygon 
              points="50,5 95,27.5 95,72.5 50,95 5,72.5 5,27.5" 
              fill={entry.color}
            />
          </svg>
          {entry.value}
        </span>
      ))}
    </div>
  )
}

export const BrandCoverageChart: React.FC<BrandCoverageChartProps> = ({ 
  data, 
  brandName, 
  isLoading = false 
}) => {
  const [hiddenBrands, setHiddenBrands] = useState<Set<string>>(new Set())
  const [chartData, setChartData] = useState<any[]>([])
  const [brands, setBrands] = useState<string[]>([])
  const [colors, setColors] = useState<Record<string, string>>({})

  // Transform data for the chart
  useEffect(() => {
    if (!data || data.length === 0) return

    console.log('🔍 [BrandCoverageChart] Processing data:', data)

    // Extract all unique brands (including competitors)
    const allBrands = new Set<string>()
    allBrands.add(brandName)
    
    data.forEach(day => {
      day.competitors?.forEach(comp => {
        allBrands.add(comp.name)
      })
    })
    
    const brandList = Array.from(allBrands)
    
    // Define colors for brands
    const brandColors: Record<string, string> = {
      [brandName]: '#000000', // Black for main brand
      'Netlify': '#00C7B7',
      'AWS Amplify': '#FF9900', 
      'Firebase': '#FFCA28',
      'Heroku': '#430098',
      'Vercel': '#000000',
      'Supabase': '#3ECF8E',
      'PlanetScale': '#000000',
      'Railway': '#0B0D0F',
      'Render': '#46E3B7',
      'Fly.io': '#8B5CF6'
    }
    
    // Transform data to chart format
    const transformedData = data.map(day => {
      const dayData: any = { 
        date: new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      }
      
      // Add main brand data
      dayData[brandName] = Math.round(day.brandCoverage * 10) / 10
      
      // Add competitor data
      day.competitors?.forEach(comp => {
        dayData[comp.name] = Math.round(comp.coverage * 10) / 10
      })
      
      return dayData
    })
    
    console.log('🔍 [BrandCoverageChart] Transformed data:', transformedData)
    console.log('🔍 [BrandCoverageChart] Brands:', brandList)
    
    setChartData(transformedData)
    setBrands(brandList)
    setColors(brandColors)
  }, [data, brandName])

  const toggleBrand = (brand: string) => {
    const newHidden = new Set(hiddenBrands)
    if (newHidden.has(brand)) {
      newHidden.delete(brand)
    } else {
      newHidden.add(brand)
    }
    setHiddenBrands(newHidden)
  }

  if (isLoading) {
    return (
      <Card className="col-span-4">
        <CardHeader>
          <CardTitle className="text-lg font-medium">Coverage Over Time (Brand vs Competitors)</CardTitle>
          <p className="text-xs text-slate-500">Loading...</p>
        </CardHeader>
        <CardContent>
          <div className="h-96 flex items-center justify-center">
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
          <div className="h-96 flex items-center justify-center">
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
        <p className="text-xs text-slate-500">AI Response Visibility Metrics</p>
      </CardHeader>
      <CardContent>
        <div className="bg-white p-6">
          <div className="mb-5 flex flex-wrap gap-2">
            {brands.slice(0, 10).map(brand => (
              <button
                key={brand}
                onClick={() => toggleBrand(brand)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  hiddenBrands.has(brand)
                    ? 'bg-gray-100 text-gray-400 border border-gray-300'
                    : 'bg-white text-black border-2 hover:bg-gray-50'
                }`}
                style={{
                  borderColor: hiddenBrands.has(brand) ? undefined : colors[brand]
                }}
              >
                {brand}
              </button>
            ))}
          </div>

          <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
            <ResponsiveContainer width="100%" height={450}>
              <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <HexagonalDottedGrid />
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis 
                  dataKey="date" 
                  stroke="#000000"
                  style={{ fontSize: '13px', fontWeight: '500' }}
                  tick={{ fill: '#404040' }}
                />
                <YAxis 
                  stroke="#000000"
                  style={{ fontSize: '13px', fontWeight: '500' }}
                  tick={{ fill: '#404040' }}
                  label={{ value: 'Coverage (%)', angle: -90, position: 'insideLeft', fill: '#000000', fontWeight: '600' }}
                  domain={[0, 100]}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend 
                  wrapperStyle={{ paddingTop: '15px' }}
                  content={<CustomLegend />}
                />
                {brands.slice(0, 10).map(brand => (
                  !hiddenBrands.has(brand) && (
                    <Line
                      key={brand}
                      type="monotone"
                      dataKey={brand}
                      stroke={colors[brand] || '#000000'}
                      strokeWidth={2.5}
                      dot={<CustomHexDot />}
                      activeDot={<CustomActiveDot />}
                    />
                  )
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-4 p-4 bg-white rounded-lg border border-gray-300">
            <p className="text-xs text-black leading-relaxed">
              <span className="font-bold">Coverage Methodology:</span> Represents the percentage of AI responses mentioning each brand out of all daily prompts analyzed. Each hexagonal data point marks daily brand visibility. Click brand badges to toggle visibility.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

