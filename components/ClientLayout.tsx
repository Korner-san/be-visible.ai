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
import { Button } from '@/components/ui/button'
import OnboardingLoader from '@/components/OnboardingLoader'
import {
  LayoutDashboard,
  Shield,
  Link2,
  CreditCard,
  HelpCircle,
  LogOut,
  Calendar,
  Monitor,
  RefreshCw,
  Maximize2,
  ChevronDown,
  Globe,
} from 'lucide-react'

export const ClientLayout = ({ children }: { children: React.ReactNode }) => {
  const { user, signOut } = useAuth()
  const { dateRange, setDateRange } = useDateFilter()
  const pathname = usePathname()
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [transitionMessage, setTransitionMessage] = useState('')
  const [isScrolled, setIsScrolled] = useState(false)

  // Enhanced onboarding mode detection
  const isAuthPage = pathname?.startsWith('/auth')
  const isOnboardingPage = pathname?.startsWith('/setup/onboarding') ||
                          pathname?.startsWith('/onboarding') ||
                          pathname === '/finishing'
  const isLoadingPage = pathname === '/loading'

  // Track scroll for glassmorphism header effect
  useEffect(() => {
    const handleScroll = () => {
      const mainContent = document.getElementById('main-content')
      if (mainContent) {
        setIsScrolled(mainContent.scrollTop > 10)
      }
    }

    const mainContent = document.getElementById('main-content')
    mainContent?.addEventListener('scroll', handleScroll)
    return () => mainContent?.removeEventListener('scroll', handleScroll)
  }, [])

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
          }, 1000)

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
  if (pathname === '/') {
    return <OnboardingLoader message="Loading your account..." />
  }

  const handleSignOut = async () => {
    try {
      await signOut()
      window.location.replace('/')
    } catch (error) {
      console.error('Sign out error:', error)
      window.location.replace('/')
    }
  }

  // Header tabs configuration
  const headerTabs = [
    { label: 'Visibility', href: '/reports/visibility' },
    { label: 'Competitors', href: '/reports/competitors' },
    { label: 'Citations', href: '/reports/citations' },
    { label: 'Prompts', href: '/reports/prompts' },
    { label: 'Improve', href: '/reports/improve' },
  ]

  // Sidebar nav items
  const sidebarItems = [
    { label: 'Manage Prompts', href: '/setup/prompts', icon: LayoutDashboard },
    { label: 'Manage Competitors', href: '/setup/competitors', icon: Shield },
    { label: 'Integrations', href: '/setup/integrations', icon: Link2 },
    { label: 'Billing', href: '/setup/billing', icon: CreditCard },
    { label: 'Support', href: '/setup/support', icon: HelpCircle },
  ]

  const userInitials = user?.user_metadata?.first_name
    ? user.user_metadata.first_name.slice(0, 2).toUpperCase()
    : user?.email?.slice(0, 2).toUpperCase() || 'U'

  const userName = user?.user_metadata?.first_name || user?.email?.split('@')[0] || 'User'

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Left Sidebar */}
      <aside className="w-60 bg-white border-r border-gray-200 flex flex-col h-full shrink-0 z-20">
        {/* Logo Area */}
        <div className="h-20 flex items-center px-6 border-b border-gray-100">
          <Link href="/reports/visibility" className="flex items-center gap-3">
            <div className="w-8 h-8 bg-brand-brown rounded-lg flex items-center justify-center shadow-sm">
              <span className="text-white font-semibold text-sm">B</span>
            </div>
            <span className="font-semibold text-brand-brown text-base tracking-tight">be-visible.ai</span>
          </Link>
        </div>

        <div className="p-5 space-y-6 flex-1 overflow-y-auto custom-scrollbar">
          {/* Active Brand Selector */}
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2.5 block px-1">
              Active Brand
            </label>
            <div className="px-0">
              <BrandSelector />
            </div>
          </div>

          {/* Navigation */}
          <nav className="space-y-1.5">
            {sidebarItems.map((item) => (
              <NavLink
                key={item.href}
                href={item.href}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-slate-600 hover:bg-gray-50 hover:text-brand-brown"
                activeClassName="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors bg-brand-brown text-white shadow-sm"
              >
                <item.icon size={18} className="shrink-0" />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>

        {/* User Footer */}
        <div className="p-5 border-t border-gray-100">
          <div className="flex items-center justify-between">
            <NavLink
              href="/profile"
              className="flex items-center gap-3 p-2 rounded-xl transition-all hover:bg-gray-50 text-left flex-1 min-w-0"
              activeClassName="flex items-center gap-3 p-2 rounded-xl transition-all bg-slate-50 ring-1 ring-brand-brown/10 text-left flex-1 min-w-0"
            >
              <div className="w-9 h-9 rounded-full bg-brand-brown text-white flex items-center justify-center font-medium text-sm shrink-0">
                {userInitials}
              </div>
              <div className="flex flex-col overflow-hidden">
                <span className="text-sm font-semibold text-brand-brown truncate">{userName}</span>
                <span className="text-[10px] text-slate-400 uppercase font-bold tracking-tight">Account</span>
              </div>
            </NavLink>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              className="p-2 h-auto hover:bg-gray-100 rounded-full shrink-0"
              title="Sign out"
            >
              <LogOut className="w-4 h-4 text-gray-400" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col relative min-w-0">
        {/* Header */}
        <header
          className={`px-4 h-16 flex items-center justify-between shrink-0 z-20 transition-all duration-300 ${
            isScrolled
              ? 'bg-white/80 backdrop-blur-lg border-b border-gray-200/50 shadow-sm'
              : 'bg-white border-b border-gray-200 shadow-sm'
          }`}
        >
          {/* Tabs */}
          <nav className="flex space-x-1 h-full items-center">
            {headerTabs.map((tab) => {
              const isActive = pathname === tab.href
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? 'bg-brand-brown text-white shadow-md'
                      : 'text-slate-500 hover:bg-gray-100 hover:text-brand-brown'
                  }`}
                >
                  {tab.label}
                </Link>
              )
            })}
          </nav>

          {/* Controls */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <GlobalModelFilter />
              <GlobalDateFilter
                onDateRangeChange={setDateRange}
                defaultRange={dateRange}
              />
            </div>

            <div className="flex items-center gap-1.5 text-gray-400">
              <button className="p-2 hover:bg-gray-100 rounded-full transition-colors hover:text-brand-brown">
                <Calendar size={18} />
              </button>
              <button className="p-2 hover:bg-gray-100 rounded-full transition-colors hover:text-brand-brown">
                <Monitor size={18} />
              </button>
              <button className="p-2 hover:bg-gray-100 rounded-full transition-colors hover:text-brand-brown">
                <RefreshCw size={18} />
              </button>
              <button className="p-2 hover:bg-gray-100 rounded-full transition-colors hover:text-brand-brown">
                <Maximize2 size={18} />
              </button>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div id="main-content" className="flex-1 overflow-auto bg-white">
          {children}
        </div>
      </div>
    </div>
  )
}
