import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { ACTIVE_PROVIDERS } from '@/types/domain/provider'

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
    const selectedModels = modelsParam ? modelsParam.split(',') : [...ACTIVE_PROVIDERS]
    
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

    const supabase = await createClient()
    
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
      .select('id, name, owner_user_id, user_business_type')
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

    let domainRows = domains || []

    if (brand.user_business_type === 'real_estate_israel' && domainRows.length > 0) {
      const serviceClient = createServiceClient()
      const overrideByDomain = await getRealEstateOverrideCategoryByDomain(
        serviceClient,
        brandId,
        fromDate,
        toDate,
        selectedModels
      )

      domainRows = domainRows.map((domain: any) => ({
        ...domain,
        content_structure_category: overrideByDomain.get(domain.domain) || domain.content_structure_category
      }))
    }

    const totalDomains = domainRows.length

    console.log('✅ [Citations Domains API] Success:', {
      totalDomains,
      selectedModels
    })

    return NextResponse.json({
      success: true,
      data: {
        domains: domainRows,
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

async function getRealEstateOverrideCategoryByDomain(
  supabase: any,
  brandId: string,
  fromDate: string | null,
  toDate: string | null,
  selectedModels: string[]
): Promise<Map<string, string>> {
  let resultsQuery = supabase
    .from('prompt_results')
    .select('id, daily_reports!inner(brand_id, report_date)')
    .eq('daily_reports.brand_id', brandId)
    .in('provider_status', ['ok'])
    .in('provider', selectedModels)

  if (fromDate) resultsQuery = resultsQuery.gte('daily_reports.report_date', fromDate)
  if (toDate) resultsQuery = resultsQuery.lte('daily_reports.report_date', toDate)

  const { data: promptResults, error: resultsError } = await resultsQuery
  if (resultsError || !promptResults?.length) return new Map()

  const resultIds = promptResults.map((r: any) => r.id)
  const citations: any[] = []
  for (let i = 0; i < resultIds.length; i += 500) {
    const batch = resultIds.slice(i, i + 500)
    const { data } = await supabase
      .from('url_citations')
      .select('url_id')
      .in('prompt_result_id', batch)
    if (data) citations.push(...data)
  }

  const urlIds = [...new Set(citations.map((c: any) => c.url_id).filter(Boolean))]
  if (urlIds.length === 0) return new Map()

  const inventory: any[] = []
  const overrides: any[] = []
  for (let i = 0; i < urlIds.length; i += 500) {
    const batch = urlIds.slice(i, i + 500)
    const [{ data: inv }, { data: ov }] = await Promise.all([
      supabase.from('url_inventory').select('id, domain').in('id', batch),
      supabase
        .from('brand_url_content_facts')
        .select('url_id, content_structure_category')
        .eq('brand_id', brandId)
        .in('url_id', batch)
    ])
    if (inv) inventory.push(...inv)
    if (ov) overrides.push(...ov)
  }

  const domainByUrlId = new Map(inventory.map((row: any) => [row.id, row.domain]))
  const counts = new Map<string, Map<string, number>>()

  for (const override of overrides) {
    const domain = domainByUrlId.get(override.url_id)
    if (!domain || !override.content_structure_category) continue
    if (!counts.has(domain)) counts.set(domain, new Map())
    const domainCounts = counts.get(domain)!
    domainCounts.set(
      override.content_structure_category,
      (domainCounts.get(override.content_structure_category) || 0) + 1
    )
  }

  const bestByDomain = new Map<string, string>()
  for (const [domain, categoryCounts] of counts.entries()) {
    const [category] = [...categoryCounts.entries()].sort((a, b) => b[1] - a[1])[0]
    bestByDomain.set(domain, category)
  }

  return bestByDomain
}

