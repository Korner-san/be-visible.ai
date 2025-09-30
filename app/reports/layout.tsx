import { redirect } from 'next/navigation'
import { getUserState } from '@/lib/supabase/user-state'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function ReportsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Server-first route guard - enforce onboarding completion
  const userState = await getUserState()
  
  console.log('📊 [REPORTS LAYOUT] User state:', userState.state)
  console.log('📊 [REPORTS LAYOUT] Timestamp:', new Date().toISOString())
  
  // Redirect users who haven't completed onboarding
  if (userState.state === 'NOT_AUTHENTICATED') {
    console.log('🚫 [REPORTS LAYOUT] SERVER GUARD decided: AUTH (not authenticated)')
    redirect('/auth/signin')
  }
  
  if (userState.state === 'AUTHENTICATED_NO_BRAND' || 
      userState.state === 'AUTHENTICATED_ONBOARDING_IN_PROGRESS') {
    console.log('🚫 [REPORTS GUARD] SERVER GUARD decision → /setup/onboarding because: hasCompleted=false, hasAnyCompleted=false, hasPending=true, state=' + userState.state)
    redirect('/setup/onboarding')
  }
  
  console.log('✅ [REPORTS LAYOUT] SERVER GUARD decided: DASHBOARD (allow access)')
  
  // Allow access for users who have completed onboarding
  // (AUTHENTICATED_ONBOARDING_DONE_NO_REPORT and AUTHENTICATED_READY)
  return <>{children}</>
}