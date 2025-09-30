'use client'

import { useRouter } from 'next/navigation'
import { useCallback } from 'react'

export function useOnboardingNavigation() {
  const router = useRouter()

  const navigateWithLoading = useCallback((path: string, delay: number = 300) => {
    // Add a small delay to show loading state
    setTimeout(() => {
      router.push(path)
    }, delay)
  }, [router])

  return {
    navigateWithLoading,
    router
  }
}
