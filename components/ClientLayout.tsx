"use client"

import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { BrandSelector } from '@/components/inputs/BrandSelector'
import { TimeRangePicker } from '@/components/inputs/TimeRangePicker'
import { NavLink } from '@/components/NavigationHighlight'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import OnboardingLoader from '@/components/OnboardingLoader'
import { 
  BarChart3, 
  MessageSquare, 
  Globe, 
  Zap, 
  FileText, 
  HelpCircle, 
  User,
  Settings,
  Users,
  CreditCard,
  Headphones,
  LogOut
} from 'lucide-react'

export const ClientLayout = ({ children }: { children: React.ReactNode }) => {
  const { user, signOut } = useAuth()
  const pathname = usePathname()
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [transitionMessage, setTransitionMessage] = useState('')

  // Enhanced onboarding mode detection
  const isAuthPage = pathname?.startsWith('/auth')
  const isOnboardingPage = pathname?.startsWith('/setup/onboarding') || 
                          pathname?.startsWith('/onboarding') ||
                          pathname === '/finishing'

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

  // If on auth pages or onboarding, just render children without sidebar/topbar
  if (isAuthPage || isOnboardingPage) {
    return <>{children}</>
  }

  // If not authenticated and not on auth page, just render children (server handles routing)
  if (!user) {
    return <>{children}</>
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
    <div className="flex h-screen bg-slate-50">
      {/* Left Sidebar - Setup/Management (Fixed) */}
      <div className="w-64 bg-slate-50 border-r border-slate-200 flex flex-col shadow-sm">
        {/* Logo/Header */}
        <div className="px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center shadow-sm">
              <span className="text-white font-semibold text-sm">B</span>
            </div>
            <span className="font-semibold text-slate-900 text-base tracking-tight">be-visible.ai</span>
          </div>
        </div>

        {/* Brand Selector */}
        <div className="px-4 py-4 border-b border-slate-100">
          <div className="mb-3">
            <h3 className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Active Brand</h3>
          </div>
          <div className="px-3">
            <BrandSelector />
          </div>
        </div>

        {/* Setup/Management Navigation (Fixed) */}
        <nav className="flex-1 px-4 py-4">
          <div className="mb-4">
            <h3 className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Setup & Management</h3>
          </div>
          <ul className="space-y-1">
            <li>
              <NavLink
                href="/setup/prompts"
                className="flex items-center gap-3 px-3 py-2.5 text-sm text-slate-600 hover:bg-white hover:text-slate-900 rounded-lg transition-all"
                activeClassName="flex items-center gap-3 px-3 py-2.5 text-sm text-slate-900 bg-white rounded-lg transition-all"
              >
                <Settings className="w-4 h-4" />
                Manage Prompts
              </NavLink>
            </li>
            <li>
              <NavLink
                href="/setup/competitors"
                className="flex items-center gap-3 px-3 py-2.5 text-sm text-slate-600 hover:bg-white hover:text-slate-900 rounded-lg transition-all"
                activeClassName="flex items-center gap-3 px-3 py-2.5 text-sm text-slate-900 bg-white rounded-lg transition-all"
              >
                <Users className="w-4 h-4" />
                Competitors
              </NavLink>
            </li>
            <li>
              <NavLink
                href="/setup/integrations"
                className="flex items-center gap-3 px-3 py-2.5 text-sm text-slate-600 hover:bg-white hover:text-slate-900 rounded-lg transition-all"
                activeClassName="flex items-center gap-3 px-3 py-2.5 text-sm text-slate-900 bg-white rounded-lg transition-all"
              >
                <Zap className="w-4 h-4" />
                Integrations
              </NavLink>
            </li>
            <li>
              <NavLink
                href="/setup/billing"
                className="flex items-center gap-3 px-3 py-2.5 text-sm text-slate-600 hover:bg-white hover:text-slate-900 rounded-lg transition-all"
                activeClassName="flex items-center gap-3 px-3 py-2.5 text-sm text-slate-900 bg-white rounded-lg transition-all"
              >
                <CreditCard className="w-4 h-4" />
                Billing
              </NavLink>
            </li>
            <li>
              <NavLink
                href="/setup/support"
                className="flex items-center gap-3 px-3 py-2.5 text-sm text-slate-600 hover:bg-white hover:text-slate-900 rounded-lg transition-all"
                activeClassName="flex items-center gap-3 px-3 py-2.5 text-sm text-slate-900 bg-white rounded-lg transition-all"
              >
                <Headphones className="w-4 h-4" />
                Support
              </NavLink>
            </li>
            <li>
              <NavLink
                href="/setup/brands"
                className="flex items-center gap-3 px-3 py-2.5 text-sm text-slate-600 hover:bg-white hover:text-slate-900 rounded-lg transition-all"
                activeClassName="flex items-center gap-3 px-3 py-2.5 text-sm text-slate-900 bg-white rounded-lg transition-all"
              >
                <Globe className="w-4 h-4" />
                Brands
              </NavLink>
            </li>
          </ul>
        </nav>

        {/* Bottom User Info */}
        <div className="px-4 py-4 border-t border-slate-100">
          <div className="flex items-center justify-between px-3 py-2.5">
            <NavLink
              href="/profile"
              className="flex items-center gap-3 hover:bg-slate-200 rounded-lg px-2 py-1 transition-colors"
              activeClassName="flex items-center gap-3 bg-slate-200 rounded-lg px-2 py-1"
            >
              <User className="w-4 h-4" />
              <span className="text-sm font-medium text-slate-900">
                {user?.user_metadata?.first_name || user?.email?.split('@')[0] || 'User'}
              </span>
            </NavLink>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              className="p-1 h-auto hover:bg-slate-200"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col">
        {/* Top Navigation - Report Sections (Fixed) */}
        <div className="bg-white border-b border-slate-200 px-8 shadow-sm">
          <div className="flex items-center justify-between">
            <nav className="flex space-x-8">
              <NavLink 
                href="/reports/overview" 
                className="border-b-2 border-transparent py-4 px-1 text-sm font-medium text-slate-500 hover:text-slate-700 hover:border-slate-300 transition-all"
                activeClassName="border-b-2 border-slate-900 py-4 px-1 text-sm font-semibold text-slate-900"
              >
                Overview
              </NavLink>
              <NavLink
                href="/reports/visibility"
                className="border-b-2 border-transparent py-4 px-1 text-sm font-medium text-slate-500 hover:text-slate-700 hover:border-slate-300 transition-all"
                activeClassName="border-b-2 border-slate-900 py-4 px-1 text-sm font-semibold text-slate-900"
              >
                Visibility
              </NavLink>
              <NavLink
                href="/reports/citations"
                className="border-b-2 border-transparent py-4 px-1 text-sm font-medium text-slate-500 hover:text-slate-700 hover:border-slate-300 transition-all"
                activeClassName="border-b-2 border-slate-900 py-4 px-1 text-sm font-semibold text-slate-900"
              >
                Citations
              </NavLink>
              <NavLink
                href="/reports/content"
                className="border-b-2 border-transparent py-4 px-1 text-sm font-medium text-slate-500 hover:text-slate-700 hover:border-slate-300 transition-all"
                activeClassName="border-b-2 border-slate-900 py-4 px-1 text-sm font-semibold text-slate-900"
              >
                Content
              </NavLink>
              <NavLink
                href="/reports/prompts"
                className="border-b-2 border-transparent py-4 px-1 text-sm font-medium text-slate-500 hover:text-slate-700 hover:border-slate-300 transition-all"
                activeClassName="border-b-2 border-slate-900 py-4 px-1 text-sm font-semibold text-slate-900"
              >
                Prompts
              </NavLink>
            </nav>
            <div className="py-4">
              <TimeRangePicker />
            </div>
          </div>
        </div>

        {/* Page Content */}
        <div className="flex-1 overflow-auto bg-white">
          {children}
        </div>
      </div>
    </div>
  )
}