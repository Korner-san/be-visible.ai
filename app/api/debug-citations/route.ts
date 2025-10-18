import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET() {
  try {
    const supabase = createServiceClient()
    
    // Test the domains API query for qovery.com
    const { data: domains, error: domainsError } = await supabase.rpc('get_citations_by_domain', {
      p_brand_id: 'fbf81956-e312-40e6-8fcf-920185582421',
      p_from_date: '2025-10-01',
      p_to_date: '2025-10-31',
      p_providers: ['perplexity', 'google_ai_overview']
    })

    if (domainsError) {
      return NextResponse.json({ error: 'Domains RPC error', details: domainsError })
    }

    // Find qovery.com domain
    const qoveryDomain = domains?.find((d: any) => d.domain === 'qovery.com')
    
    if (!qoveryDomain) {
      return NextResponse.json({ error: 'qovery.com not found in domains', domains: domains?.map((d: any) => d.domain) })
    }

    // Test the enrichment query for qovery.com
    const { data: categoryData, error: categoryError } = await supabase
      .from('url_inventory')
      .select(`
        id,
        url_content_facts!inner(domain_role_category, content_structure_category)
      `)
      .eq('domain', 'qovery.com')

    if (categoryError) {
      return NextResponse.json({ error: 'Category query error', details: categoryError })
    }

    // Test URLs API query for qovery.com
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

    // Test URL enrichment for first URL
    const firstUrl = urls?.[0]
    if (firstUrl) {
      const urlVariations = [
        firstUrl.url.replace('://', '://www.'), // Add www. prefix
        firstUrl.url, // Original URL from RPC
        firstUrl.url.replace('://www.', '://') // Remove www. prefix
      ]

      const urlEnrichmentResults = []
      for (const urlVariation of urlVariations) {
        const { data: normalizedMatches } = await supabase
          .from('url_inventory')
          .select(`
            id,
            url_content_facts!inner(domain_role_category, content_structure_category)
          `)
          .eq('normalized_url', urlVariation)
          .limit(1)

        const { data: exactMatches } = await supabase
          .from('url_inventory')
          .select(`
            id,
            url_content_facts!inner(domain_role_category, content_structure_category)
          `)
          .eq('url', urlVariation)
          .limit(1)

        urlEnrichmentResults.push({
          variation: urlVariation,
          normalizedMatch: normalizedMatches?.[0] || null,
          exactMatch: exactMatches?.[0] || null
        })
      }

      return NextResponse.json({
        success: true,
        qoveryDomain,
        categoryDataCount: categoryData?.length || 0,
        categoryData: categoryData?.slice(0, 3), // First 3 for brevity
        firstUrl,
        urlEnrichmentResults,
        totalUrls: urls?.length || 0
      })
    }

    return NextResponse.json({
      success: true,
      qoveryDomain,
      categoryDataCount: categoryData?.length || 0,
      categoryData: categoryData?.slice(0, 3),
      totalUrls: urls?.length || 0,
      error: 'No URLs found'
    })

  } catch (error: any) {
    return NextResponse.json({ 
      error: 'Unexpected error', 
      details: error.message,
      stack: error.stack 
    })
  }
}
