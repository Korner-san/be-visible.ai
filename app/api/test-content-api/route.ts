import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Test endpoint to debug content API
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const brandId = searchParams.get('brandId') || 'fbf81956-e312-40e6-8fcf-920185582421'
    const from = searchParams.get('from') || '2025-10-19'
    const to = searchParams.get('to') || '2025-10-22'
    const selectedModels = searchParams.get('selectedModels')?.split(',') || ['perplexity', 'google_ai_overview']

    console.log('🔍 [TEST API] Testing with params:', { brandId, from, to, selectedModels })

    const supabase = createServiceClient()
    
    // Step 1: Get prompt results
    const { data: promptResults, error: resultsError } = await supabase
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
      .gte('daily_reports.report_date', from)
      .lte('daily_reports.report_date', to)
      .in('provider', selectedModels)

    console.log('📊 [TEST API] Prompt results:', promptResults?.length || 0, resultsError)

    if (!promptResults || promptResults.length === 0) {
      return NextResponse.json({ 
        success: false, 
        error: 'No prompt results found',
        step: 'prompt_results'
      })
    }

    // Step 2: Get URL citations
    const promptResultIds = promptResults.map(r => r.id)
    const { data: citations, error: citationsError } = await supabase
      .from('url_citations')
      .select(`
        id,
        url_id,
        provider,
        prompt_result_id
      `)
      .in('prompt_result_id', promptResultIds)

    console.log('📊 [TEST API] Citations:', citations?.length || 0, citationsError)

    if (!citations || citations.length === 0) {
      return NextResponse.json({ 
        success: false, 
        error: 'No citations found',
        step: 'citations'
      })
    }

    // Step 3: Get URL data
    const urlIds = citations.map((c: any) => c.url_id)
    const { data: urlData, error: urlError } = await supabase
      .from('url_inventory')
      .select(`
        id,
        url,
        url_content_facts(content_structure_category, extracted_at)
      `)
      .in('id', urlIds)

    console.log('📊 [TEST API] URL data:', urlData?.length || 0, urlError)

    if (!urlData || urlData.length === 0) {
      return NextResponse.json({ 
        success: false, 
        error: 'No URL data found',
        step: 'url_data'
      })
    }

    // Step 4: Process categories
    const urlDataMap = new Map(
      urlData.map((u: any) => [u.id, {
        url: u.url,
        content_structure_category: u.url_content_facts?.[0]?.content_structure_category,
        extracted_at: u.url_content_facts?.[0]?.extracted_at
      }])
    )

    const categoryStats: Record<string, {
      count: number
      uniqueUrls: Set<string>
      citationDates: Date[]
    }> = {}

    citations.forEach((citation: any) => {
      const urlInfo = urlDataMap.get(citation.url_id)
      if (!urlInfo || !urlInfo.content_structure_category) return

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

    console.log('📊 [TEST API] Categories found:', Object.keys(categoryStats).length)
    console.log('📊 [TEST API] Category stats:', categoryStats)

    return NextResponse.json({
      success: true,
      data: {
        promptResults: promptResults.length,
        citations: citations.length,
        urlData: urlData.length,
        categories: Object.keys(categoryStats).length,
        categoryStats
      }
    })

  } catch (error) {
    console.error('❌ [TEST API] Error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
