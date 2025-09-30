"use client"

import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useTimeRangeStore } from "@/store/timeRange"
import { ChevronDown } from "lucide-react"

export const TimeRangePicker = () => {
  const { range, setRange } = useTimeRangeStore()

  const getDisplayText = () => {
    switch (range) {
      case '7d':
        return 'Last 7 Days'
      case '30d':
        return 'Last 30 Days'
      case '90d':
        return 'Last 90 Days'
      case 'custom':
        return 'Custom Range'
      default:
        return 'Last 7 Days'
    }
  }

  const handleRangeSelect = (newRange: '7d' | '30d' | '90d' | 'custom') => {
    setRange(newRange)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="flex items-center gap-2">
          {getDisplayText()}
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onClick={() => handleRangeSelect('7d')}>
          Last 7 Days
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleRangeSelect('30d')}>
          Last 30 Days
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleRangeSelect('90d')}>
          Last 90 Days
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleRangeSelect('custom')}>
          Custom Range
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}