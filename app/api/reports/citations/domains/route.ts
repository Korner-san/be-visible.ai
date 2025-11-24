import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ACTIVE_PROVIDERS } from '@/types/domain/provider'

/**
 * GET /api/reports/citations/domains
 * Returns unique domains with unique URL counts (model-aware, date-aware)
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
    
    console.log('🔍 [Citations Domains API] Request:', { 
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

    const supabase = createClient()
    
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
      .select('id, name, owner_user_id')
      .eq('id', brandId)
      .single()

    if (brandError || !brand || brand.owner_user_id !== user.id) {
      return NextResponse.json({
        success: false,
        error: 'Brand not found or access denied'
      }, { status: 404 })
    }

    // Call the enhanced RPC to get domains with new metrics
    const { data: domains, error: domainsError } = await supabase.rpc('get_enhanced_citations_by_domain', {
      p_brand_id: brandId,
      p_from_date: fromDate || null,
      p_to_date: toDate || null,
      p_providers: selectedModels
    })

    if (domainsError) {
      console.error('❌ [Citations Domains API] Error calling RPC:', domainsError)
      return NextResponse.json({
        success: false,
        error: 'Failed to fetch citation domains'
      }, { status: 500 })
    }

    const totalDomains = domains?.length || 0

    console.log('✅ [Citations Domains API] Success:', {
      totalDomains,
      selectedModels
    })

    return NextResponse.json({
      success: true,
      data: {
        domains: domains || [],
        totalDomains
      }
    })

  } catch (error) {
    console.error('❌ [Citations Domains API] Unexpected error:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 })
  }
}

