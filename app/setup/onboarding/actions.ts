'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// Normalize domain function
const normalizeDomain = (domain: string): string => {
  if (!domain) return ''
  
  // Remove protocol and www
  let normalized = domain.replace(/^https?:\/\//, '').replace(/^www\./, '')
  
  // Remove trailing slash
  normalized = normalized.replace(/\/$/, '')
  
  return normalized.toLowerCase()
}

export async function completeOnboardingAction() {
  const supabase = createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  
  if (authError || !user) {
    console.error('❌ [Server Action] AUTH ERROR:', authError?.message || 'No user')
    throw new Error('Unauthorized')
  }

  console.log('🔄 [COMPLETION ACTION] STARTING completion for user:', user.id)
  console.log('🔄 [COMPLETION ACTION] Timestamp:', new Date().toISOString())

  // Get the user's pending brand
  const { data: pendingBrands, error: brandError } = await supabase
    .from('brands')
    .select('id, name, domain, onboarding_answers, onboarding_completed')
    .eq('owner_user_id', user.id)
    .eq('is_demo', false)
    .eq('onboarding_completed', false)
    .order('created_at', { ascending: false })
    .limit(1)

  if (brandError) {
    console.error('Error finding pending brand:', brandError)
    throw new Error('Database error while finding brand')
  }

  if (!pendingBrands || pendingBrands.length === 0) {
    throw new Error('No pending brand found. Please start the onboarding process.')
  }

  const brand = pendingBrands[0]
  const onboardingAnswers = brand.onboarding_answers as any

  console.log('🔍 [COMPLETION ACTION] Resolved brand_id:', brand.id)
  console.log('🔍 [COMPLETION ACTION] onboarding_completed BEFORE:', brand.onboarding_completed)
  console.log('🔍 [COMPLETION ACTION] first_report_status BEFORE:', (brand as any).first_report_status)

  // Idempotency check - if already completed, redirect to finishing page
  if (brand.onboarding_completed) {
    console.log('⚡ [COMPLETION ACTION] IDEMPOTENT: Brand already completed, redirecting to finishing')
    redirect('/setup/finishing')
  }

  if (!onboardingAnswers || !onboardingAnswers.brandName) {
    console.error('❌ [Server Action] Missing onboarding answers')
    throw new Error('Onboarding answers not found. Please complete the form first.')
  }

  // Validate minimum number of selected prompts
  const { count: selectedPromptsCount } = await supabase
    .from('brand_prompts')
    .select('*', { count: 'exact', head: true })
    .eq('brand_id', brand.id)
    .eq('status', 'selected')

  const minRequiredPrompts = 15
  if (!selectedPromptsCount || selectedPromptsCount < minRequiredPrompts) {
    throw new Error(`At least ${minRequiredPrompts} prompts must be selected to complete onboarding. Currently selected: ${selectedPromptsCount || 0}`)
  }

  // Normalize domain if provided
  let normalizedDomain = brand.domain
  if (onboardingAnswers.websiteUrl) {
    normalizedDomain = normalizeDomain(onboardingAnswers.websiteUrl)
  } else if (brand.domain) {
    normalizedDomain = normalizeDomain(brand.domain)
  }

  // DIAGNOSTIC: Verify brand exists before update
  console.log('🔍 [COMPLETION ACTION] About to update brand:', brand.id, 'for user:', user.id)
  
  // Update brand to complete onboarding
  const { data: updatedBrand, error: updateError } = await supabase
    .from('brands')
    .update({
      name: onboardingAnswers.brandName,
      domain: normalizedDomain,
      onboarding_completed: true,
      first_report_status: 'queued'
    })
    .eq('id', brand.id)
    .select('id, name, domain, onboarding_completed, first_report_status')
    .single()
  
  console.log('🔍 [COMPLETION ACTION] Update result - data:', updatedBrand)
  console.log('🔍 [COMPLETION ACTION] Update result - error:', updateError)

  if (updateError || !updatedBrand) {
    console.error('❌ [COMPLETION ACTION] UPDATE ERROR:', updateError)
    throw new Error('Failed to complete onboarding')
  }

  console.log('✅ [COMPLETION ACTION] DB update OK (rowCount=1)')
  console.log('✅ [COMPLETION ACTION] onboarding_completed AFTER:', updatedBrand.onboarding_completed)
  console.log('✅ [COMPLETION ACTION] first_report_status AFTER:', updatedBrand.first_report_status)
  console.log('✅ [COMPLETION ACTION] Updated brand owner_user_id:', user.id)
  console.log('✅ [COMPLETION ACTION] Updated brand ID:', updatedBrand.id)
  
  // VERIFICATION: Double-check the brand was actually updated in the database
  const { data: verifyBrand, error: verifyError } = await supabase
    .from('brands')
    .select('id, name, onboarding_completed, first_report_status, owner_user_id')
    .eq('id', updatedBrand.id)
    .single()
    
  console.log('🔍 [COMPLETION ACTION] VERIFICATION - Brand in DB:', verifyBrand)
  console.log('🔍 [COMPLETION ACTION] VERIFICATION - Error:', verifyError)
  // Clean up any other incomplete brands to prevent guard confusion
  console.log('🧹 [COMPLETION ACTION] Cleaning up other incomplete brands...')
  const { data: otherPendingBrands } = await supabase
    .from('brands')
    .select('id')
    .eq('owner_user_id', user.id)
    .eq('is_demo', false)
    .eq('onboarding_completed', false)
    .neq('id', updatedBrand.id)

  if (otherPendingBrands && otherPendingBrands.length > 0) {
    console.log('🧹 [COMPLETION ACTION] Removing', otherPendingBrands.length, 'stray incomplete brands')
    await supabase
      .from('brands')
      .delete()
      .eq('owner_user_id', user.id)
      .eq('is_demo', false)
      .eq('onboarding_completed', false)
      .neq('id', updatedBrand.id)
  } else {
    console.log('🧹 [COMPLETION ACTION] No duplicate incomplete brands found')
  }

  console.log('✅ [COMPLETION ACTION] Final updated brand:', {
    id: updatedBrand.id,
    name: updatedBrand.name,
    domain: updatedBrand.domain,
    onboarding_completed: updatedBrand.onboarding_completed,
    first_report_status: updatedBrand.first_report_status
  })

  // TODO: Trigger background job for Phase 5 (sending prompts to AI models)
  // For now, this is a no-op or simulator
  try {
    // Simulate background job trigger
    if (process.env.NODE_ENV === 'development') {
      console.log('🚀 Would trigger background job for brand:', updatedBrand.id)
    }
    
    // In production, this would dispatch to a job queue like:
    // await queueReportGeneration(updatedBrand.id, selectedPromptsCount)
  } catch (jobError) {
    console.error('Error triggering background job:', jobError)
    // Don't fail onboarding completion if job trigger fails
    // The job can be retried later
  }

  // Revalidate all cached data that powers route guards before redirect
  console.log('🔄 [COMPLETION ACTION] Revalidating cached paths...')
  revalidatePath('/', 'layout') // Revalidate root layout and all nested layouts
  revalidatePath('/setup/onboarding')
  revalidatePath('/reports/overview')
  revalidatePath('/reports', 'layout') // Revalidate reports layout
  revalidatePath('/finishing') // Revalidate finishing page
  
  // Small delay to ensure database transaction has fully committed
  await new Promise(resolve => setTimeout(resolve, 100))
  
  console.log('🚀 [COMPLETION ACTION] TRIGGERING SERVER REDIRECT to /finishing')
  console.log('🚀 [COMPLETION ACTION] Final redirect target: /finishing')
  console.log('🚀 [COMPLETION ACTION] Redirect timestamp:', new Date().toISOString())
  
  // Server-side redirect to handoff page (which will then redirect to dashboard after 3s)
  redirect('/finishing')
}
