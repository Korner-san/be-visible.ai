import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Background job processor that runs every 2 minutes
 * Picks up pending jobs from the queue and processes them
 */
export async function GET(request: NextRequest) {
  try {
    console.log('🔄 [JOB PROCESSOR] Starting job processor check...')
    
    const supabase = createServiceClient()
    
    // Get pending jobs that are ready to be processed
    const { data: pendingJobs, error: jobsError } = await supabase
      .from('report_processing_jobs')
      .select(`
        id,
        daily_report_id,
        stage,
        status,
        attempts,
        max_attempts,
        processing_data,
        daily_reports!inner(
          id,
          brand_id,
          processing_stage,
          brands!inner(
            id,
            name,
            onboarding_answers
          )
        )
      `)
      .eq('status', 'pending')
      .lte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(5) // Process up to 5 jobs at a time

    if (jobsError) {
      console.error('❌ [JOB PROCESSOR] Error fetching pending jobs:', jobsError)
      return NextResponse.json({
        success: false,
        error: 'Failed to fetch pending jobs'
      }, { status: 500 })
    }

    if (!pendingJobs || pendingJobs.length === 0) {
      console.log('ℹ️ [JOB PROCESSOR] No pending jobs found')
      return NextResponse.json({
        success: true,
        message: 'No pending jobs',
        processedJobs: 0
      })
    }

    console.log(`📋 [JOB PROCESSOR] Found ${pendingJobs.length} pending jobs`)

    const results = []

    // Process each job
    for (const job of pendingJobs) {
      try {
        console.log(`🚀 [JOB PROCESSOR] Processing job ${job.id} (${job.stage}) for report ${job.daily_report_id}`)
        
        // Mark job as running
        await supabase
          .from('report_processing_jobs')
          .update({
            status: 'running',
            started_at: new Date().toISOString(),
            attempts: job.attempts + 1
          })
          .eq('id', job.id)

        // Update daily report current job
        await supabase
          .from('daily_reports')
          .update({
            current_job_id: job.id,
            processing_stage: job.stage
          })
          .eq('id', job.daily_report_id)

        // Route to appropriate processing function
        let processingResult
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
        
        if (job.stage === 'perplexity') {
          const response = await fetch(`${baseUrl}/api/reports/process-perplexity`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              dailyReportId: job.daily_report_id,
              jobId: job.id,
              processingData: job.processing_data
            })
          })
          processingResult = await response.json()
        } else if (job.stage === 'google_ai_overview') {
          const response = await fetch(`${baseUrl}/api/reports/process-google-ai`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              dailyReportId: job.daily_report_id,
              jobId: job.id,
              processingData: job.processing_data
            })
          })
          processingResult = await response.json()
        } else if (job.stage === 'url_processing') {
          const response = await fetch(`${baseUrl}/api/reports/process-urls`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              dailyReportId: job.daily_report_id,
              jobId: job.id,
              processingData: job.processing_data
            })
          })
          processingResult = await response.json()
        }

        if (processingResult && processingResult.success) {
          // Mark job as completed
          await supabase
            .from('report_processing_jobs')
            .update({
              status: 'completed',
              completed_at: new Date().toISOString()
            })
            .eq('id', job.id)

          // Update daily report stage
          const nextStage = getNextStage(job.stage)
          await supabase
            .from('daily_reports')
            .update({
              processing_stage: nextStage,
              current_job_id: null
            })
            .eq('id', job.daily_report_id)

          // Queue next stage if not completed
          if (nextStage !== 'completed') {
            await queueNextJob(supabase, job.daily_report_id, nextStage, job.processing_data)
          } else {
            // Mark report as complete
            await supabase
              .from('daily_reports')
              .update({
                status: 'completed',
                generated: true,
                completed_at: new Date().toISOString(),
                processing_stage: 'completed'
              })
              .eq('id', job.daily_report_id)
          }

          console.log(`✅ [JOB PROCESSOR] Job ${job.id} completed successfully`)
          results.push({
            jobId: job.id,
            stage: job.stage,
            status: 'completed',
            nextStage
          })
        } else {
          // Mark job as failed
          await supabase
            .from('report_processing_jobs')
            .update({
              status: 'failed',
              error_message: processingResult?.error || 'Unknown processing error'
            })
            .eq('id', job.id)

          console.log(`❌ [JOB PROCESSOR] Job ${job.id} failed:`, processingResult?.error)
          results.push({
            jobId: job.id,
            stage: job.stage,
            status: 'failed',
            error: processingResult?.error
          })
        }

      } catch (error) {
        console.error(`❌ [JOB PROCESSOR] Error processing job ${job.id}:`, error)
        
        // Mark job as failed
        await supabase
          .from('report_processing_jobs')
          .update({
            status: 'failed',
            error_message: error instanceof Error ? error.message : 'Unknown error'
          })
          .eq('id', job.id)

        results.push({
          jobId: job.id,
          stage: job.stage,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }

    console.log(`🎉 [JOB PROCESSOR] Processed ${results.length} jobs`)
    console.log(`📈 [JOB PROCESSOR] Results:`, results)

    return NextResponse.json({
      success: true,
      message: `Processed ${results.length} jobs`,
      processedJobs: results.length,
      results
    })

  } catch (error) {
    console.error('❌ [JOB PROCESSOR] Unexpected error:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

/**
 * Get the next processing stage
 */
function getNextStage(currentStage: string): string {
  switch (currentStage) {
    case 'perplexity':
      return 'google_ai_overview'
    case 'google_ai_overview':
      return 'url_processing'
    case 'url_processing':
      return 'completed'
    default:
      return 'completed'
  }
}

/**
 * Queue the next processing job
 */
async function queueNextJob(supabase: any, dailyReportId: string, nextStage: string, processingData: any) {
  const { data: job, error: jobError } = await supabase
    .from('report_processing_jobs')
    .insert({
      daily_report_id: dailyReportId,
      stage: nextStage,
      status: 'pending',
      processing_data: processingData
    })
    .select()
    .single()

  if (jobError) {
    console.error(`❌ [JOB PROCESSOR] Error queuing next job for stage ${nextStage}:`, jobError)
  } else {
    console.log(`✅ [JOB PROCESSOR] Queued next job for stage ${nextStage}: ${job.id}`)
  }
}
