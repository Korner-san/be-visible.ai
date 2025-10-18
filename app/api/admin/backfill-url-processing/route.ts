import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { processUrlsForDailyReport } from '@/lib/services/url-classification-service'

/**
 * Admin endpoint to backfill URL processing for existing reports
 * This is a one-time operation to process reports that were generated before the URL processing was added
 */
export async function POST(request: NextRequest) {
  try {
    const { reportId, reportDate } = await request.json()
    
    if (!reportId && !reportDate) {
      return NextResponse.json({
        error: 'Either reportId or reportDate is required'
      }, { status: 400 })
    }
    
    console.log('🔄 [BACKFILL] Starting URL processing backfill...')
    
    const supabase = createServiceClient()
    
    let reportIds: string[] = []
    
    if (reportId) {
      reportIds = [reportId]
    } else if (reportDate) {
      // Get all reports for this date
      const { data: reports, error } = await supabase
        .from('daily_reports')
        .select('id, brand_id, report_date')
        .eq('report_date', reportDate)
        .eq('generated', true)
      
      if (error) {
        console.error('❌ [BACKFILL] Error fetching reports:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      
      reportIds = (reports || []).map(r => r.id)
      console.log(`📊 [BACKFILL] Found ${reportIds.length} reports for ${reportDate}`)
    }
    
    if (reportIds.length === 0) {
      return NextResponse.json({
        message: 'No reports found to process',
        processed: 0
      })
    }
    
    const results = []
    
    for (const reportId of reportIds) {
      console.log(`\n🔄 [BACKFILL] Processing report ${reportId}`)
      
      try {
        // Process URLs
        const urlStats = await processUrlsForDailyReport(reportId)
        console.log(`✅ [BACKFILL] Processed URLs:`, urlStats)
        
        results.push({
          reportId,
          success: true,
          urlStats
        })
      } catch (error: any) {
        console.error(`❌ [BACKFILL] Error processing report ${reportId}:`, error)
        results.push({
          reportId,
          success: false,
          error: error.message
        })
      }
    }
    
    const successCount = results.filter(r => r.success).length
    
    console.log(`\n✅ [BACKFILL] Backfill complete: ${successCount}/${reportIds.length} successful`)
    
    return NextResponse.json({
      message: 'Backfill complete',
      totalReports: reportIds.length,
      successful: successCount,
      failed: reportIds.length - successCount,
      results
    })
    
  } catch (error: any) {
    console.error('❌ [BACKFILL] Unexpected error:', error)
    return NextResponse.json({
      error: 'Internal server error',
      details: error.message
    }, { status: 500 })
  }
}

