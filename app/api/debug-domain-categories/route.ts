import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET(request: NextRequest) {
  try {
    const supabase = createServiceClient()
    
    // Check qovery.com specifically
    const domain = 'qovery.com'
    
    console.log(`🔍 [DEBUG] Checking domain categorization for: ${domain}`)
    
    // Get all URLs for this domain
    const { data: urls, error: urlsError } = await supabase
      .from('url_inventory')
      .select(`
        id,
        url,
        normalized_url,
        domain,
        url_content_facts!inner(
          domain_role_category,
          content_structure_category,
          domain_classified_at
        )
      `)
      .eq('domain', domain)
      .limit(5)
    
    if (urlsError) {
      console.error('❌ [DEBUG] Error fetching URLs:', urlsError)
      return NextResponse.json({
        success: false,
        error: urlsError.message
      })
    }
    
    console.log(`📊 [DEBUG] Found ${urls?.length || 0} URLs for ${domain}`)
    
    // Check domain-level classification
    const { data: domainClassification, error: domainError } = await supabase
      .from('url_content_facts')
      .select('domain_role_category, domain_classified_at')
      .eq('url_id', urls?.[0]?.id || '')
      .not('domain_classified_at', 'is', null)
      .limit(1)
    
    console.log(`🌐 [DEBUG] Domain classification:`, domainClassification)
    
    return NextResponse.json({
      success: true,
      domain,
      urls: urls?.map(url => ({
        url: url.url,
        domain_role_category: url.url_content_facts?.domain_role_category,
        content_structure_category: url.url_content_facts?.content_structure_category,
        domain_classified_at: url.url_content_facts?.domain_classified_at
      })) || [],
      domainClassification: domainClassification?.[0] || null,
      hasDomainClassification: !!domainClassification?.[0]
    })
    
  } catch (error: any) {
    console.error('❌ [DEBUG] Error:', error)
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 })
  }
}
