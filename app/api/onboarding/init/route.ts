import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getAuthUser } from '@/lib/supabase/auth-helper'
import { createPendingBrand } from '@/lib/supabase/user-state'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const { brandName, website } = body

    const user = await getAuthUser(request)
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const supabase = createServiceClient()

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

      // Update name/domain if provided
      if (brandName || website) {
        await supabase.from('brands').update({
          ...(brandName ? { name: brandName } : {}),
          ...(website ? { domain: website } : {}),
        }).eq('id', brand.id)
      }

      return NextResponse.json({
        success: true,
        brandId: brand.id,
        existingAnswers: brand.onboarding_answers || {},
        brandName: brandName || brand.name,
        brandDomain: website || brand.domain
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

    // Update name/domain on the newly created brand if provided
    if (brandName || website) {
      await supabase.from('brands').update({
        ...(brandName ? { name: brandName } : {}),
        ...(website ? { domain: website } : {}),
      }).eq('id', pendingBrand.id)
    }

    return NextResponse.json({
      success: true,
      brandId: pendingBrand.id,
      existingAnswers: {},
      brandName: brandName || pendingBrand.name,
      brandDomain: website || pendingBrand.domain
    })

  } catch (error) {
    console.error('Error in onboarding init:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
