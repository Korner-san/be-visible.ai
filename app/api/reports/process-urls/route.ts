import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { processUrlsForDailyReport } from '@/lib/services/url-classification-service'

/**
 * Process URL extraction and classification stage for a daily report
 * This is called by the background job processor
 */
export async function POST(request: NextRequest) {
  try {
    const { dailyReportId, jobId, processingData } = await request.json()
    
    console.log(`🚀 [URL PROCESSING] Starting URL processing for report ${dailyReportId}`)
    
    const supabase = createServiceClient()
    
    // Update report status
    await supabase
      .from('daily_reports')
      .update({
        url_processing_status: 'running',
        processing_stage: 'url_processing'
      })
      .eq('id', dailyReportId)

    try {
      // Process URLs (extract content and classify)
      console.log(`🔍 [URL PROCESSING] Calling processUrlsForDailyReport for report ${dailyReportId}`)
      const urlStats = await processUrlsForDailyReport(dailyReportId)
      console.log(`✅ [URL PROCESSING] Processed URLs:`, urlStats)
      
      // Update report with URL processing results
      await supabase
        .from('daily_reports')
        .update({
          url_processing_status: 'complete',
          urls_total: urlStats.totalUrls,
          urls_extracted: urlStats.extractedUrls,
          urls_classified: urlStats.classifiedUrls,
          processing_stage: 'completed'
        })
        .eq('id', dailyReportId)

      // Mark report as complete
      await supabase
        .from('daily_reports')
        .update({
          status: 'completed',
          generated: true,
          completed_at: new Date().toISOString(),
          processing_stage: 'completed'
        })
        .eq('id', dailyReportId)

      console.log(`✅ [URL PROCESSING] URL processing complete for report ${dailyReportId}`)
      console.log(`🎉 [URL PROCESSING] Report ${dailyReportId} marked as complete`)

      return NextResponse.json({
        success: true,
        message: 'URL processing completed',
        reportId: dailyReportId,
        jobId,
        stats: {
          totalUrls: urlStats.totalUrls,
          newUrls: urlStats.newUrls,
          extractedUrls: urlStats.extractedUrls,
          classifiedUrls: urlStats.classifiedUrls,
          domainHomepagesProcessed: urlStats.domainHomepagesProcessed || 0,
          domainHomepagesCategorized: urlStats.domainHomepagesCategorized || 0
        }
      })

    } catch (urlProcessingError) {
      console.error('❌ [URL PROCESSING] Error during URL processing:', urlProcessingError)
      console.error('❌ [URL PROCESSING] Error details:', {
        message: urlProcessingError instanceof Error ? urlProcessingError.message : 'Unknown error',
        stack: urlProcessingError instanceof Error ? urlProcessingError.stack : undefined
      })
      
      // Mark URL processing as failed in database
      await supabase
        .from('daily_reports')
        .update({ 
          url_processing_status: 'failed',
          urls_total: 0,
          urls_classified: 0,
          processing_stage: 'failed'
        })
        .eq('id', dailyReportId)
      
      return NextResponse.json({
        success: false,
        error: 'URL processing failed',
        details: urlProcessingError instanceof Error ? urlProcessingError.message : 'Unknown error'
      }, { status: 500 })
    }

  } catch (error) {
    console.error('❌ [URL PROCESSING] Unexpected error:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
