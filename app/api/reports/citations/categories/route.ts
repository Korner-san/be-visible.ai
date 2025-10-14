import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * GET /api/reports/citations/categories
 * Returns domain categorization data for Citations page
 */
export async function GET(request: NextRequest) {
  try {
    // Use both clients - user client for auth check, service client for queries
    const userSupabase = await createClient()
    const supabase = createServiceClient()
    
    // Get query parameters
    const searchParams = request.nextUrl.searchParams
    const brandId = searchParams.get('brandId')
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const selectedModels = searchParams.get('selectedModels')?.split(',') || []

    if (!brandId) {
      return NextResponse.json({ error: 'Brand ID required' }, { status: 400 })
    }

    // Get all prompt results for this brand within date range
    let query = supabase
      .from('prompt_results')
      .select(`
        id,
        provider,
        created_at,
        daily_report_id,
        daily_reports!inner(brand_id, report_date)
      `)
      .eq('daily_reports.brand_id', brandId)
      .in('provider_status', ['ok'])

    if (from) {
      query = query.gte('daily_reports.report_date', from)
    }
    if (to) {
      query = query.lte('daily_reports.report_date', to)
    }
    if (selectedModels.length > 0) {
      query = query.in('provider', selectedModels)
    }

    const { data: promptResults, error: resultsError } = await query

    if (resultsError) {
      console.error('Error fetching prompt results:', resultsError)
      return NextResponse.json({ error: resultsError.message }, { status: 500 })
    }

    if (!promptResults || promptResults.length === 0) {
      return NextResponse.json({ categories: [] })
    }

    // Get URL citations for these prompt results
    const promptResultIds = promptResults.map(r => r.id)
    
    // First, get all citations
    const { data: citations, error: citationsError } = await supabase
      .from('url_citations')
      .select(`
        id,
        url_id,
        provider,
        prompt_result_id
      `)
      .in('prompt_result_id', promptResultIds)
    
    if (citationsError) {
      console.error('Error fetching citations:', citationsError)
      return NextResponse.json({ error: citationsError.message }, { status: 500 })
    }

    if (!citations || citations.length === 0) {
      return NextResponse.json({ categories: [] })
    }

    // Get url_inventory and url_content_facts for these citations
    const urlIds = citations.map((c: any) => c.url_id)
    
    const { data: urlData, error: urlError } = await supabase
      .from('url_inventory')
      .select(`
        id,
        domain,
        url,
        url_content_facts!inner(domain_role_category)
      `)
      .in('id', urlIds)

    if (urlError) {
      console.error('Error fetching URL data:', urlError)
      return NextResponse.json({ error: urlError.message }, { status: 500 })
    }

    if (!urlData || urlData.length === 0) {
      return NextResponse.json({ categories: [] })
    }

    // Create a map of url_id to url data
    const urlDataMap = new Map(
      urlData.map((u: any) => [u.id, {
        domain: u.domain,
        url: u.url,
        domain_role_category: u.url_content_facts?.domain_role_category
      }])
    )

    // Aggregate by domain role category
    const categoryStats: Record<string, {
      count: number
      uniqueDomains: Set<string>
      uniqueUrls: Set<string>
      providerCounts: Record<string, number>
    }> = {}

    citations.forEach((citation: any) => {
      const urlInfo = urlDataMap.get(citation.url_id)
      if (!urlInfo || !urlInfo.domain_role_category) return // Skip URLs without classification

      const category = urlInfo.domain_role_category
      const domain = urlInfo.domain
      const url = urlInfo.url
      const provider = citation.provider

      if (!categoryStats[category]) {
        categoryStats[category] = {
          count: 0,
          uniqueDomains: new Set(),
          uniqueUrls: new Set(),
          providerCounts: {}
        }
      }

      categoryStats[category].count++
      if (domain) categoryStats[category].uniqueDomains.add(domain)
      if (url) categoryStats[category].uniqueUrls.add(url)
      if (provider) {
        categoryStats[category].providerCounts[provider] = 
          (categoryStats[category].providerCounts[provider] || 0) + 1
      }
    })

    // Calculate total citations for share of voice
    const totalCitations = Object.values(categoryStats).reduce((sum, stats) => sum + stats.count, 0)

    // Format response
    const categories = Object.entries(categoryStats).map(([category, stats]) => {
      const uniqueDomains = stats.uniqueDomains.size
      const uniqueUrls = stats.uniqueUrls.size
      const shareOfVoice = totalCitations > 0 
        ? Math.round((stats.count / totalCitations) * 100) 
        : 0
      
      // Find dominant provider
      const dominantProvider = Object.entries(stats.providerCounts)
        .sort(([, a], [, b]) => b - a)[0]?.[0] || 'N/A'

      return {
        category,
        count: stats.count,
        uniqueDomains,
        uniqueUrls,
        shareOfVoice,
        dominantModel: dominantProvider
      }
    }).sort((a, b) => b.count - a.count)

    return NextResponse.json({ categories })

  } catch (error: any) {
    console.error('Error in citations categories API:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}

