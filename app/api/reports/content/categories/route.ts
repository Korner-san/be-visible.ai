import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/reports/content/categories
 * Returns content structure categorization data for Content page
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
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
    
    const { data: citations, error: citationsError } = await supabase
      .from('url_citations')
      .select(`
        id,
        url_id,
        provider,
        prompt_result_id,
        url_inventory!inner(url),
        url_content_facts!inner(content_structure_category, domain_role_category, extracted_at)
      `)
      .in('prompt_result_id', promptResultIds)

    if (citationsError) {
      console.error('Error fetching citations:', citationsError)
      return NextResponse.json({ error: citationsError.message }, { status: 500 })
    }

    if (!citations || citations.length === 0) {
      return NextResponse.json({ categories: [] })
    }

    // Get prompt intent classifications
    const dailyReportIds = [...new Set(promptResults.map(r => r.daily_report_id))]
    const { data: promptIntents } = await supabase
      .from('prompt_intent_classifications')
      .select('daily_report_id, brand_prompt_id, intent_category')
      .in('daily_report_id', dailyReportIds)

    // Create a map of prompt_result_id to intent_category
    const promptIntentMap: Record<string, string> = {}
    if (promptIntents) {
      promptIntents.forEach((intent: any) => {
        // Find matching prompt results
        promptResults.forEach(pr => {
          if (pr.daily_report_id === intent.daily_report_id) {
            promptIntentMap[pr.id] = intent.intent_category
          }
        })
      })
    }

    // Aggregate by content structure category
    const categoryStats: Record<string, {
      count: number
      uniqueUrls: Set<string>
      intentCounts: Record<string, number>
      citationDates: Date[]
    }> = {}

    citations.forEach((citation: any) => {
      const category = citation.url_content_facts?.content_structure_category || 'OFFICIAL_DOCUMENTATION'
      const url = citation.url_inventory?.url
      const promptResultId = citation.prompt_result_id
      const intent = promptIntentMap[promptResultId] || 'FOUNDATIONAL_AUTHORITY'
      const extractedAt = citation.url_content_facts?.extracted_at

      if (!categoryStats[category]) {
        categoryStats[category] = {
          count: 0,
          uniqueUrls: new Set(),
          intentCounts: {},
          citationDates: []
        }
      }

      categoryStats[category].count++
      if (url) categoryStats[category].uniqueUrls.add(url)
      categoryStats[category].intentCounts[intent] = 
        (categoryStats[category].intentCounts[intent] || 0) + 1
      if (extractedAt) categoryStats[category].citationDates.push(new Date(extractedAt))
    })

    // Calculate total citations
    const totalCitations = Object.values(categoryStats).reduce((sum, stats) => sum + stats.count, 0)

    // Format response
    const categories = Object.entries(categoryStats).map(([category, stats]) => {
      const uniqueUrls = stats.uniqueUrls.size
      const percentage = totalCitations > 0 ? ((stats.count / totalCitations) * 100).toFixed(1) : '0'
      
      // Find primary intent
      const primaryIntent = Object.entries(stats.intentCounts)
        .sort(([, a], [, b]) => b - a)[0]?.[0] || 'N/A'

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
        primaryIntent,
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

