import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET(request: NextRequest) {
  try {
    const supabase = createServiceClient()
    
    console.log('🔍 [DEBUG] Finding domains with categorized URLs...')
    
    // Find domains that have URLs with content categorization
    const { data: categorizedDomains, error: error1 } = await supabase
      .from('url_content_facts')
      .select(`
        url_inventory!inner(
          domain,
          url,
          normalized_url
        ),
        content_structure_category,
        domain_role_category,
        domain_classified_at
      `)
      .not('content_structure_category', 'is', null)
      .limit(20)
    
    if (error1) {
      console.error('❌ [DEBUG] Error fetching categorized domains:', error1)
      return NextResponse.json({
        success: false,
        error: error1.message
      })
    }
    
    // Group by domain
    const domainStats: { [domain: string]: any } = {}
    
    categorizedDomains?.forEach(item => {
      const domain = item.url_inventory?.domain
      if (!domain) return
      
      if (!domainStats[domain]) {
        domainStats[domain] = {
          domain,
          totalUrls: 0,
          categorizedUrls: 0,
          contentTypes: new Set(),
          domainCategories: new Set(),
          hasDomainClassification: false,
          sampleUrls: []
        }
      }
      
      domainStats[domain].totalUrls++
      
      if (item.content_structure_category) {
        domainStats[domain].categorizedUrls++
        domainStats[domain].contentTypes.add(item.content_structure_category)
      }
      
      if (item.domain_role_category) {
        domainStats[domain].domainCategories.add(item.domain_role_category)
      }
      
      if (item.domain_classified_at) {
        domainStats[domain].hasDomainClassification = true
      }
      
      // Keep sample URLs (max 3 per domain)
      if (domainStats[domain].sampleUrls.length < 3) {
        domainStats[domain].sampleUrls.push({
          url: item.url_inventory?.url,
          content_type: item.content_structure_category,
          domain_category: item.domain_role_category
        })
      }
    })
    
    // Convert sets to arrays and sort by categorized URLs
    const results = Object.values(domainStats)
      .map(domain => ({
        ...domain,
        contentTypes: Array.from(domain.contentTypes),
        domainCategories: Array.from(domain.domainCategories),
        sampleUrls: domain.sampleUrls
      }))
      .sort((a, b) => b.categorizedUrls - a.categorizedUrls)
      .slice(0, 10) // Top 10 domains
    
    console.log(`📊 [DEBUG] Found ${results.length} domains with categorization data`)
    
    return NextResponse.json({
      success: true,
      totalDomains: results.length,
      domains: results,
      summary: {
        domainsWithContentTypes: results.filter(d => d.contentTypes.length > 0).length,
        domainsWithDomainClassification: results.filter(d => d.hasDomainClassification).length,
        totalCategorizedUrls: results.reduce((sum, d) => sum + d.categorizedUrls, 0)
      }
    })
    
  } catch (error: any) {
    console.error('❌ [DEBUG] Error:', error)
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 })
  }
}
