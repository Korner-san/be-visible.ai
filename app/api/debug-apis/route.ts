import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET() {
  try {
    const supabase = createServiceClient()
    
    // Test the actual domains API logic
    const { data: domains, error: domainsError } = await supabase.rpc('get_citations_by_domain', {
      p_brand_id: 'fbf81956-e312-40e6-8fcf-920185582421',
      p_from_date: '2025-10-01',
      p_to_date: '2025-10-31',
      p_providers: ['perplexity', 'google_ai_overview']
    })

    if (domainsError) {
      return NextResponse.json({ error: 'Domains RPC error', details: domainsError })
    }

    // Test the domains API enrichment logic
    const enrichedDomains = await Promise.all((domains || []).map(async (domain: any) => {
      if (domain.domain !== 'qovery.com') {
        return domain // Skip non-qovery domains for this test
      }

      console.log(`🔍 [DEBUG] Enriching domain: ${domain.domain}`)
      
      const { data: categoryData, error: categoryError } = await supabase
        .from('url_inventory')
        .select(`
          id,
          url_content_facts!inner(domain_role_category, content_structure_category)
        `)
        .eq('domain', domain.domain)
      
      if (categoryError) {
        console.error(`❌ [DEBUG] Error fetching category data for ${domain.domain}:`, categoryError)
      }
      
      if (!categoryData || categoryData.length === 0) {
        console.warn(`⚠️ [DEBUG] No categorization data found for domain: ${domain.domain}`)
        return {
          ...domain,
          domain_role_category: null,
          content_structure_category: null
        }
      }

      console.log(`📊 [DEBUG] Found ${categoryData.length} categorized URLs for ${domain.domain}`)

      // Find the most common domain role category for this domain
      const domainRoleCounts: { [key: string]: number } = {}
      const contentTypeCounts: { [key: string]: number } = {}
      
      categoryData.forEach((item: any) => {
        const domainRole = item.url_content_facts?.domain_role_category
        const contentType = item.url_content_facts?.content_structure_category
        
        if (domainRole) {
          domainRoleCounts[domainRole] = (domainRoleCounts[domainRole] || 0) + 1
        }
        if (contentType) {
          contentTypeCounts[contentType] = (contentTypeCounts[contentType] || 0) + 1
        }
      })

      // Get the most common category
      const mostCommonDomainRole = Object.entries(domainRoleCounts)
        .sort(([, a], [, b]) => b - a)[0]?.[0] || null
      
      const mostCommonContentType = Object.entries(contentTypeCounts)
        .sort(([, a], [, b]) => b - a)[0]?.[0] || null
      
      console.log(`✅ [DEBUG] Enriched ${domain.domain}:`, {
        domainRole: mostCommonDomainRole,
        contentType: mostCommonContentType,
        domainRoleCounts,
        contentTypeCounts
      })
      
      return {
        ...domain,
        domain_role_category: mostCommonDomainRole,
        content_structure_category: mostCommonContentType
      }
    }))

    // Test the URLs API logic
    const { data: urls, error: urlsError } = await supabase.rpc('get_citation_urls_by_domain', {
      p_brand_id: 'fbf81956-e312-40e6-8fcf-920185582421',
      p_domain: 'qovery.com',
      p_from_date: '2025-10-01',
      p_to_date: '2025-10-31',
      p_providers: ['perplexity', 'google_ai_overview']
    })

    if (urlsError) {
      return NextResponse.json({ error: 'URLs RPC error', details: urlsError })
    }

    // Test the URLs API enrichment logic
    const enrichedUrls = await Promise.all((urls || []).slice(0, 3).map(async (urlData: any) => {
      console.log(`🔍 [DEBUG] Enriching URL: ${urlData.url}`)
      
      const urlVariations = [
        urlData.url.replace('://', '://www.'), // Add www. prefix (most likely to match)
        urlData.url, // Original URL from RPC
        urlData.url.replace('://www.', '://') // Remove www. prefix (fallback)
      ]
      
      let categoryData = null
      let matchedVariation = null
      
      for (const urlVariation of urlVariations) {
        console.log(`🔍 [DEBUG] Trying variation: ${urlVariation}`)
        
        const { data: normalizedMatches, error: normalizedError } = await supabase
          .from('url_inventory')
          .select(`
            id,
            url_content_facts!inner(domain_role_category, content_structure_category)
          `)
          .eq('normalized_url', urlVariation)
          .limit(1)
        
        if (normalizedError) {
          console.error(`❌ [DEBUG] Normalized query error for ${urlVariation}:`, normalizedError)
        }
        
        if (normalizedMatches && normalizedMatches.length > 0) {
          categoryData = normalizedMatches[0]
          matchedVariation = `normalized:${urlVariation}`
          console.log(`✅ [DEBUG] Found match via normalized_url: ${urlVariation}`)
          break
        }
        
        const { data: exactMatches, error: exactError } = await supabase
          .from('url_inventory')
          .select(`
            id,
            url_content_facts!inner(domain_role_category, content_structure_category)
          `)
          .eq('url', urlVariation)
          .limit(1)
        
        if (exactError) {
          console.error(`❌ [DEBUG] Exact query error for ${urlVariation}:`, exactError)
        }
        
        if (exactMatches && exactMatches.length > 0) {
          categoryData = exactMatches[0]
          matchedVariation = `exact:${urlVariation}`
          console.log(`✅ [DEBUG] Found match via exact url: ${urlVariation}`)
          break
        }
      }
      
      if (!categoryData) {
        console.warn(`⚠️ [DEBUG] No categorization data found for URL: ${urlData.url}`)
      } else {
        console.log(`✅ [DEBUG] Successfully enriched ${urlData.url} via ${matchedVariation}`)
      }
      
      return {
        ...urlData,
        domain_role_category: categoryData?.url_content_facts?.domain_role_category || null,
        content_structure_category: categoryData?.url_content_facts?.content_structure_category || null
      }
    }))

    return NextResponse.json({
      success: true,
      qoveryDomain: enrichedDomains.find(d => d.domain === 'qovery.com'),
      enrichedUrls: enrichedUrls,
      totalUrls: urls?.length || 0
    })

  } catch (error: any) {
    return NextResponse.json({ 
      error: 'Unexpected error', 
      details: error.message,
      stack: error.stack 
    })
  }
}
