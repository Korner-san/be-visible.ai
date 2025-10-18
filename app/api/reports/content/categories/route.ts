import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * GET /api/reports/content/categories
 * Returns content structure categorization data for Content page
 */
export async function GET(request: NextRequest) {
  try {
    // Use service client to bypass RLS for aggregation queries
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
        url,
        url_content_facts!inner(content_structure_category, extracted_at)
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
        url: u.url,
        content_structure_category: u.url_content_facts?.content_structure_category,
        extracted_at: u.url_content_facts?.extracted_at
      }])
    )

    // Aggregate by content structure category
    const categoryStats: Record<string, {
      count: number
      uniqueUrls: Set<string>
      citationDates: Date[]
    }> = {}

    citations.forEach((citation: any) => {
      const urlInfo = urlDataMap.get(citation.url_id)
      if (!urlInfo || !urlInfo.content_structure_category) return // Skip URLs without classification

      const category = urlInfo.content_structure_category
      const url = urlInfo.url
      const extractedAt = urlInfo.extracted_at

      if (!categoryStats[category]) {
        categoryStats[category] = {
          count: 0,
          uniqueUrls: new Set(),
          citationDates: []
        }
      }

      categoryStats[category].count++
      if (url) categoryStats[category].uniqueUrls.add(url)
      if (extractedAt) categoryStats[category].citationDates.push(new Date(extractedAt))
    })

    // Calculate total citations
    const totalCitations = Object.values(categoryStats).reduce((sum, stats) => sum + stats.count, 0)

    // Format response
    const categories = Object.entries(categoryStats).map(([category, stats]) => {
      const uniqueUrls = stats.uniqueUrls.size
      const percentage = totalCitations > 0 ? ((stats.count / totalCitations) * 100).toFixed(1) : '0'
      
      // Calculate average citation longevity (days since first citation)
      let avgLongevity = 0
      if (stats.citationDates.length > 0) {
        const oldestDate = new Date(Math.min(...stats.citationDates.map(d => d.getTime())))
        const now = new Date()
        avgLongevity = Math.floor((now.getTime() - oldestDate.getTime()) / (1000 * 60 * 60 * 24))
      }

      return {
        category,
        count: uniqueUrls,
        percentage: parseFloat(percentage),
        primaryIntent: 'N/A', // No longer available
        avgCitationLongevity: avgLongevity
      }
    }).sort((a, b) => b.percentage - a.percentage)

    return NextResponse.json({ categories })

  } catch (error: any) {
    console.error('Error in content categories API:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}

