import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/reports/citations/urls
 * Returns unique URLs for a specific domain (for expandable rows)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const brandId = searchParams.get('brandId')
    const domain = searchParams.get('domain')
    const fromDate = searchParams.get('from')
    const toDate = searchParams.get('to')
    const modelsParam = searchParams.get('models')
    
    // Parse model filter
    const selectedModels = modelsParam ? modelsParam.split(',') : ['perplexity', 'google_ai_overview']
    
    console.log('🔍 [Citations URLs API] Request:', { 
      brandId, 
      domain,
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

    if (!domain) {
      return NextResponse.json({
        success: false,
        error: 'Domain is required'
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

    // Call the RPC to get URLs for this domain
    const { data: urls, error: urlsError } = await supabase.rpc('get_citation_urls_by_domain', {
      p_brand_id: brandId,
      p_domain: domain,
      p_from_date: fromDate || null,
      p_to_date: toDate || null,
      p_providers: selectedModels
    })

    if (urlsError) {
      console.error('❌ [Citations URLs API] Error calling RPC:', urlsError)
      return NextResponse.json({
        success: false,
        error: 'Failed to fetch citation URLs'
      }, { status: 500 })
    }

    console.log('✅ [Citations URLs API] Success:', {
      domain,
      urlsCount: urls?.length || 0,
      selectedModels
    })

    return NextResponse.json({
      success: true,
      data: {
        domain,
        urls: urls || []
      }
    })

  } catch (error) {
    console.error('❌ [Citations URLs API] Unexpected error:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 })
  }
}

