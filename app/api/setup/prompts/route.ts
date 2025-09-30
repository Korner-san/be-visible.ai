import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const brandId = searchParams.get('brandId')
    
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

    // Verify user owns this brand
    const { data: brand, error: brandError } = await supabase
      .from('brands')
      .select('id, name')
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

    // Get all prompts for this brand
    const { data: prompts, error: promptsError } = await supabase
      .from('brand_prompts')
      .select('*')
      .eq('brand_id', brandId)
      .order('source_template_code')

    if (promptsError) {
      console.error('Error loading prompts:', promptsError)
      return NextResponse.json({
        success: false,
        error: 'Failed to load prompts'
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      prompts: prompts || [],
      brandName: brand.name,
      brandId: brand.id
    })

  } catch (error) {
    console.error('Error in prompts API:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    }, { status: 500 })
  }
}
