import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Check the status of a daily report
 * Used by the frontend to poll for completion
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const reportId = searchParams.get('reportId')
    
    if (!reportId) {
      return NextResponse.json({
        success: false,
        error: 'Report ID is required'
      }, { status: 400 })
    }
    
    console.log(`🔍 [STATUS CHECK] Checking status for report ${reportId}`)
    
    const supabase = createServiceClient()
    
    // Get report status
    const { data: report, error: reportError } = await supabase
      .from('daily_reports')
      .select(`
        id,
        status,
        generated,
        processing_stage,
        perplexity_status,
        google_ai_overview_status,
        url_processing_status,
        total_mentions,
        urls_total,
        urls_classified,
        created_at,
        completed_at
      `)
      .eq('id', reportId)
      .single()

    if (reportError || !report) {
      console.error('❌ [STATUS CHECK] Error fetching report:', reportError)
      return NextResponse.json({
        success: false,
        error: 'Report not found'
      }, { status: 404 })
    }

    // Get current job status
    const { data: currentJob, error: jobError } = await supabase
      .from('report_processing_jobs')
      .select('id, stage, status, attempts, error_message')
      .eq('daily_report_id', reportId)
      .eq('status', 'running')
      .single()

    // Determine completion status
    const isCompleted = report.generated && report.status === 'completed'
    const isFailed = report.processing_stage === 'failed' || 
                    (report.perplexity_status === 'failed' && report.google_ai_overview_status === 'failed' && report.url_processing_status === 'failed')
    
    // Get processing progress
    const stages = [
      { name: 'perplexity', status: report.perplexity_status, label: 'Perplexity Analysis' },
      { name: 'google_ai_overview', status: report.google_ai_overview_status, label: 'Google AI Overview' },
      { name: 'url_processing', status: report.url_processing_status, label: 'URL Processing' }
    ]
    
    const completedStages = stages.filter(s => s.status === 'complete').length
    const totalStages = stages.length
    const progressPercentage = Math.round((completedStages / totalStages) * 100)
    
    // Get current stage info
    const currentStage = stages.find(s => s.status === 'running') || 
                        stages.find(s => s.status === 'not_started') ||
                        stages[0]
    
    console.log(`📊 [STATUS CHECK] Report ${reportId} - Stage: ${report.processing_stage}, Progress: ${progressPercentage}%, Completed: ${isCompleted}, Failed: ${isFailed}`)

    return NextResponse.json({
      success: true,
      reportId: report.id,
      completed: isCompleted,
      failed: isFailed,
      processing_stage: report.processing_stage,
      progress: {
        percentage: progressPercentage,
        completedStages,
        totalStages,
        currentStage: currentStage?.label || 'Unknown',
        stages
      },
      stats: {
        totalMentions: report.total_mentions,
        urlsTotal: report.urls_total,
        urlsClassified: report.urls_classified
      },
      currentJob: currentJob ? {
        id: currentJob.id,
        stage: currentJob.stage,
        status: currentJob.status,
        attempts: currentJob.attempts,
        error: currentJob.error_message
      } : null,
      timestamps: {
        created: report.created_at,
        completed: report.completed_at
      }
    })

  } catch (error) {
    console.error('❌ [STATUS CHECK] Unexpected error:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
