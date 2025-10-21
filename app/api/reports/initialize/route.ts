import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Background processing function for staged report generation
 * This runs without the need for frequent cron jobs (Hobby plan compatible)
 */
async function processReportStages(dailyReportId: string, processingData: any) {
  try {
    console.log(`🚀 [BACKGROUND PROCESSOR] Starting staged processing for report ${dailyReportId}`)
    
    const supabase = createServiceClient()
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    
    // Stage 1: Perplexity Processing
    console.log(`📊 [BACKGROUND PROCESSOR] Stage 1: Perplexity processing`)
    const perplexityResponse = await fetch(`${baseUrl}/api/reports/process-perplexity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dailyReportId,
        jobId: 'background-' + Date.now(),
        processingData
      })
    })
    
    if (!perplexityResponse.ok) {
      throw new Error('Perplexity processing failed')
    }
    
    // Stage 2: Google AI Overview Processing
    console.log(`📊 [BACKGROUND PROCESSOR] Stage 2: Google AI Overview processing`)
    const googleResponse = await fetch(`${baseUrl}/api/reports/process-google-ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dailyReportId,
        jobId: 'background-' + Date.now(),
        processingData
      })
    })
    
    if (!googleResponse.ok) {
      throw new Error('Google AI Overview processing failed')
    }
    
    // Stage 3: URL Processing
    console.log(`📊 [BACKGROUND PROCESSOR] Stage 3: URL processing`)
    const urlResponse = await fetch(`${baseUrl}/api/reports/process-urls`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dailyReportId,
        jobId: 'background-' + Date.now(),
        processingData
      })
    })
    
    if (!urlResponse.ok) {
      throw new Error('URL processing failed')
    }
    
    console.log(`✅ [BACKGROUND PROCESSOR] All stages completed for report ${dailyReportId}`)
    
  } catch (error) {
    console.error(`❌ [BACKGROUND PROCESSOR] Error processing report ${dailyReportId}:`, error)
    
    // Mark report as failed
    const supabase = createServiceClient()
    await supabase
      .from('daily_reports')
      .update({
        status: 'failed',
        processing_stage: 'failed'
      })
      .eq('id', dailyReportId)
  }
}

/**
 * Initialize a new daily report and queue the first processing job
 * This is the entry point for both manual and cron-triggered reports
 */
