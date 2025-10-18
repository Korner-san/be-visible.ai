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

    // Enrich domains with category data from url_content_facts
    const enrichedDomains = await Promise.all((domains || []).map(async (domain: any) => {
      console.log(`🔍 [Domains API] Enriching domain: ${domain.domain}`)
      
      // Get the most common content structure category for this domain
      const { data: categoryData, error: categoryError } = await supabase
        .from('url_inventory')
        .select(`
          id,
          url_content_facts!inner(content_structure_category)
        `)
        .eq('domain', domain.domain)
      
      if (categoryError) {
        console.error(`❌ [Domains API] Error fetching category data for ${domain.domain}:`, categoryError)
      }
      
      if (!categoryData || categoryData.length === 0) {
        console.warn(`⚠️ [Domains API] No categorization data found for domain: ${domain.domain}`)
        return {
          ...domain,
          content_structure_category: null
        }
      }

      console.log(`📊 [Domains API] Found ${categoryData.length} categorized URLs for ${domain.domain}`)

      // Domain role categorization has been removed - no longer needed
      
      // Content type should still be aggregated from individual URLs
      const contentTypeCounts: { [key: string]: number } = {}
      categoryData.forEach((item: any) => {
        const contentType = item.url_content_facts?.content_structure_category
        if (contentType) {
          contentTypeCounts[contentType] = (contentTypeCounts[contentType] || 0) + 1
        }
      })
      const mostCommonContentType = Object.entries(contentTypeCounts)
        .sort(([, a], [, b]) => b - a)[0]?.[0] || null
      
      console.log(`✅ [Domains API] Enriched ${domain.domain}:`, {
        contentType: mostCommonContentType,
        contentTypeCounts
      })
      
      return {
        ...domain,
        content_structure_category: mostCommonContentType
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

