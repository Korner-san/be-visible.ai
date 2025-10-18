import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * GET /api/reports/citations/urls
 * Returns unique URLs for a specific domain (for expandable rows)
 */
export async function GET(request: NextRequest) {
  console.log('🚨 [URLs API] MAIN API CALLED - This should appear in logs!')
  try {
    const { searchParams } = new URL(request.url)
    const brandId = searchParams.get('brandId')
    const domain = searchParams.get('domain')
    const fromDate = searchParams.get('from')
    const toDate = searchParams.get('to')
    const modelsParam = searchParams.get('models')
    
    console.log('🚨 [URLs API] Request params:', { brandId, domain, fromDate, toDate, modelsParam })
    
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

    const supabase = createServiceClient()

    // Verify brand exists (service client bypasses RLS)
    const { data: brand, error: brandError } = await supabase
      .from('brands')
      .select('id, name')
      .eq('id', brandId)
      .single()

    if (brandError || !brand) {
      return NextResponse.json({
        success: false,
        error: 'Brand not found'
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

    // Enrich URLs with category data from url_content_facts
    const enrichedUrls = await Promise.all((urls || []).map(async (urlData: any) => {
      console.log(`🔍 [URLs API] Enriching URL: ${urlData.url}`)
      
      // Generate URL variations - prioritize www. version since that's what's stored in DB
      const urlVariations = [
        urlData.url.replace('://', '://www.'), // Add www. prefix (most likely to match)
        urlData.url, // Original URL from RPC
        urlData.url.replace('://www.', '://') // Remove www. prefix (fallback)
      ]
      
      let categoryData = null
      let matchedVariation = null
      
      // Try each URL variation
      for (const urlVariation of urlVariations) {
        console.log(`🔍 [URLs API] Trying variation: ${urlVariation}`)
        
        // Try normalized_url match first
        const { data: normalizedMatches, error: normalizedError } = await supabase
          .from('url_inventory')
          .select(`
            id,
            url,
            normalized_url,
            url_content_facts!inner(domain_role_category, content_structure_category)
          `)
          .eq('normalized_url', urlVariation)
          .limit(1)
        
        if (normalizedError) {
          console.error(`❌ [URLs API] Normalized query error for ${urlVariation}:`, normalizedError)
        }
        
        if (normalizedMatches && normalizedMatches.length > 0) {
          categoryData = normalizedMatches[0]
          matchedVariation = `normalized:${urlVariation}`
          console.log(`✅ [URLs API] Found match via normalized_url: ${urlVariation}`)
          break
        }
        
        // Try exact url match
        const { data: exactMatches, error: exactError } = await supabase
          .from('url_inventory')
          .select(`
            id,
            url,
            normalized_url,
            url_content_facts!inner(domain_role_category, content_structure_category)
          `)
          .eq('url', urlVariation)
          .limit(1)
        
        if (exactError) {
          console.error(`❌ [URLs API] Exact query error for ${urlVariation}:`, exactError)
        }
        
        if (exactMatches && exactMatches.length > 0) {
          categoryData = exactMatches[0]
          matchedVariation = `exact:${urlVariation}`
          console.log(`✅ [URLs API] Found match via exact url: ${urlVariation}`)
          break
        }
      }
      
      if (!categoryData) {
        console.warn(`⚠️ [URLs API] No categorization data found for URL: ${urlData.url}`)
      } else {
        console.log(`✅ [URLs API] Successfully enriched ${urlData.url} via ${matchedVariation}`)
      }
      
      return {
        ...urlData,
        domain_role_category: categoryData?.url_content_facts?.domain_role_category || null,
        content_structure_category: categoryData?.url_content_facts?.content_structure_category || null
      }
    }))

    console.log('✅ [Citations URLs API] Success:', {
      domain,
      urlsCount: enrichedUrls?.length || 0,
      selectedModels
    })

    return NextResponse.json({
      success: true,
      data: {
        domain,
        urls: enrichedUrls || []
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

