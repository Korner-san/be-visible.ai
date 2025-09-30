import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function POST(request: NextRequest) {
  try {
    const { brandId } = await request.json()

    if (!brandId) {
      return NextResponse.json({
        success: false,
        error: 'Brand ID is required'
      }, { status: 400 })
    }

    // Get user from server-side auth
    const supabase = createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({
        success: false,
        error: 'Unauthorized'
      }, { status: 401 })
    }

    console.log('🔄 [COMPLETE ONBOARDING] Processing completion for user:', user.id, 'brand:', brandId)

    // Get the brand and verify ownership
    const { data: brand, error: brandError } = await supabase
      .from('brands')
      .select('id, name, onboarding_completed, first_report_status')
      .eq('id', brandId)
      .eq('owner_user_id', user.id)
      .eq('is_demo', false)
      .single()

    if (brandError || !brand) {
      return NextResponse.json({
        success: false,
        error: 'Brand not found or access denied'
      }, { status: 404 })
    }

    if (brand.onboarding_completed) {
      console.log('⚠️ [COMPLETE ONBOARDING] Brand already completed, redirecting to dashboard')
      return NextResponse.json({
        success: true,
        message: 'Onboarding already completed',
        brandName: brand.name,
        alreadyCompleted: true
      })
    }

    // Verify at least 1 prompt is active (up to 15 allowed)
    const { count: activeCount, error: countError } = await supabase
      .from('brand_prompts')
      .select('*', { count: 'exact', head: true })
      .eq('brand_id', brandId)
      .eq('status', 'active')

    if (countError) {
      console.error('Error counting active prompts:', countError)
      return NextResponse.json({
        success: false,
        error: 'Failed to verify prompt selections'
      }, { status: 500 })
    }

    if (!activeCount || activeCount === 0) {
      return NextResponse.json({
        success: false,
        error: `No active prompts found. Please go back and activate at least 1 prompt (up to 15 allowed).`
      }, { status: 400 })
    }

    // Complete the onboarding
    const { data: updatedBrand, error: updateError } = await supabase
      .from('brands')
      .update({
        onboarding_completed: true,
        first_report_status: 'queued',
        updated_at: new Date().toISOString()
      })
      .eq('id', brandId)
      .eq('owner_user_id', user.id)
      .select('id, name, onboarding_completed, first_report_status')
      .single()

    if (updateError || !updatedBrand) {
      console.error('Error completing onboarding:', updateError)
      return NextResponse.json({
        success: false,
        error: 'Failed to complete onboarding'
      }, { status: 500 })
    }

    // Revalidate paths that depend on onboarding status
    revalidatePath('/setup/onboarding')
    revalidatePath('/reports/overview')
    revalidatePath('/reports/prompts')
    revalidatePath('/setup/prompts')

    console.log('✅ [COMPLETE ONBOARDING] Successfully completed onboarding for brand:', updatedBrand.name)
    console.log('🎯 [COMPLETE ONBOARDING] Brand status:', {
      onboarding_completed: updatedBrand.onboarding_completed,
      first_report_status: updatedBrand.first_report_status
    })

    return NextResponse.json({
      success: true,
      message: 'Onboarding completed successfully',
      brandName: updatedBrand.name,
      brandId: updatedBrand.id,
      onboardingCompleted: updatedBrand.onboarding_completed,
      firstReportStatus: updatedBrand.first_report_status
    })

  } catch (error) {
    console.error('Error completing onboarding:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    }, { status: 500 })
  }
}
