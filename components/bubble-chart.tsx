"use client"

import { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Info } from "lucide-react"

interface BubbleData {
  category: string
  count: number
  color: string
  textColor: string
  x: number
  y: number
  size: number
  influence: string
}

interface BubbleChartProps {
  title?: string
  description?: string
  data: Array<{
    category: string
    count: number
    color: string
    influence: string
  }>
}

export default function BubbleChart({ 
  title = "Content Category Distribution", 
  description = "Content types that have the most effect on how AI models answer questions about your brand",
  data: inputData 
}: BubbleChartProps) {
  const data = useMemo(() => {
    // Calculate bubble sizes (min 60px, max 140px)
    const maxCount = Math.max(...inputData.map((c) => c.count))
    const minCount = Math.min(...inputData.map((c) => c.count))

    const bubbles: BubbleData[] = []
    const containerWidth = 800 // Approximate container width in pixels
    const containerHeight = 384 // Container height (h-96 = 384px)

    inputData.forEach((item, index) => {
      const normalizedSize = 60 + ((item.count - minCount) / (maxCount - minCount)) * 80

      let x, y
      let attempts = 0
      const maxAttempts = 200

      do {
        const radius = normalizedSize / 2
        const minX = radius + 10 // 10px padding from edge
        const maxX = containerWidth - radius - 10
        const minY = radius + 10
        const maxY = containerHeight - radius - 10

        // Generate positions in pixels, then convert to percentage
        const xPixels = minX + Math.random() * (maxX - minX)
        const yPixels = minY + Math.random() * (maxY - minY)

        x = (xPixels / containerWidth) * 100
        y = (yPixels / containerHeight) * 100

        attempts++
      } while (
        attempts < maxAttempts &&
        bubbles.some((existingBubble) => {
          const dx = Math.abs((x / 100) * containerWidth - (existingBubble.x / 100) * containerWidth)
          const dy = Math.abs((y / 100) * containerHeight - (existingBubble.y / 100) * containerHeight)
          const distance = Math.sqrt(dx * dx + dy * dy)
          const minDistance = (normalizedSize + existingBubble.size) / 2 + 15 // Sum of radii plus margin
          return distance < minDistance
        })
      )

      bubbles.push({
        ...item,
        textColor: "#ffffff", // White text with shadow for better readability
        x,
        y,
        size: normalizedSize,
      })
    })

    return bubbles
  }, [inputData])

  return (
    <TooltipProvider>
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            {title}
            <Tooltip>
              <TooltipTrigger>
                <Info className="h-4 w-4 text-slate-400" />
              </TooltipTrigger>
              <TooltipContent>
                <p>Most influential content types affecting AI model responses</p>
              </TooltipContent>
            </Tooltip>
          </CardTitle>
          <p className="text-xs text-slate-500">{description}</p>
        </CardHeader>
        <CardContent>
          <div className="relative w-full h-96 bg-slate-50 rounded-lg overflow-hidden">
            {data.map((bubble, index) => (
              <Tooltip key={bubble.category}>
                <TooltipTrigger asChild>
                  <div
                    className="absolute rounded-full shadow-lg transition-all duration-300 hover:scale-105 cursor-pointer"
                    style={{
                      left: `${bubble.x}%`,
                      top: `${bubble.y}%`,
                      width: `${bubble.size}px`,
                      height: `${bubble.size}px`,
                      backgroundColor: bubble.color,
                      transform: "translate(-50%, -50%)",
                    }}
                  >
                    <div
                      className="w-full h-full flex flex-col items-center justify-center text-center"
                      style={{
                        color: bubble.textColor,
                        textShadow: "1px 1px 2px rgba(0,0,0,0.5)",
                        padding: `${bubble.size * 0.15}px`, // Generous padding to keep text inside
                      }}
                    >
                      <div
                        className="font-semibold leading-tight"
                        style={{
                          fontSize: `${Math.max(8, bubble.size * 0.12)}px`, // Proportional category text size
                          maxWidth: `${bubble.size * 0.7}px`, // Ensure text stays within bubble
                          wordBreak: "break-word",
                          hyphens: "auto",
                        }}
                      >
                        {bubble.category}
                      </div>
                      <div
                        className="font-bold mt-1"
                        style={{
                          fontSize: `${Math.max(10, bubble.size * 0.14)}px`, // Proportional number size, slightly larger than category
                        }}
                      >
                        {bubble.count}
                      </div>
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="space-y-1">
                    <p className="font-medium">{bubble.category}</p>
                    <p className="text-sm">Count: {bubble.count} pages</p>
                    <p className="text-sm">AI Influence: {bubble.influence}</p>
                  </div>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>

          {/* Legend */}
          <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
            {data.map((item) => (
              <div key={item.category} className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: item.color }} />
                <div className="text-sm">
                  <div className="font-medium">{item.category}</div>
                  <div className="text-slate-500">{item.count} pages</div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  )
}
