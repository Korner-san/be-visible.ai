'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { CalendarIcon, ChevronDown } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'

export interface DateRange {
  from: Date | undefined
  to: Date | undefined
}

interface GlobalDateFilterProps {
  onDateRangeChange: (range: DateRange) => void
  defaultRange?: DateRange
}

export default function GlobalDateFilter({ onDateRangeChange, defaultRange }: GlobalDateFilterProps) {
  const [dateRange, setDateRange] = useState<DateRange>(defaultRange || {
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
    to: new Date()
  })
  const [selectedPreset, setSelectedPreset] = useState<string>('30d')
  const [isSelectingRange, setIsSelectingRange] = useState(false)
  const [tempRange, setTempRange] = useState<DateRange>({ from: undefined, to: undefined })

  // Preset date ranges
  const presets = [
    { label: 'Last 7 days', value: '7d', days: 7 },
    { label: 'Last 30 days', value: '30d', days: 30 },
    { label: 'Last 90 days', value: '90d', days: 90 }
  ]

  // Apply preset
  const applyPreset = (presetValue: string) => {
    const preset = presets.find(p => p.value === presetValue)
    if (preset) {
      const to = new Date()
      const from = new Date(Date.now() - preset.days * 24 * 60 * 60 * 1000)
      const newRange = { from, to }
      setDateRange(newRange)
      setSelectedPreset(presetValue)
      onDateRangeChange(newRange)
    }
  }

  // Apply custom range
  const applyCustomRange = (range: DateRange) => {
    setDateRange(range)
    setSelectedPreset('custom')
    onDateRangeChange(range)
  }

  // Handle calendar date selection
  const handleDateSelect = (range: DateRange | undefined) => {
    if (!range) {
      setTempRange({ from: undefined, to: undefined })
      setIsSelectingRange(false)
      return
    }

    if (range.from && !range.to) {
      // First click - set start date
      setTempRange({ from: range.from, to: undefined })
      setIsSelectingRange(true)
    } else if (range.from && range.to) {
      // Second click - complete the range
      setTempRange(range)
      setIsSelectingRange(false)
      applyCustomRange(range)
    }
  }

  // Initialize with default range
  useEffect(() => {
    if (defaultRange) {
      setDateRange(defaultRange)
    } else {
      onDateRangeChange(dateRange)
    }
  }, [])

  const formatDateRange = () => {
    if (!dateRange.from || !dateRange.to) return 'Select date range'
    
    const fromStr = format(dateRange.from, 'MMM d')
    const toStr = format(dateRange.to, 'MMM d, yyyy')
    
    return `${fromStr} - ${toStr}`
  }

  return (
    <div className="flex items-center space-x-2">
      {/* Preset buttons */}
      {presets.map((preset) => (
        <Button
          key={preset.value}
          variant={selectedPreset === preset.value ? "default" : "outline"}
          size="sm"
          onClick={() => applyPreset(preset.value)}
          className="text-xs"
        >
          {preset.label}
        </Button>
      ))}
      
      {/* Custom date picker */}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant={selectedPreset === 'custom' ? "default" : "outline"}
            size="sm"
            className={cn(
              "justify-start text-left font-normal text-xs",
              !dateRange.from && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-3 w-3" />
            {selectedPreset === 'custom' ? formatDateRange() : 'Custom'}
            <ChevronDown className="ml-2 h-3 w-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-4" align="start" side="bottom" sideOffset={8}>
          <Calendar
            mode="range"
            defaultMonth={dateRange.from}
            selected={isSelectingRange ? tempRange : dateRange}
            onSelect={handleDateSelect}
            numberOfMonths={2}
            disabled={(date) => date > new Date() || date < new Date('2020-01-01')}
            className="min-w-[720px]"
            classNames={{
              months: "flex gap-12",
              month: "w-[340px] relative",
              nav: "hidden", // Hide global nav
              button_previous: "h-8 w-8 p-0 hover:bg-accent rounded-md absolute left-0 top-0",
              button_next: "h-8 w-8 p-0 hover:bg-accent rounded-md absolute right-0 top-0",
              month_caption: "flex items-center justify-center h-8 text-base font-semibold px-8",
              weekdays: "flex mb-2",
              weekday: "text-muted-foreground flex-1 text-center text-sm font-medium py-2",
              week: "flex w-full mb-1",
              day: "h-10 w-10 text-center text-sm hover:bg-accent rounded-md"
            }}
            components={{
              Caption: ({ children, ...props }) => {
                const { goToMonth } = props as any
                const isFirstMonth = (props as any).displayMonth === (props as any).displayIndex
                
                return (
                  <div className="flex items-center justify-center h-8 text-base font-semibold relative">
                    {isFirstMonth && (
                      <button
                        onClick={() => goToMonth && goToMonth(new Date((props as any).displayMonth.getFullYear(), (props as any).displayMonth.getMonth() - 1))}
                        className="h-8 w-8 p-0 hover:bg-accent rounded-md absolute left-0 top-0 flex items-center justify-center"
                      >
                        ←
                      </button>
                    )}
                    <span className="px-8">{children}</span>
                    {!isFirstMonth && (
                      <button
                        onClick={() => goToMonth && goToMonth(new Date((props as any).displayMonth.getFullYear(), (props as any).displayMonth.getMonth() + 1))}
                        className="h-8 w-8 p-0 hover:bg-accent rounded-md absolute right-0 top-0 flex items-center justify-center"
                      >
                        →
                      </button>
                    )}
                  </div>
                )
              }
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}
