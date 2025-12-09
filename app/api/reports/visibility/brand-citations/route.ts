import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ACTIVE_PROVIDERS } from '@/types/domain/provider'

/**
 * GET /api/reports/visibility/brand-citations
 * Returns brand's own domain citations (when AI models cite the brand's website)
 * Model-aware and date-aware
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const brandId = searchParams.get('brandId')
    const fromDate = searchParams.get('from')
    const toDate = searchParams.get('to')
    const modelsParam = searchParams.get('models')
    
    // Parse model filter
    const selectedModels = modelsParam ? modelsParam.split(',') : [...ACTIVE_PROVIDERS]
    
    console.log('🔍 [Brand Citations API] Request:', { 
      brandId, 
      fromDate, 
      toDate, 
      selectedModels
    })
    
    if (!brandId) {
      return NextResponse.json({
        success: false,
        error: 'Brand ID is required'
      }, { status: 400 })
    }

    const supabase = await createClient()
    
    // Get the current user
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
      .select('id, name, owner_user_id, onboarding_answers')
      .eq('id', brandId)
      .single()

    if (brandError || !brand || brand.owner_user_id !== user.id) {
      return NextResponse.json({
        success: false,
        error: 'Brand not found or access denied'
      }, { status: 404 })
    }

    // Call the RPC to get brand domain citations
    const { data: citations, error: citationsError } = await supabase.rpc('get_brand_domain_citations', {
      p_brand_id: brandId,
      p_from_date: fromDate || null,
      p_to_date: toDate || null,
      p_providers: selectedModels
    })

    if (citationsError) {
      console.error('❌ [Brand Citations API] Error calling RPC:', citationsError)
      return NextResponse.json({
        success: false,
        error: 'Failed to fetch brand citations'
      }, { status: 500 })
    }

    const totalCitations = citations?.length || 0
    const totalMentions = citations?.reduce((sum: number, c: any) => sum + (c.mentions_count || 0), 0) || 0

    console.log('✅ [Brand Citations API] Success:', {
      totalCitations,
      totalMentions,
      selectedModels
    })

    return NextResponse.json({
      success: true,
      data: {
        citations: citations || [],
        totalCitations,
        totalMentions,
        brandDomain: (brand.onboarding_answers as any)?.website || ''
      }
    })

  } catch (error) {
    console.error('❌ [Brand Citations API] Unexpected error:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 })
  }
}

