import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Delete today's report for a specific brand
 * This allows testing the new staged processing system repeatedly
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const brandId = searchParams.get('brandId')
    
    if (!brandId) {
      return NextResponse.json({
        success: false,
        error: 'Brand ID is required'
      }, { status: 400 })
    }
    
    console.log(`🗑️ [DELETE REPORT] Deleting today's report for brand: ${brandId}`)
    
    // Use service client to bypass RLS for admin operations
    const supabase = createServiceClient()
    
    // Get today's date
    const today = new Date().toISOString().split('T')[0]
    
    // Find today's report
    const { data: report, error: reportError } = await supabase
      .from('daily_reports')
      .select('id, brand_id, report_date, status, generated')
      .eq('brand_id', brandId)
      .eq('report_date', today)
      .single()

    if (reportError && reportError.code !== 'PGRST116') {
      console.error('❌ [DELETE REPORT] Error fetching report:', reportError)
      return NextResponse.json({
        success: false,
        error: 'Failed to fetch report'
      }, { status: 500 })
    }

    if (!report) {
      console.log(`ℹ️ [DELETE REPORT] No report found for today (${today})`)
      return NextResponse.json({
        success: true,
        message: 'No report found for today',
        deleted: false
      })
    }

    console.log(`📊 [DELETE REPORT] Found report: ${report.id} (Status: ${report.status}, Generated: ${report.generated})`)

    // Delete in order to respect foreign key constraints
    try {
      // 1. Delete processing jobs first
      const { error: jobsError } = await supabase
        .from('report_processing_jobs')
        .delete()
        .eq('daily_report_id', report.id)

      if (jobsError) {
        console.error('❌ [DELETE REPORT] Error deleting processing jobs:', jobsError)
      } else {
        console.log('✅ [DELETE REPORT] Deleted processing jobs')
      }

      // 2. Delete URL citations
      const { error: citationsError } = await supabase
        .from('url_citations')
        .delete()
        .eq('prompt_result_id', 
          supabase.from('prompt_results')
            .select('id')
            .eq('daily_report_id', report.id)
        )

      if (citationsError) {
        console.error('❌ [DELETE REPORT] Error deleting URL citations:', citationsError)
      } else {
        console.log('✅ [DELETE REPORT] Deleted URL citations')
      }

      // 3. Delete prompt results
      const { error: resultsError } = await supabase
        .from('prompt_results')
        .delete()
        .eq('daily_report_id', report.id)

      if (resultsError) {
        console.error('❌ [DELETE REPORT] Error deleting prompt results:', resultsError)
      } else {
        console.log('✅ [DELETE REPORT] Deleted prompt results')
      }

      // 4. Delete URL content facts for URLs that were only cited in this report
      const { error: contentFactsError } = await supabase
        .from('url_content_facts')
        .delete()
        .eq('url_id', 
          supabase.from('url_inventory')
            .select('id')
            .eq('id', 
              supabase.from('url_citations')
                .select('url_id')
                .eq('prompt_result_id', 
                  supabase.from('prompt_results')
                    .select('id')
                    .eq('daily_report_id', report.id)
                )
            )
        )

      if (contentFactsError) {
        console.error('❌ [DELETE REPORT] Error deleting URL content facts:', contentFactsError)
      } else {
        console.log('✅ [DELETE REPORT] Deleted URL content facts')
      }

      // 5. Delete URLs that were only cited in this report
      const { error: urlsError } = await supabase
        .from('url_inventory')
        .delete()
        .eq('id', 
          supabase.from('url_citations')
            .select('url_id')
            .eq('prompt_result_id', 
              supabase.from('prompt_results')
                .select('id')
                .eq('daily_report_id', report.id)
            )
        )

      if (urlsError) {
        console.error('❌ [DELETE REPORT] Error deleting URLs:', urlsError)
      } else {
        console.log('✅ [DELETE REPORT] Deleted URLs')
      }

      // 6. Finally, delete the daily report
      const { error: reportDeleteError } = await supabase
        .from('daily_reports')
        .delete()
        .eq('id', report.id)

      if (reportDeleteError) {
        console.error('❌ [DELETE REPORT] Error deleting daily report:', reportDeleteError)
        return NextResponse.json({
          success: false,
          error: 'Failed to delete daily report'
        }, { status: 500 })
      }

      console.log(`✅ [DELETE REPORT] Successfully deleted report ${report.id} for brand ${brandId}`)

      return NextResponse.json({
        success: true,
        message: 'Today\'s report deleted successfully',
        deleted: true,
        reportId: report.id,
        reportDate: today
      })

    } catch (deleteError) {
      console.error('❌ [DELETE REPORT] Error during deletion:', deleteError)
      return NextResponse.json({
        success: false,
        error: 'Failed to delete report and related data',
        details: deleteError instanceof Error ? deleteError.message : 'Unknown error'
      }, { status: 500 })
    }

  } catch (error) {
    console.error('❌ [DELETE REPORT] Unexpected error:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
