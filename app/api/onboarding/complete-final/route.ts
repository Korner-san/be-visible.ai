import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

// Normalize domain function
const normalizeDomain = (domain: string): string => {
  if (!domain) return ''
  
  // Remove protocol and www
  let normalized = domain.replace(/^https?:\/\//, '').replace(/^www\./, '')
  
  // Remove trailing slash
  normalized = normalized.replace(/\/$/, '')
  
  return normalized.toLowerCase()
}

export async function POST(request: NextRequest) {
  try {
    console.log('🔄 [COMPLETE-FINAL API] Starting final completion...')
    console.log('🔄 [COMPLETE-FINAL API] Timestamp:', new Date().toISOString())
    
    const supabase = await createClient()
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      console.error('❌ [COMPLETE-FINAL API] Auth error:', authError)
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 })
    }
    
    console.log('✅ [COMPLETE-FINAL API] User authenticated:', user.id)
    
    // Find user's pending brand
    const { data: brands, error: brandsError } = await supabase
      .from('brands')
      .select('id, name, domain, onboarding_completed, onboarding_answers, first_report_status')
      .eq('owner_user_id', user.id)
      .eq('is_demo', false)
      .order('created_at', { ascending: false })
    
    if (brandsError || !brands || brands.length === 0) {
      console.error('❌ [COMPLETE-FINAL API] No brands found:', brandsError)
      return NextResponse.json({ success: false, error: 'No brand found' }, { status: 404 })
    }
    
    // Find the first incomplete brand (should be the pending one)
    const brand = brands.find(b => !b.onboarding_completed) || brands[0]
    console.log('🔍 [COMPLETE-FINAL API] Using brand:', brand.id, 'completed:', brand.onboarding_completed)
    
    // Idempotency check
    if (brand.onboarding_completed) {
      console.log('⚡ [COMPLETE-FINAL API] IDEMPOTENT: Brand already completed')
      return NextResponse.json({ success: true, message: 'Already completed' })
    }
    
    // Parse onboarding answers
    const onboardingAnswers = brand.onboarding_answers || {}
    console.log('🔍 [COMPLETE-FINAL API] Onboarding answers:', Object.keys(onboardingAnswers))
    
    // Normalize domain
    let normalizedDomain = ''
    if (onboardingAnswers.websiteUrl) {
      normalizedDomain = normalizeDomain(onboardingAnswers.websiteUrl)
    } else if (brand.domain) {
      normalizedDomain = normalizeDomain(brand.domain)
    }
    
    console.log('🔍 [COMPLETE-FINAL API] About to update brand:', brand.id, 'for user:', user.id)
    
    // Update brand to complete onboarding
    const { data: updatedBrand, error: updateError } = await supabase
      .from('brands')
      .update({
        name: onboardingAnswers.brandName || brand.name,
        domain: normalizedDomain,
        onboarding_completed: true,
        first_report_status: 'queued'
      })
      .eq('id', brand.id)
      .select('id, name, domain, onboarding_completed, first_report_status')
      .single()
    
    console.log('🔍 [COMPLETE-FINAL API] Update result - data:', updatedBrand)
    console.log('🔍 [COMPLETE-FINAL API] Update result - error:', updateError)
    
    if (updateError || !updatedBrand) {
      console.error('❌ [COMPLETE-FINAL API] UPDATE ERROR:', updateError)
      return NextResponse.json({ success: false, error: 'Failed to update brand' }, { status: 500 })
    }
    
    console.log('✅ [COMPLETE-FINAL API] DB update OK')
    console.log('✅ [COMPLETE-FINAL API] onboarding_completed AFTER:', updatedBrand.onboarding_completed)
    console.log('✅ [COMPLETE-FINAL API] first_report_status AFTER:', updatedBrand.first_report_status)

    // Ensure user has a row in the users table
    const adminSupabase = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { error: upsertUserError } = await adminSupabase
      .from('users')
      .upsert(
        { id: user.id, email: user.email, subscription_plan: 'free_trial', reports_enabled: true },
        { onConflict: 'id', ignoreDuplicates: true }
      )
    if (upsertUserError) {
      console.warn('⚠️ [COMPLETE-FINAL API] Could not upsert users row:', upsertUserError.message)
    } else {
      console.log('✅ [COMPLETE-FINAL API] Users table row ensured for:', user.id)
    }
    
    // VERIFICATION: Double-check the brand was actually updated in the database
    const { data: verifyBrand, error: verifyError } = await supabase
      .from('brands')
      .select('id, name, onboarding_completed, first_report_status, owner_user_id')
      .eq('id', updatedBrand.id)
      .single()
      
    console.log('🔍 [COMPLETE-FINAL API] VERIFICATION - Brand in DB:', verifyBrand)
    console.log('🔍 [COMPLETE-FINAL API] VERIFICATION - Error:', verifyError)
    
    // Clean up any other incomplete brands to prevent guard confusion
    console.log('🧹 [COMPLETE-FINAL API] Cleaning up other incomplete brands...')
    const { data: otherPendingBrands } = await supabase
      .from('brands')
      .select('id')
      .eq('owner_user_id', user.id)
      .eq('is_demo', false)
      .eq('onboarding_completed', false)
      .neq('id', updatedBrand.id)
    
    if (otherPendingBrands && otherPendingBrands.length > 0) {
      console.log('🧹 [COMPLETE-FINAL API] Found', otherPendingBrands.length, 'other incomplete brands, deleting...')
      const { error: deleteError } = await supabase
        .from('brands')
        .delete()
        .in('id', otherPendingBrands.map(b => b.id))
      
      if (deleteError) {
        console.error('⚠️ [COMPLETE-FINAL API] Error cleaning up brands:', deleteError)
      } else {
        console.log('✅ [COMPLETE-FINAL API] Cleaned up', otherPendingBrands.length, 'incomplete brands')
      }
    }
    
    // Trigger the Hetzner worker to run the onboarding batch
    console.log('🚀 [COMPLETE-FINAL API] Calling Hetzner webhook for brand:', updatedBrand.id)
    try {
      const webhookUrl = process.env.WEBHOOK_SERVER_URL || 'http://135.181.203.202:3001/run-onboarding-batch'
      const webhookSecret = process.env.WEBHOOK_SECRET || 'your-secret-key-here'
      const webhookRes = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId: updatedBrand.id, secret: webhookSecret }),
      })
      if (webhookRes.ok) {
        console.log('✅ [COMPLETE-FINAL API] Webhook triggered successfully')
      } else {
        console.warn('⚠️ [COMPLETE-FINAL API] Webhook returned', webhookRes.status)
      }
    } catch (webhookErr) {
      console.error('❌ [COMPLETE-FINAL API] Webhook call failed (non-fatal):', webhookErr instanceof Error ? webhookErr.message : webhookErr)
    }
    
    console.log('✅ [COMPLETE-FINAL API] COMPLETION SUCCESS - Brand ready for finishing page')
    
    return NextResponse.json({ 
      success: true, 
      brandId: updatedBrand.id,
      brandName: updatedBrand.name 
    })
    
  } catch (error) {
    console.error('❌ [COMPLETE-FINAL API] Unexpected error:', error)
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 })
  }
}
