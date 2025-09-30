import { redirect } from 'next/navigation'
import { getUserState } from '@/lib/supabase/user-state'

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  console.log('🔄 [ONBOARDING LAYOUT] Layout called')
  console.log('🔄 [ONBOARDING LAYOUT] Timestamp:', new Date().toISOString())
  
  // Server-first route guard - only allow users who need onboarding
  console.log('🔍 [ONBOARDING LAYOUT] Getting user state...')
  const userState = await getUserState()
  
  console.log('📊 [ONBOARDING LAYOUT] User state result:', {
    state: userState.state,
    hasUser: !!userState.user,
    userId: userState.user?.id,
    hasRealBrands: userState.hasRealBrands,
    hasPendingBrand: userState.hasPendingBrand,
    firstReportReady: userState.firstReportReady
  })
  
  // Redirect unauthenticated users
  if (userState.state === 'NOT_AUTHENTICATED') {
    console.log('🚫 [ONBOARDING LAYOUT] Redirecting unauthenticated user to signin')
    redirect('/auth/signin')
  }
  
  // CRITICAL: Only redirect if user has completed onboarding AND is trying to access onboarding
  // The finishing page is now outside this layout, so we can safely redirect completed users
  if (userState.state === 'AUTHENTICATED_READY') {
    console.log('🚫 [ONBOARDING LAYOUT] Completed user accessing onboarding - redirecting to dashboard')
    redirect('/reports/overview')
  }
  
  if (userState.state === 'AUTHENTICATED_ONBOARDING_DONE_NO_REPORT') {
    console.log('🚫 [ONBOARDING LAYOUT] Completed user (no report) accessing onboarding - redirecting to dashboard')
    redirect('/reports/overview?demo=true')
  }
  
  console.log('✅ [ONBOARDING LAYOUT] Allowing access to onboarding for state:', userState.state)
  
  // Full-screen onboarding layout - no top bar, no sidebar, no navigation
  // Override any parent background with full white using fixed positioning
  return (
    <div className="fixed inset-0 bg-white w-full h-full z-50 overflow-y-auto">
      <div className="min-h-screen w-full bg-white">
        {/* Full-screen onboarding content */}
        <main className="w-full bg-white min-h-screen">
          <div className="w-full max-w-2xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
