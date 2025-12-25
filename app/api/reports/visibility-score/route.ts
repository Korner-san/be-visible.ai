import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const brandId = searchParams.get('brandId')
    const fromDate = searchParams.get('from')
    const toDate = searchParams.get('to')

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

    // Build query for daily reports with visibility scores
    let query = supabase
      .from('daily_reports')
      .select('report_date, visibility_score, status')
      .eq('brand_id', brandId)
      .eq('status', 'completed')
      .not('visibility_score', 'is', null)
      .order('report_date', { ascending: true })

    // Apply date filters if provided
    if (fromDate) {
      query = query.gte('report_date', fromDate)
    }
    if (toDate) {
      query = query.lte('report_date', toDate)
    }

    const { data: dailyReports, error: reportsError } = await query

    if (reportsError) {
      console.error('Error fetching visibility scores:', reportsError)
      return NextResponse.json({
        success: false,
        error: 'Failed to fetch visibility scores'
      }, { status: 500 })
    }

    // Format data for chart
    const scores = dailyReports?.map(report => ({
      date: report.report_date,
      score: parseFloat(report.visibility_score || '0')
    })) || []

    // Calculate summary
    const scoreValues = scores.map(s => s.score)
    const currentScore = scoreValues.length > 0 ? scoreValues[scoreValues.length - 1] : 0
    const avgScore = scoreValues.length > 0
      ? scoreValues.reduce((sum, s) => sum + s, 0) / scoreValues.length
      : 0

    // Determine trend
    let trend = 'stable'
    if (scoreValues.length >= 2) {
      const recentScores = scoreValues.slice(-3) // Last 3 scores
      const firstRecent = recentScores[0]
      const lastRecent = recentScores[recentScores.length - 1]

      if (lastRecent > firstRecent + 5) trend = 'increasing'
      else if (lastRecent < firstRecent - 5) trend = 'decreasing'
    }

    return NextResponse.json({
      success: true,
      data: {
        scores,
        summary: {
          currentScore,
          avgScore,
          trend
        }
      }
    })

  } catch (error) {
    console.error('Visibility score API error:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 })
  }
}
