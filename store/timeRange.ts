import { create } from 'zustand'

export type TimeRange = '7d' | '30d' | '90d' | 'custom'

interface TimeRangeState {
  range: TimeRange
  from?: Date
  to?: Date
  setRange: (range: TimeRange, from?: Date, to?: Date) => void
}

export const useTimeRangeStore = create<TimeRangeState>((set) => ({
  range: '7d',
  from: undefined,
  to: undefined,
  setRange: (range, from, to) => set({ range, from, to }),
}))