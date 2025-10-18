import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { classifyDomainsBatch, storeDomainClassifications } from '@/lib/services/domain-classification-service'

/**
 * POST /api/admin/classify-domains
 * Classify domains based on their homepage content
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createServiceClient()
    
    // Get all unique domains that have URLs but no domain classification
    const { data: domainsData, error: domainsError } = await supabase
      .from('url_inventory')
      .select(`
        domain,
        url_content_facts!inner(domain_role_category, domain_classified_at)
      `)
      .is('url_content_facts.domain_classified_at', null)
      .limit(50) // Process in batches
    
    if (domainsError) {
      console.error('❌ [DOMAIN CLASSIFICATION] Error fetching domains:', domainsError)
      return NextResponse.json({
        success: false,
        error: 'Failed to fetch domains'
      }, { status: 500 })
    }
    
    if (!domainsData || domainsData.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No domains need classification',
        processed: 0
      })
    }
    
    // Extract unique domains
    const uniqueDomains = [...new Set(domainsData.map(item => item.domain))]
    console.log(`🌐 [DOMAIN CLASSIFICATION] Found ${uniqueDomains.length} domains to classify:`, uniqueDomains)
    
    // Classify domains
    const classifications = await classifyDomainsBatch(uniqueDomains)
    
    // Store classifications
    await storeDomainClassifications(classifications)
    
    return NextResponse.json({
      success: true,
      message: `Successfully classified ${classifications.length} domains`,
      processed: classifications.length,
      classifications: classifications.map(c => ({
        domain: c.domain,
        category: c.domain_role_category,
        confidence: c.classification_confidence
      }))
    })
    
  } catch (error: any) {
    console.error('❌ [DOMAIN CLASSIFICATION] Error:', error)
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 })
  }
}

/**
 * GET /api/admin/classify-domains
 * Get status of domain classifications
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createServiceClient()
    
    // Get classification statistics
    const { data: stats, error: statsError } = await supabase
      .from('url_content_facts')
      .select(`
        domain_role_category,
        domain_classified_at,
        url_inventory!inner(domain)
      `)
    
    if (statsError) {
      console.error('❌ [DOMAIN CLASSIFICATION] Error fetching stats:', statsError)
      return NextResponse.json({
        success: false,
        error: 'Failed to fetch statistics'
      }, { status: 500 })
    }
    
    // Group by domain and category
    const domainStats: { [domain: string]: { [category: string]: number } } = {}
    const unclassifiedDomains = new Set<string>()
    
    stats?.forEach(stat => {
      const domain = stat.url_inventory?.domain
      if (!domain) return
      
      if (!domainStats[domain]) {
        domainStats[domain] = {}
      }
      
      if (stat.domain_classified_at) {
        const category = stat.domain_role_category || 'UNKNOWN'
        domainStats[domain][category] = (domainStats[domain][category] || 0) + 1
      } else {
        unclassifiedDomains.add(domain)
      }
    })
    
    return NextResponse.json({
      success: true,
      totalDomains: Object.keys(domainStats).length,
      unclassifiedDomains: Array.from(unclassifiedDomains),
      domainStats: Object.entries(domainStats).map(([domain, categories]) => ({
        domain,
        categories: Object.entries(categories).map(([category, count]) => ({
          category,
          count
        }))
      }))
    })
    
  } catch (error: any) {
    console.error('❌ [DOMAIN CLASSIFICATION] Error:', error)
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 })
  }
}
