import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const brandId = searchParams.get('brandId')
    const reportDate = searchParams.get('date') // Optional: specific date, defaults to latest

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

    // Determine which date to use
    let targetDate = reportDate
    if (!targetDate) {
      // Get the latest report date with citation share data
      const { data: latestData } = await supabase
        .from('citation_share_stats')
        .select('report_date')
        .eq('brand_id', brandId)
        .order('report_date', { ascending: false })
        .limit(1)
        .single()

      targetDate = latestData?.report_date
    }

    if (!targetDate) {
      return NextResponse.json({
        success: true,
        data: {
          rankings: [],
          reportDate: null,
          message: 'No citation share data available'
        }
      })
    }

    // Get all citation share stats for this date (brand + competitors)
    const { data: rankings, error: rankingsError } = await supabase
      .from('citation_share_stats')
      .select(`
        domain,
        domain_type,
        citation_count,
        total_citations,
        citation_share,
        rank,
        competitor_id,
        brand_competitors (
          competitor_name
        )
      `)
      .eq('brand_id', brandId)
      .eq('report_date', targetDate)
      .order('rank', { ascending: true })

    if (rankingsError) {
      console.error('Error fetching rankings:', rankingsError)
      return NextResponse.json({
        success: false,
        error: 'Failed to fetch rankings'
      }, { status: 500 })
    }

    // Format rankings data
    const formattedRankings = rankings?.map(record => {
      const isBrand = record.domain_type === 'brand'
      const displayName = isBrand
        ? brand.name + ' (Your Brand)'
        : (record.brand_competitors?.competitor_name || record.domain)

      // Calculate change (optional - would need historical data)
      const shareChange = 0 // TODO: Calculate from previous period if needed

      return {
        rank: record.rank,
        domain: record.domain,
        displayName,
        isBrand,
        share: parseFloat(record.citation_share || '0'),
        shareChange, // Percentage point change from previous period
        citationCount: record.citation_count,
        totalCitations: record.total_citations
      }
    }) || []

    return NextResponse.json({
      success: true,
      data: {
        rankings: formattedRankings,
        reportDate: targetDate,
        brandRank: formattedRankings.find(r => r.isBrand)?.rank || 0
      }
    })

  } catch (error) {
    console.error('Citation share rankings API error:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 })
  }
}
