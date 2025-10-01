import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const { brandId } = await request.json()
    
    if (!brandId) {
      return NextResponse.json({
        success: false,
        error: 'Brand ID is required'
      }, { status: 400 })
    }

    // Get the current user
    const supabase = createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({
        success: false,
        error: 'Unauthorized'
      }, { status: 401 })
    }

    // Verify brand ownership
    const { data: brand, error: brandError } = await supabase
      .from('brands')
      .select('id, name, owner_user_id')
      .eq('id', brandId)
      .single()

    if (brandError || !brand || brand.owner_user_id !== user.id) {
      return NextResponse.json({
        success: false,
        error: 'Brand not found or access denied'
      }, { status: 404 })
    }

    // Only allow test user for manual classification
    if (user.email !== 'kk1995current@gmail.com') {
      return NextResponse.json({
        success: false,
        error: 'Manual classification only available for test user'
      }, { status: 403 })
    }

    console.log('🔄 [MANUAL CLASSIFICATION] Starting LLM classification for brand:', brand.name)

    // Call the classification API
    const classificationResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/reports/classify-portrayal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        brandId: brandId,
        fromCron: false
      })
    })

    const classificationData = await classificationResponse.json()

    if (!classificationData.success) {
      return NextResponse.json({
        success: false,
        error: classificationData.error || 'Classification failed'
      }, { status: 500 })
    }

    console.log('✅ [MANUAL CLASSIFICATION] Completed:', classificationData)

    return NextResponse.json({
      success: true,
      message: 'Portrayal classification completed successfully',
      data: classificationData
    })

  } catch (error) {
    console.error('❌ [MANUAL CLASSIFICATION] Unexpected error:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 })
  }
}
