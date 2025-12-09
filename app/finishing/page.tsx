import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { FinishingClient } from './finishing-client'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function FinishingPage() {
  const supabase = await createClient()
  
  console.log('🎯 [FINISHING PAGE] Starting handoff page render - ENHANCED DIAGNOSTICS')
  console.log('🎯 [FINISHING PAGE] Timestamp:', new Date().toISOString())
  
  // Get current session - this page is always accessible for authenticated users
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  
  if (authError || !user) {
    console.log('🚫 [FINISHING PAGE] Not authenticated, redirecting to signin')
    redirect('/auth/signin')
  }

  console.log('🎯 [FINISHING PAGE] User authenticated:', user.id)

  // DIAGNOSTIC: Check ALL brands first to see what's actually in the database
  const { data: allBrands, error: allBrandsError } = await supabase
    .from('brands')
    .select('id, name, domain, onboarding_completed, first_report_status, is_demo')
    .eq('owner_user_id', user.id)
    .order('created_at', { ascending: false })

  console.log('🔍 [FINISHING PAGE] ALL brands for user:', allBrands)
  console.log('🔍 [FINISHING PAGE] All brands error:', allBrandsError)

  // Force fresh read of brand state (no cache) - only completed brands
  const { data: completedBrands, error: brandsError } = await supabase
    .from('brands')
    .select('id, name, domain, onboarding_completed, first_report_status')
    .eq('owner_user_id', user.id)
    .eq('is_demo', false)
    .eq('onboarding_completed', true)
    .order('created_at', { ascending: false })

  console.log('🔍 [FINISHING PAGE] Completed brands query result:', completedBrands)
  console.log('🔍 [FINISHING PAGE] Completed brands error:', brandsError)

  if (brandsError) {
    console.error('❌ [FINISHING PAGE] Error reading brands:', brandsError)
    // Fallback to dashboard on error
    redirect('/reports/overview')
  }

  const completedBrand = completedBrands?.[0]
  console.log('🎯 [FINISHING PAGE] Final completed brand:', {
    id: completedBrand?.id,
    name: completedBrand?.name,
    onboarding_completed: completedBrand?.onboarding_completed,
    first_report_status: completedBrand?.first_report_status
  })

  if (!completedBrand) {
    console.log('🚫 [FINISHING PAGE] No completed brand found')
    console.log('🚫 [FINISHING PAGE] This means the database update may have failed or not committed')
    console.log('🚫 [FINISHING PAGE] Total brands found:', allBrands?.length || 0)
    
    // Check if there are ANY non-demo brands (completed or not)
    const nonDemoBrands = allBrands?.filter(b => !b.is_demo) || []
    console.log('🔍 [FINISHING PAGE] Non-demo brands:', nonDemoBrands)
    
    if (nonDemoBrands.length > 0) {
      console.log('🔍 [FINISHING PAGE] Found non-demo brands but none completed - database update may have failed')
      console.log('🔍 [FINISHING PAGE] Redirecting to dashboard with error message')
      redirect('/reports/overview?error=completion_failed')
    } else {
      console.log('🔍 [FINISHING PAGE] No brands found at all - redirecting to onboarding')
      redirect('/setup/onboarding')
    }
  }

  console.log('✅ [FINISHING PAGE] Rendering handoff screen for brand:', completedBrand.name)

  return (
    <FinishingClient 
      brandName={completedBrand.name}
      brandId={completedBrand.id}
    />
  )
}
