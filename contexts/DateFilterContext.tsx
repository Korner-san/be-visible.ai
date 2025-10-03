'use client'

import { createContext, useContext, useState, ReactNode } from 'react'
import { DateRange } from '@/components/GlobalDateFilter'

interface DateFilterContextType {
  dateRange: DateRange
  setDateRange: (range: DateRange) => void
  getDateRangeParams: () => string
  getDateRangeForAPI: () => { from: string | null; to: string | null }
}

const DateFilterContext = createContext<DateFilterContextType | undefined>(undefined)

export function DateFilterProvider({ children }: { children: ReactNode }) {
  const [dateRange, setDateRange] = useState<DateRange>({
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
    to: new Date()
  })

  const getDateRangeParams = () => {
    if (!dateRange.from || !dateRange.to) return ''
    
    // Ensure inclusive date range - from date starts at beginning of day, to date ends at end of day
    const from = dateRange.from.toISOString().split('T')[0]
    const to = dateRange.to.toISOString().split('T')[0]
    
    return `&from=${from}&to=${to}`
  }

  const getDateRangeForAPI = () => {
    if (!dateRange.from || !dateRange.to) return { from: null, to: null }
    
    // Return dates as strings in YYYY-MM-DD format for inclusive filtering
    const from = dateRange.from.toISOString().split('T')[0]
    const to = dateRange.to.toISOString().split('T')[0]
    
    return { from, to }
  }

  return (
    <DateFilterContext.Provider value={{ dateRange, setDateRange, getDateRangeParams, getDateRangeForAPI }}>
      {children}
    </DateFilterContext.Provider>
  )
}

export function useDateFilter() {
  const context = useContext(DateFilterContext)
  if (context === undefined) {
    throw new Error('useDateFilter must be used within a DateFilterProvider')
  }
  return context
}
