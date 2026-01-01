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
      .select('id, name, owner_user_id, domain')
      .eq('id', brandId)
      .single()

    if (brandError || !brand || brand.owner_user_id !== user.id) {
      return NextResponse.json({
        success: false,
        error: 'Brand not found or access denied'
      }, { status: 404 })
    }

    // Build query for citation share stats (brand domain only)
    let query = supabase
      .from('citation_share_stats')
      .select('report_date, citation_share, citation_count, total_citations, rank')
      .eq('brand_id', brandId)
      .eq('domain_type', 'brand')
      .order('report_date', { ascending: true })

    // Apply date filters if provided
    if (fromDate) {
      query = query.gte('report_date', fromDate)
    }
    if (toDate) {
      query = query.lte('report_date', toDate)
    }

    const { data: citationData, error: dataError } = await query

    if (dataError) {
      console.error('Error fetching citation share:', dataError)
      return NextResponse.json({
        success: false,
        error: 'Failed to fetch citation share data'
      }, { status: 500 })
    }

    // Format data for chart
    const shares = citationData?.map(record => ({
      date: record.report_date,
      share: parseFloat(record.citation_share || '0'),
      citationCount: record.citation_count,
      totalCitations: record.total_citations,
      rank: record.rank
    })) || []

    // Calculate summary
    const shareValues = shares.map(s => s.share)
    const currentShare = shareValues.length > 0 ? shareValues[shareValues.length - 1] : 0
    const avgShare = shareValues.length > 0
      ? shareValues.reduce((sum, s) => sum + s, 0) / shareValues.length
      : 0

    // Determine trend
    let trend = 'stable'
    if (shareValues.length >= 2) {
      const recentShares = shareValues.slice(-3) // Last 3 data points
      const firstRecent = recentShares[0]
      const lastRecent = recentShares[recentShares.length - 1]

      if (lastRecent > firstRecent + 1) trend = 'increasing' // +1% threshold
      else if (lastRecent < firstRecent - 1) trend = 'decreasing' // -1% threshold
    }

    // Get current rank
    const currentRecord = shares[shares.length - 1]
    const currentRank = currentRecord?.rank || 0

    return NextResponse.json({
      success: true,
      data: {
        shares,
        summary: {
          currentShare,
          avgShare,
          trend,
          currentRank,
          brandDomain: brand.domain
        }
      }
    })

  } catch (error) {
    console.error('Citation share over time API error:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 })
  }
}
