import { createClient } from '@/lib/supabase/server'

/**
 * Development-only diagnostic functions for onboarding flow
 */

export async function checkOnboardingAccess(userId: string): Promise<{
  canAccessOnboarding: boolean
  reason: string
  completedBrandsCount: number
  pendingBrandsCount: number
}> {
  if (process.env.NODE_ENV !== 'development') {
    throw new Error('Diagnostic functions only available in development')
  }

  const supabase = createClient()
  
  // Check completed brands
  const { data: completedBrands, error: completedError } = await supabase
    .from('brands')
    .select('id, name, domain, onboarding_completed')
    .eq('owner_user_id', userId)
    .eq('is_demo', false)
    .eq('onboarding_completed', true)

  if (completedError) {
    console.error('Error checking completed brands:', completedError)
    return {
      canAccessOnboarding: false,
      reason: 'Database error',
      completedBrandsCount: 0,
      pendingBrandsCount: 0
    }
  }

  // Check pending brands
  const { data: pendingBrands, error: pendingError } = await supabase
    .from('brands')
    .select('id, name, domain, onboarding_completed')
    .eq('owner_user_id', userId)
    .eq('is_demo', false)
    .eq('onboarding_completed', false)

  if (pendingError) {
    console.error('Error checking pending brands:', pendingError)
    return {
      canAccessOnboarding: false,
      reason: 'Database error',
      completedBrandsCount: completedBrands?.length || 0,
      pendingBrandsCount: 0
    }
  }

  const completedCount = completedBrands?.length || 0
  const pendingCount = pendingBrands?.length || 0

  let canAccess = true
  let reason = 'Can access onboarding'

  if (completedCount > 0) {
    canAccess = false
    reason = `User has ${completedCount} completed brand(s) - should be redirected to dashboard`
  } else if (pendingCount === 0) {
    canAccess = true
    reason = 'No brands found - user needs onboarding'
  } else {
    canAccess = true
    reason = `User has ${pendingCount} pending brand(s) - can continue onboarding`
  }

  console.log('🔍 [Onboarding Diagnostic]', {
    userId,
    canAccessOnboarding: canAccess,
    reason,
    completedBrandsCount: completedCount,
    pendingBrandsCount: pendingCount
  })

  return {
    canAccessOnboarding: canAccess,
    reason,
    completedBrandsCount: completedCount,
    pendingBrandsCount: pendingCount
  }
}

export async function logBrandSelectionDecision(userId: string, selectedBrandId: string, reason: string) {
  if (process.env.NODE_ENV !== 'development') {
    return
  }

  const supabase = createClient()
  
  const { data: selectedBrand } = await supabase
    .from('brands')
    .select('id, name, is_demo, first_report_status')
    .eq('id', selectedBrandId)
    .single()

  console.log('🎯 [Brand Selection Diagnostic]', {
    userId,
    selectedBrandId,
    selectedBrandName: selectedBrand?.name,
    isDemo: selectedBrand?.is_demo,
    reportStatus: selectedBrand?.first_report_status,
    reason
  })
}
