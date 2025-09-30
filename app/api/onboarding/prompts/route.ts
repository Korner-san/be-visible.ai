import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    // Get user from server-side auth
    const supabase = createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({
        success: false,
        error: 'Unauthorized'
      }, { status: 401 })
    }

    // Get the user's pending brand
    const { data: pendingBrands, error: brandError } = await supabase
      .from('brands')
      .select('id, name, onboarding_answers')
      .eq('owner_user_id', user.id)
      .eq('is_demo', false)
      .eq('onboarding_completed', false)
      .order('created_at', { ascending: false })
      .limit(1)

    if (brandError || !pendingBrands || pendingBrands.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No pending brand found'
      }, { status: 404 })
    }

    const brand = pendingBrands[0]
    const brandName = brand.name || (brand.onboarding_answers as any)?.brandName || 'Your Brand'

    // Get all prompts for this brand
    const { data: prompts, error: promptsError } = await supabase
      .from('brand_prompts')
      .select('*')
      .eq('brand_id', brand.id)
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
      brandName,
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
