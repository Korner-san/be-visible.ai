import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    
    // Parse model filter
    const selectedModels = modelsParam ? modelsParam.split(',') : ['perplexity', 'google_ai_overview']
    
    console.log('🔍 [Citations Domains API] Request:', { 
      brandId, 
      fromDate, 
      toDate, 
      selectedModels,
      page,
      limit
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

    // Call the RPC to get domains
    const { data: domains, error: domainsError } = await supabase.rpc('get_citations_by_domain', {
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
    const offset = (page - 1) * limit
    const paginatedDomains = domains?.slice(offset, offset + limit) || []

    console.log('✅ [Citations Domains API] Success:', {
      totalDomains,
      page,
      returnedDomains: paginatedDomains.length,
      selectedModels
    })

    return NextResponse.json({
      success: true,
      data: {
        domains: paginatedDomains,
        pagination: {
          page,
          limit,
          totalItems: totalDomains,
          totalPages: Math.ceil(totalDomains / limit),
          hasMore: offset + paginatedDomains.length < totalDomains
        }
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

