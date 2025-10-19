import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { processUrlsForDailyReport } from '@/lib/services/url-classification-service'

export async function POST(request: NextRequest) {
  try {
    const { reportId } = await request.json()
    
    if (!reportId) {
      return NextResponse.json({
        success: false,
        error: 'Report ID is required'
      }, { status: 400 })
    }

    console.log(`🔧 [FIX STUCK REPORT] Attempting to fix stuck report: ${reportId}`)
    
    const supabase = createServiceClient()
    
    // Check if report exists and is stuck
    const { data: report, error: reportError } = await supabase
      .from('daily_reports')
      .select('id, report_date, status, generated, url_processing_status, brand_id')
      .eq('id', reportId)
      .single()
    
    if (reportError || !report) {
      return NextResponse.json({
        success: false,
        error: 'Report not found'
      }, { status: 404 })
    }
    
    console.log(`📊 [FIX STUCK REPORT] Report status:`, {
      id: report.id,
      date: report.report_date,
      status: report.status,
      generated: report.generated,
      url_processing_status: report.url_processing_status
    })
    
    // If URL processing hasn't started, trigger it
    if (report.url_processing_status === 'not_started' || report.url_processing_status === 'running') {
      console.log(`🔍 [FIX STUCK REPORT] Starting URL processing for report ${reportId}`)
      
      // Mark as running
      await supabase
        .from('daily_reports')
        .update({ url_processing_status: 'running' })
        .eq('id', reportId)
      
      try {
        // Process URLs
        const urlStats = await processUrlsForDailyReport(reportId)
        console.log(`✅ [FIX STUCK REPORT] URL processing completed:`, urlStats)
        
        // Check if we should mark the report as complete
        const { data: updatedReport } = await supabase
          .from('daily_reports')
          .select('perplexity_status, google_ai_overview_status, url_processing_status')
          .eq('id', reportId)
          .single()
        
        const isComplete = updatedReport?.perplexity_status === 'complete' && 
                          updatedReport?.google_ai_overview_status === 'complete' && 
                          updatedReport?.url_processing_status === 'complete'
        
        if (isComplete) {
          await supabase
            .from('daily_reports')
            .update({
              status: 'completed',
              generated: true,
              completed_at: new Date().toISOString()
            })
            .eq('id', reportId)
          
          console.log(`✅ [FIX STUCK REPORT] Report marked as complete`)
        }
        
        return NextResponse.json({
          success: true,
          message: 'URL processing completed successfully',
          urlStats,
          reportComplete: isComplete
        })
        
      } catch (urlProcessingError) {
        console.error('❌ [FIX STUCK REPORT] URL processing failed:', urlProcessingError)
        
        await supabase
          .from('daily_reports')
          .update({ url_processing_status: 'failed' })
          .eq('id', reportId)
        
        return NextResponse.json({
          success: false,
          error: 'URL processing failed',
          details: urlProcessingError instanceof Error ? urlProcessingError.message : 'Unknown error'
        }, { status: 500 })
      }
    } else {
      return NextResponse.json({
        success: false,
        error: 'Report is not stuck or URL processing already completed',
        currentStatus: report.url_processing_status
      }, { status: 400 })
    }
    
  } catch (error) {
    console.error('❌ [FIX STUCK REPORT] Unexpected error:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
