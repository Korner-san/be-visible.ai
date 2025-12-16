import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ACTIVE_PROVIDERS } from '@/types/domain/provider'

/**
 * GET /api/reports/visibility2
 * Clean implementation using working patterns from Citations & Content pages
 * Reads brand_mention_count and competitor_mention_counts directly from database
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const brandId = searchParams.get('brandId')
    const fromDate = searchParams.get('from')
    const toDate = searchParams.get('to')
    const modelsParam = searchParams.get('models')

    // Parse model filter - default to all active providers
    const selectedModels = modelsParam ? modelsParam.split(',') : [...ACTIVE_PROVIDERS]

    console.log('🔍 [VISIBILITY2 API] Request:', {
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
      .select('id, name, owner_user_id')
      .eq('id', brandId)
      .single()

    if (brandError || !brand || brand.owner_user_id !== user.id) {
      return NextResponse.json({
        success: false,
        error: 'Brand not found or access denied'
      }, { status: 404 })
    }

    // STEP 1: Get daily reports with date filtering (following Content API pattern)
    let dailyReportsQuery = supabase
      .from('daily_reports')
      .select('id, report_date, status')
      .eq('brand_id', brandId)
      .eq('status', 'completed')
      .order('report_date', { ascending: true })

    if (fromDate) {
      dailyReportsQuery = dailyReportsQuery.gte('report_date', fromDate)
    }
    if (toDate) {
      dailyReportsQuery = dailyReportsQuery.lte('report_date', toDate)
    }

    const { data: dailyReports, error: reportsError } = await dailyReportsQuery

    if (reportsError) {
      console.error('❌ [VISIBILITY2 API] Error fetching daily reports:', reportsError)
      return NextResponse.json({
        success: false,
        error: 'Failed to fetch reports'
      }, { status: 500 })
    }

    console.log(`📊 [VISIBILITY2 API] Found ${dailyReports?.length || 0} daily reports`)

    if (!dailyReports || dailyReports.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          totalMentions: 0,
          totalCompetitorMentions: 0,
          totalReports: 0,
          mentionsOverTime: []
        }
      })
    }

    const dailyReportIds = dailyReports.map(dr => dr.id)

    // STEP 2: Get prompt results for these reports (following Citations API pattern)
    let query = supabase
      .from('prompt_results')
      .select(`
        id,
        provider,
        provider_status,
        brand_mention_count,
        competitor_mention_counts,
        daily_report_id
      `)
      .in('daily_report_id', dailyReportIds)
      .in('provider', selectedModels)

    const { data: promptResults, error: resultsError } = await query

    console.log(`📊 [VISIBILITY2 API] Found ${promptResults?.length || 0} prompt results`)

    if (resultsError) {
      console.error('❌ [VISIBILITY2 API] Error fetching prompt results:', resultsError)
      return NextResponse.json({
        success: false,
        error: 'Failed to fetch prompt results'
      }, { status: 500 })
    }

    if (!promptResults || promptResults.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          totalMentions: 0,
          totalCompetitorMentions: 0,
          totalReports: dailyReports.length,
          mentionsOverTime: dailyReports.map(report => ({
            date: report.report_date,
            mentions: 0,
            competitorMentions: 0
          }))
        }
      })
    }

    // STEP 3: Aggregate data (clean and simple)
    let totalBrandMentions = 0
    let totalCompetitorMentions = 0

    // Create a map of report_date -> mentions for time series
    const mentionsByDate = new Map<string, { brandMentions: number, competitorMentions: number }>()

    // Initialize all dates with 0
    dailyReports.forEach(report => {
      mentionsByDate.set(report.report_date, { brandMentions: 0, competitorMentions: 0 })
    })

    // Aggregate mentions from prompt results
    promptResults.forEach(result => {
      // Get the report date for this result
      const report = dailyReports.find(dr => dr.id === result.daily_report_id)
      if (!report) return

      const reportDate = report.report_date

      // Read brand_mention_count directly from database
      const brandMentions = result.brand_mention_count || 0
      totalBrandMentions += brandMentions

      // Read competitor_mention_counts (JSONB object like {"Microsoft": 3, "AWS": 2})
      const competitorCounts = result.competitor_mention_counts || {}
      let resultCompetitorMentions = 0

      if (typeof competitorCounts === 'object') {
        resultCompetitorMentions = Object.values(competitorCounts).reduce((sum: number, count: any) => {
          return sum + (typeof count === 'number' ? count : 0)
        }, 0)
      }

      totalCompetitorMentions += resultCompetitorMentions

      // Update date aggregation
      const dateData = mentionsByDate.get(reportDate)
      if (dateData) {
        dateData.brandMentions += brandMentions
        dateData.competitorMentions += resultCompetitorMentions
      }
    })

    // Convert map to array for time series chart
    const mentionsOverTime = Array.from(mentionsByDate.entries()).map(([date, data]) => ({
      date,
      mentions: data.brandMentions,
      competitorMentions: data.competitorMentions
    }))

    console.log('✅ [VISIBILITY2 API] Success:', {
      totalBrandMentions,
      totalCompetitorMentions,
      totalReports: dailyReports.length,
      selectedModels
    })

    return NextResponse.json({
      success: true,
      data: {
        totalMentions: totalBrandMentions,
        totalCompetitorMentions: totalCompetitorMentions,
        totalReports: dailyReports.length,
        mentionsOverTime: mentionsOverTime
      }
    })

  } catch (error) {
    console.error('❌ [VISIBILITY2 API] Unexpected error:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 })
  }
}
