import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { ACTIVE_PROVIDERS } from '@/types/domain/provider'

/**
 * GET /api/reports/visibility2
 * Uses EXACT same pattern as Content API
 */
export async function GET(request: NextRequest) {
  try {
    // Use service client to bypass RLS (same as Content API)
    const supabase = createServiceClient()

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

    // STEP 1: Get daily reports with date filtering (EXACT same as Content API)
    let dailyReportsQuery = supabase
      .from('daily_reports')
      .select('id, report_date')
      .eq('brand_id', brandId)
      .eq('status', 'completed')

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
          totalReports: 0,
          mentionsOverTime: []
        }
      })
    }

    const dailyReportIds = dailyReports.map(dr => dr.id)

    // STEP 2: Get prompt results (EXACT same as Content API pattern)
    let query = supabase
      .from('prompt_results')
      .select(`
        id,
        provider,
        brand_mention_count,
        daily_report_id
      `)
      .in('daily_report_id', dailyReportIds)
      .in('provider_status', ['ok'])

    if (selectedModels.length > 0) {
      query = query.in('provider', selectedModels)
    }

    const { data: promptResults, error: resultsError } = await query

    if (resultsError) {
      console.error('❌ [VISIBILITY2 API] Error fetching prompt results:', resultsError)
      return NextResponse.json({
        success: false,
        error: 'Failed to fetch prompt results'
      }, { status: 500 })
    }

    console.log(`📊 [VISIBILITY2 API] Found ${promptResults?.length || 0} prompt results`)

    if (!promptResults || promptResults.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          totalMentions: 0,
          totalReports: dailyReports.length,
          mentionsOverTime: dailyReports.map(report => ({
            date: report.report_date,
            mentions: 0
          }))
        }
      })
    }

    // STEP 3: Aggregate data (simple like Content API)
    let totalBrandMentions = 0

    // Create a map of report_date -> mentions for time series
    const mentionsByDate = new Map<string, number>()

    // Initialize all dates with 0
    dailyReports.forEach(report => {
      mentionsByDate.set(report.report_date, 0)
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

      // Update date aggregation
      const currentDateMentions = mentionsByDate.get(reportDate) || 0
      mentionsByDate.set(reportDate, currentDateMentions + brandMentions)
    })

    // Convert map to array for time series chart
    const mentionsOverTime = Array.from(mentionsByDate.entries()).map(([date, mentions]) => ({
      date,
      mentions
    }))

    console.log('✅ [VISIBILITY2 API] Success:', {
      totalBrandMentions,
      totalReports: dailyReports.length,
      selectedModels
    })

    return NextResponse.json({
      success: true,
      data: {
        totalMentions: totalBrandMentions,
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
