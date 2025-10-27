import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

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
    const selectedModels = modelsParam ? modelsParam.split(',') : ['perplexity', 'google_ai_overview']
    
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

    // Enrich domains with homepage category from url_content_facts
    // Use service client to bypass RLS for reading homepage categorizations
    const serviceSupabase = createServiceClient()
    
    const enrichedDomains = await Promise.all((domains || []).map(async (domain: any) => {
      console.log(`🔍 [Domains API] Enriching domain: ${domain.domain}`)
      
      // Get the homepage's content_structure_category specifically
      // Homepage URLs are in format: https://domain.com/ or http://domain.com/
      // Try multiple variations to match the exact URL format stored
      const homepageUrlVariations = [
        `https://${domain.domain}/`,
        `http://${domain.domain}/`,
        `https://${domain.domain}`,
        `http://${domain.domain}`,
        `https://www.${domain.domain}/`,
        `http://www.${domain.domain}/`,
        `https://www.${domain.domain}`,
        `http://www.${domain.domain}`
      ]
      
      const { data: homepageData, error: homepageError } = await serviceSupabase
        .from('url_inventory')
        .select(`
          url,
          url_content_facts!inner(
            content_structure_category
          )
        `)
        .eq('domain', domain.domain)
        .in('url', homepageUrlVariations)
        .limit(1)
      
      if (homepageError) {
        console.error(`❌ [Domains API] Error fetching homepage for ${domain.domain}:`, homepageError)
      }
      
      // Get the homepage's content_structure_category
      const homepageCategory = homepageData?.[0]?.url_content_facts?.content_structure_category
      
      if (homepageCategory) {
        console.log(`✅ [Domains API] Found homepage category for ${domain.domain}: ${homepageCategory}`)
        return {
          ...domain,
          content_structure_category: homepageCategory
        }
      }
      
      console.log(`⚠️ [Domains API] No homepage categorization found for domain: ${domain.domain}`)
      return {
        ...domain,
        content_structure_category: null
      }
    }))

    const totalDomains = enrichedDomains?.length || 0

    console.log('✅ [Citations Domains API] Success:', {
      totalDomains,
      selectedModels
    })

    return NextResponse.json({
      success: true,
      data: {
        domains: enrichedDomains || [],
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