export async function POST(request: NextRequest) {
  try {
    const { brandId, manual = false, fromCron = false } = await request.json()
    
    console.log('🚀 [REPORT INIT] Starting report initialization for brand:', brandId, 'Manual:', manual, 'From Cron:', fromCron)
    
    // Use service client for cron jobs (bypasses RLS), regular client for manual calls
    const supabase = fromCron ? createServiceClient() : createClient()
    let user = null
    
    if (!fromCron) {
      // For manual calls, require authentication
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()
      
      if (authError || !authUser) {
        return NextResponse.json({
          success: false,
          error: 'Unauthorized'
        }, { status: 401 })
      }
      user = authUser
    }

    // For manual reports, only allow test user
    if (manual && user && user.email !== 'kk1995current@gmail.com') {
      return NextResponse.json({
        success: false,
        error: 'Manual reports only available for test user'
      }, { status: 403 })
    }

    // Get brand and verify ownership
    const { data: brand, error: brandError } = await supabase
      .from('brands')
      .select('id, name, owner_user_id, onboarding_answers')
      .eq('id', brandId)
      .single()

    if (brandError || !brand) {
      console.error('❌ [REPORT INIT] Brand not found:', brandError)
      return NextResponse.json({
        success: false,
        error: 'Brand not found'
      }, { status: 404 })
    }

    // Skip ownership check for cron jobs
    if (!fromCron && user && brand.owner_user_id !== user.id) {
      return NextResponse.json({
        success: false,
        error: 'Brand access denied'
      }, { status: 403 })
    }

    // Get active prompts for this brand
    const { data: activePrompts, error: promptsError } = await supabase
      .from('brand_prompts')
      .select('id, raw_prompt, improved_prompt, source_template_code, category')
      .eq('brand_id', brandId)
      .eq('status', 'active')

    if (promptsError) {
      console.error('❌ [REPORT INIT] Error fetching prompts:', promptsError)
      return NextResponse.json({
        success: false,
        error: 'Failed to fetch active prompts'
      }, { status: 500 })
    }

    if (!activePrompts || activePrompts.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No active prompts found for this brand'
      }, { status: 400 })
    }

    console.log(`📊 [REPORT INIT] Found ${activePrompts.length} active prompts for brand: ${brand.name}`)

    // Check if report already exists for today
    const today = new Date().toISOString().split('T')[0]
    let { data: existingReport, error: existingReportError } = await supabase
      .from('daily_reports')
      .select('*')
      .eq('brand_id', brandId)
      .eq('report_date', today)
      .single()

    let dailyReport: any

    if (existingReportError && existingReportError.code !== 'PGRST116') {
      // Error other than "not found"
      console.error('❌ [REPORT INIT] Error checking existing report:', existingReportError)
      return NextResponse.json({
        success: false,
        error: 'Failed to check existing reports'
      }, { status: 500 })
    }

    if (existingReport) {
      console.log(`ℹ️ [REPORT INIT] Found existing report for today: ${existingReport.id}`)
      
      // Check if report is already complete
      if (existingReport.generated && existingReport.processing_stage === 'completed') {
        console.log(`ℹ️ [REPORT INIT] Report already complete for ${brand.name} today`)
        return NextResponse.json({
          success: true,
          message: 'Report already complete for today',
          reportId: existingReport.id,
          generated: true
        })
      }

      // Resume incomplete report
      dailyReport = existingReport
      console.log(`🔄 [REPORT INIT] Resuming incomplete report: ${dailyReport.id}`)
      console.log(`📊 [REPORT INIT] Current processing stage: ${dailyReport.processing_stage}`)
    } else {
      // Create new daily report record
      const { data: newReport, error: reportError } = await supabase
        .from('daily_reports')
        .insert({
          brand_id: brandId,
          report_date: today,
          status: 'running',
          processing_stage: 'initialized',
          total_prompts: activePrompts.length,
          completed_prompts: 0,
          total_mentions: 0,
          generated: false,
          perplexity_status: 'not_started',
          google_ai_overview_status: 'not_started',
          url_processing_status: 'not_started',
          perplexity_attempted: 0,
          perplexity_ok: 0,
          perplexity_no_result: 0,
          google_ai_overview_attempted: 0,
          google_ai_overview_ok: 0,
          google_ai_overview_no_result: 0
        })
        .select()
        .single()

      if (reportError) {
        console.error('❌ [REPORT INIT] Error creating report:', reportError)
        return NextResponse.json({
          success: false,
          error: 'Failed to create daily report'
        }, { status: 500 })
      }

      dailyReport = newReport
      console.log('✅ [REPORT INIT] Created new daily report:', dailyReport.id)
    }

    // For Hobby plan compatibility, start processing immediately instead of queuing jobs
    console.log(`✅ [REPORT INIT] Starting immediate processing for ${brand.name}`)
    
    // Update daily report to show processing has started
    await supabase
      .from('daily_reports')
      .update({
        processing_stage: 'perplexity',
        perplexity_status: 'running'
      })
      .eq('id', dailyReport.id)

    // Start processing in background (non-blocking)
    processReportStages(dailyReport.id, {
      brand_name: brand.name,
      competitors: (brand.onboarding_answers as any)?.competitors || [],
      total_prompts: activePrompts.length
    }).catch(error => {
      console.error('❌ [REPORT INIT] Background processing error:', error)
    })

    console.log(`✅ [REPORT INIT] Report initialization complete for ${brand.name}`)

    return NextResponse.json({
      success: true,
      message: 'Report initialization complete - processing started in background',
      reportId: dailyReport.id,
      stage: 'perplexity',
      totalPrompts: activePrompts.length
    })

  } catch (error) {
    console.error('❌ [REPORT INIT] Unexpected error:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
