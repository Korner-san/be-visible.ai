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
    
    // ── CAPACITY CHECK ────────────────────────────────────────────────────────
    const adminSupabaseForCapacity = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const now = new Date()
    const reserveWindowEnd = new Date(now.getTime() + 15 * 60 * 1000)

    const [
      { data: eligibleAccounts },
      { data: runningBatches },
      { data: reservedBatches },
      { data: runningOnboardings }
    ] = await Promise.all([
      adminSupabaseForCapacity.from('chatgpt_accounts').select('id, email, last_connection_at').eq('is_eligible', true).eq('status', 'active').not('proxy_host', 'is', null),
      adminSupabaseForCapacity.from('daily_schedules').select('chatgpt_account_id, batch_size, execution_time').eq('status', 'running'),
      adminSupabaseForCapacity.from('daily_schedules').select('chatgpt_account_id, batch_size, execution_time').eq('status', 'pending').gte('execution_time', now.toISOString()).lte('execution_time', reserveWindowEnd.toISOString()),
      adminSupabaseForCapacity.from('brands').select('chatgpt_account_id, onboarding_prompts_sent').eq('first_report_status', 'running').not('chatgpt_account_id', 'is', null)
    ])

    const freeAccounts = (eligibleAccounts || []).filter((account: any) => {
      const busyDaily = (runningBatches || []).some((b: any) => b.chatgpt_account_id === account.id)
      const busyOnboarding = (runningOnboardings || []).some((b: any) => b.chatgpt_account_id === account.id)
      const reserved = (reservedBatches || []).some((b: any) => b.chatgpt_account_id === account.id)
      return !busyDaily && !busyOnboarding && !reserved
    })

    if (freeAccounts.length === 0) {
      // Estimate wait time from busy accounts
      const allAccountStates = (eligibleAccounts || []).map((account: any) => {
        const dailyBatch = (runningBatches || []).find((b: any) => b.chatgpt_account_id === account.id) as any
        const reserved = (reservedBatches || []).find((b: any) => b.chatgpt_account_id === account.id) as any
        const onboarding = (runningOnboardings || []).find((b: any) => b.chatgpt_account_id === account.id) as any
        if (dailyBatch) {
          return new Date(dailyBatch.execution_time).getTime() + (dailyBatch.batch_size || 3) * 2.5 * 60 * 1000
        }
        if (onboarding) {
          return now.getTime() + Math.max(1, 30 - (onboarding.onboarding_prompts_sent || 0)) * 2.5 * 60 * 1000
        }
        if (reserved) {
          return new Date(reserved.execution_time).getTime() + (reserved.batch_size || 3) * 2.5 * 60 * 1000
        }
        return now.getTime() + 15 * 60 * 1000
      })
      const estimatedWaitMinutes = allAccountStates.length > 0
        ? Math.max(1, Math.ceil((Math.min(...allAccountStates) - now.getTime()) / 60000))
        : 15

      console.log('⏳ [COMPLETE-FINAL API] System at capacity, estimated wait:', estimatedWaitMinutes, 'min')
      return NextResponse.json({ success: false, busy: true, waitMinutes: estimatedWaitMinutes }, { status: 409 })
    }

    // Select best free account (least recently used)
    const selectedAccount = freeAccounts.sort((a: any, b: any) => {
      const aTime = a.last_connection_at ? new Date(a.last_connection_at).getTime() : 0
      const bTime = b.last_connection_at ? new Date(b.last_connection_at).getTime() : 0
      return aTime - bTime
    })[0] as any
    console.log('✅ [COMPLETE-FINAL API] Selected account for onboarding:', selectedAccount.email)
    // ─────────────────────────────────────────────────────────────────────────

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
    
    // Update brand to complete onboarding, assign selected ChatGPT account
    const { data: updatedBrand, error: updateError } = await supabase
      .from('brands')
      .update({
        name: onboardingAnswers.brandName || brand.name,
        domain: normalizedDomain,
        onboarding_completed: true,
        first_report_status: 'queued',
        chatgpt_account_id: selectedAccount.id
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
    
    // Trigger the Hetzner queue-checker to immediately process this brand's onboarding queue
    console.log('🚀 [COMPLETE-FINAL API] Triggering queue-checker for brand:', updatedBrand.id)
    try {
      const baseUrl = process.env.WEBHOOK_BASE_URL || 'http://135.181.203.202:3001'
      const webhookSecret = process.env.WEBHOOK_SECRET || 'your-secret-key-here'
      const webhookRes = await fetch(`${baseUrl}/run-queue-checker`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: webhookSecret }),
      })
      if (webhookRes.ok) {
        console.log('✅ [COMPLETE-FINAL API] Queue-checker triggered successfully')
      } else {
        console.warn('⚠️ [COMPLETE-FINAL API] Queue-checker webhook returned', webhookRes.status)
      }
    } catch (webhookErr) {
      console.error('❌ [COMPLETE-FINAL API] Queue-checker webhook failed (non-fatal):', webhookErr instanceof Error ? webhookErr.message : webhookErr)
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
