"use client"

import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { BrandSelector } from '@/components/inputs/BrandSelector'
import { NavLink } from '@/components/NavigationHighlight'
import { useAuth } from '@/contexts/AuthContext'
import { useDateFilter } from '@/contexts/DateFilterContext'
import GlobalDateFilter from '@/components/GlobalDateFilter'
import { GlobalModelFilter } from '@/components/GlobalModelFilter'
Settings,
  Users,
  CreditCard,
  Headphones,
  LogOut
} from 'lucide-react'
import DashboardLayout from '@/components/layout/DashboardLayout'

export const ClientLayout = ({ children }: { children: React.ReactNode }) => {
  const { user, signOut } = useAuth()
  const { dateRange, setDateRange } = useDateFilter()
  const pathname = usePathname()
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [transitionMessage, setTransitionMessage] = useState('')

  // Enhanced onboarding mode detection
  const isAuthPage = pathname?.startsWith('/auth')
  const isOnboardingPage = pathname?.startsWith('/setup/onboarding') ||
    pathname?.startsWith('/onboarding') ||
    pathname === '/finishing'
  const isLoadingPage = pathname === '/loading'

  // Handle route transitions for onboarding
  useEffect(() => {
    const handleRouteChange = () => {
      if (isOnboardingPage) {
        setIsTransitioning(true)

        // Set appropriate loading message based on route
        if (pathname?.includes('add-prompts')) {
          setTransitionMessage('Preparing custom prompts...')
        } else if (pathname?.includes('review-prompts')) {
          setTransitionMessage('Loading your prompts...')
        } else if (pathname?.includes('generate-prompts')) {
          setTransitionMessage('Generating AI prompts...')
        } else if (pathname === '/finishing') {
          setTransitionMessage('Completing your setup...')
        } else {
          setTransitionMessage('Setting up your brand...')
        }

        // Clear loading state after a short delay to prevent flash
        const timer = setTimeout(() => {
          setIsTransitioning(false)
        }, 200)

        return () => clearTimeout(timer)
      } else {
        // If transitioning from onboarding to dashboard, show completion message
        const urlParams = new URLSearchParams(window.location.search)
        if (urlParams.get('onboarding_completed') === 'true') {
          setIsTransitioning(true)
          setTransitionMessage('Welcome to your dashboard!')

          // Clear the URL parameter and loading state
          const timer = setTimeout(() => {
            setIsTransitioning(false)
            // Clean up the URL
            const newUrl = window.location.pathname
            window.history.replaceState({}, '', newUrl)
          }, 1000) // Reduced from 1500ms to 1000ms

          return () => clearTimeout(timer)
        }
      }
    }

    handleRouteChange()
  }, [pathname, isOnboardingPage])

  // Show loading screen during onboarding transitions or dashboard welcome
  if (isTransitioning) {
    return <OnboardingLoader message={transitionMessage} />
  }

  // If on auth pages, onboarding, or loading page, just render children without sidebar/topbar
  if (isAuthPage || isOnboardingPage || isLoadingPage) {
    return <>{children}</>
  }

  // If not authenticated and not on auth page, just render children (server handles routing)
  if (!user) {
    return <>{children}</>
  }

  // If user is authenticated but we're on the home page, show loading to prevent dashboard flash
  // This ensures auto-signed-in users go through the same loading flow as manual sign-ins
  if (pathname === '/') {
    return <OnboardingLoader message="Loading your account..." />
  }

  const handleSignOut = async () => {
    try {
      await signOut()
      // Force complete page reload to clear all state
      window.location.replace('/')
    } catch (error) {
      console.error('Sign out error:', error)
      // Force reload even if sign out fails
      window.location.replace('/')
    }
  }

  return (
    <DashboardLayout>
      {children}
    </DashboardLayout>
  )
}
