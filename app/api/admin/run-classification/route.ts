import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

// Admin endpoint to manually trigger classification for a specific daily report
export async function POST(request: NextRequest) {
  try {
    const { dailyReportId, brandId } = await request.json()
    
    if (!dailyReportId || !brandId) {
      return NextResponse.json({
        success: false,
        error: 'dailyReportId and brandId are required'
      }, { status: 400 })
    }

    console.log(`🤖 [ADMIN] Manually triggering classification for report: ${dailyReportId}`)

    // Use service client to bypass RLS
    const supabase = createServiceClient()

    // Get the report date
    const { data: report, error: reportError } = await supabase
      .from('daily_reports')
      .select('report_date, brand_id')
      .eq('id', dailyReportId)
      .single()

    if (reportError || !report) {
      return NextResponse.json({
        success: false,
        error: 'Report not found'
      }, { status: 404 })
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://v0-be-visible-ai.vercel.app'
    const results = {
      perplexity: null as any,
      claude: null as any,
      googleAIOverview: null as any
    }

    // Run Perplexity classification
    try {
      console.log('🤖 [PERPLEXITY] Running classification...')
      const perplexityResponse = await fetch(`${baseUrl}/api/reports/classify-portrayal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          brandId: brandId,
          fromCron: true,
          dailyReportId: dailyReportId
        })
      })

      if (perplexityResponse.ok) {
        results.perplexity = await perplexityResponse.json()
        console.log('✅ [PERPLEXITY] Classification completed:', results.perplexity)
      } else {
        const errorText = await perplexityResponse.text()
        console.error('❌ [PERPLEXITY] Classification failed:', errorText)
        results.perplexity = { error: errorText }
      }
    } catch (error) {
      console.error('❌ [PERPLEXITY] Classification error:', error)
      results.perplexity = { error: (error as Error).message }
    }

    // Run Claude classification
    try {
      console.log('🤖 [CLAUDE] Running classification...')
      const claudeResponse = await fetch(`${baseUrl}/api/reports/classify-claude-portrayal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          brandId: brandId,
          fromCron: true,
          dailyReportId: dailyReportId
        })
      })

      if (claudeResponse.ok) {
        results.claude = await claudeResponse.json()
        console.log('✅ [CLAUDE] Classification completed:', results.claude)
      } else {
        const errorText = await claudeResponse.text()
        console.error('❌ [CLAUDE] Classification failed:', errorText)
        results.claude = { error: errorText }
      }
    } catch (error) {
      console.error('❌ [CLAUDE] Classification error:', error)
      results.claude = { error: (error as Error).message }
    }

    // Run Google AI Overview classification
    try {
      console.log('🤖 [GOOGLE AI OVERVIEW] Running classification...')
      const googleResponse = await fetch(`${baseUrl}/api/reports/classify-google-ai-overview-portrayal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          brandId: brandId,
          fromCron: true,
          dailyReportId: dailyReportId
        })
      })

      if (googleResponse.ok) {
        results.googleAIOverview = await googleResponse.json()
        console.log('✅ [GOOGLE AI OVERVIEW] Classification completed:', results.googleAIOverview)
      } else {
        const errorText = await googleResponse.text()
        console.error('❌ [GOOGLE AI OVERVIEW] Classification failed:', errorText)
        results.googleAIOverview = { error: errorText }
      }
    } catch (error) {
      console.error('❌ [GOOGLE AI OVERVIEW] Classification error:', error)
      results.googleAIOverview = { error: (error as Error).message }
    }

    return NextResponse.json({
      success: true,
      message: 'Classification completed',
      reportId: dailyReportId,
      reportDate: report.report_date,
      results
    })

  } catch (error) {
    console.error('❌ [ADMIN] Unexpected error:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 })
  }
}

