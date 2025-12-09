import { redirect } from 'next/navigation'
import { getUserState, getRouteForState } from '@/lib/supabase/user-state'
import { createClient } from '@/lib/supabase/server'
import { checkOnboardingAccess } from '@/lib/diagnostics/onboarding'
import { OnboardingClient } from './onboarding-client'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function OnboardingPage({ searchParams }: { 
  searchParams: { forceOnboarding?: string } 
}) {
  // Server-first route decision
  const userState = await getUserState()
  
  console.log('📝 [ONBOARDING PAGE] User state:', userState.state, 'Force:', searchParams.forceOnboarding)
  console.log('📝 [ONBOARDING PAGE] Timestamp:', new Date().toISOString())
  
  // Handle unauthenticated users
  if (userState.state === 'NOT_AUTHENTICATED') {
    redirect('/auth/signin')
  }
  
  // Handle admin/dev force onboarding
  const forceOnboarding = searchParams.forceOnboarding === '1'
  
  // Additional check: If user has any completed brands, redirect to dashboard
  // This prevents the loop after onboarding completion
  if (!forceOnboarding) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (user) {
      const { data: completedBrands } = await supabase
        .from('brands')
        .select('id')
        .eq('owner_user_id', user.id)
        .eq('is_demo', false)
        .eq('onboarding_completed', true)
        .limit(1)
      
      if (completedBrands && completedBrands.length > 0) {
        console.log('🚫 [ONBOARDING GUARD] SERVER GUARD decision → /reports/overview because: hasCompleted=true, hasAnyCompleted=true, hasPending=false, brandCount=' + completedBrands.length)
        console.log('🚫 [ONBOARDING GUARD] Completed brands:', completedBrands.map(b => ({ id: b.id, onboarding_completed: true })))
        
        // Run diagnostic check
        if (process.env.NODE_ENV === 'development') {
          try {
            await checkOnboardingAccess(user.id)
          } catch (error) {
            console.error('Diagnostic check failed:', error)
          }
        }
        redirect('/reports/overview')
      }
    }
    
    // If user doesn't need onboarding and it's not forced, redirect to dashboard
    if (userState.state === 'AUTHENTICATED_READY') {
      console.log('🚫 [ONBOARDING PAGE] SERVER GUARD decided: DASHBOARD (AUTHENTICATED_READY)')
      redirect('/reports/overview')
    }
    
    if (userState.state === 'AUTHENTICATED_ONBOARDING_DONE_NO_REPORT') {
      console.log('🚫 [ONBOARDING PAGE] SERVER GUARD decided: DASHBOARD (ONBOARDING_DONE_NO_REPORT)')
      redirect('/reports/overview?demo=true')
    }
  }

  console.log('✅ [ONBOARDING PAGE] SERVER GUARD decided: ONBOARDING (allow access)')
  console.log('✅ [ONBOARDING PAGE] Final user state:', userState.state)

  // Valid states for onboarding: AUTHENTICATED_NO_BRAND, AUTHENTICATED_ONBOARDING_IN_PROGRESS
  // Or forced onboarding for any authenticated user
  return <OnboardingClient userState={userState} />
}
