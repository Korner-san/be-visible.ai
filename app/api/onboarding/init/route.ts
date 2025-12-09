import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createPendingBrand } from '@/lib/supabase/user-state'

export async function POST(request: NextRequest) {
  try {
    // Get user from server-side auth (more secure than trusting client userId)
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Idempotent brand resolution - find or create pending brand
    // First, check for existing pending brand
    const { data: existingBrands } = await supabase
      .from('brands')
      .select('id, onboarding_answers, name, domain')
      .eq('owner_user_id', user.id)
      .eq('is_demo', false)
      .eq('onboarding_completed', false)
      .order('created_at', { ascending: false })
      .limit(1)

    if (existingBrands && existingBrands.length > 0) {
      const brand = existingBrands[0]
      
      if (process.env.NODE_ENV === 'development') {
        console.log('🔄 Using existing pending brand:', brand.id)
      }
      
      return NextResponse.json({
        success: true,
        brandId: brand.id,
        existingAnswers: brand.onboarding_answers || {},
        brandName: brand.name,
        brandDomain: brand.domain
      })
    }

    // Create new pending brand using the helper function
    const pendingBrand = await createPendingBrand(user.id)
    
    if (!pendingBrand) {
      return NextResponse.json(
        { success: false, error: 'We couldn\'t start your setup. Please try again.' },
        { status: 500 }
      )
    }

    if (process.env.NODE_ENV === 'development') {
      console.log('✨ Created new pending brand:', pendingBrand.id)
    }

    return NextResponse.json({
      success: true,
      brandId: pendingBrand.id,
      existingAnswers: {},
      brandName: pendingBrand.name,
      brandDomain: pendingBrand.domain
    })

  } catch (error) {
    console.error('Error in onboarding init:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
