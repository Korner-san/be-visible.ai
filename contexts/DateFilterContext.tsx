'use client'

import { createContext, useContext, useState, ReactNode } from 'react'
import { DateRange } from '@/components/GlobalDateFilter'

interface DateFilterContextType {
  dateRange: DateRange
  setDateRange: (range: DateRange) => void
  getDateRangeParams: () => string
}

const DateFilterContext = createContext<DateFilterContextType | undefined>(undefined)

export function DateFilterProvider({ children }: { children: ReactNode }) {
  const [dateRange, setDateRange] = useState<DateRange>({
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
    to: new Date()
  })

  const getDateRangeParams = () => {
    if (!dateRange.from || !dateRange.to) return ''
    
    const from = dateRange.from.toISOString().split('T')[0]
    const to = dateRange.to.toISOString().split('T')[0]
    
    return `&from=${from}&to=${to}`
  }

  return (
    <DateFilterContext.Provider value={{ dateRange, setDateRange, getDateRangeParams }}>
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
