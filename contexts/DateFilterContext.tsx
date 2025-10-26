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

  // Helper function to format date in local timezone (not UTC)
  const formatDateForAPI = (date: Date): string => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const getDateRangeParams = () => {
    if (!dateRange.from || !dateRange.to) return ''
    
    // Use local timezone formatting to avoid timezone conversion bugs
    const from = formatDateForAPI(dateRange.from)
    const to = formatDateForAPI(dateRange.to)
    
    return `&from=${from}&to=${to}`
  }

  const getDateRangeForAPI = () => {
    if (!dateRange.from || !dateRange.to) return { from: null, to: null }
    
    // Use local timezone formatting to avoid timezone conversion bugs
    // This ensures "Oct 26" in local time stays "2025-10-26" in the API
    const from = formatDateForAPI(dateRange.from)
    const to = formatDateForAPI(dateRange.to)
    
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
