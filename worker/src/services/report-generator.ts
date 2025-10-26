/**
 * Daily Report Generator Service
 * Main orchestrator for generating daily reports for all brands
 */

import { createServiceClient } from '../lib/supabase-client'
import { processPromptsForBrand } from './prompt-processor'
import { processUrlsForReport } from './url-processor'

interface ReportResult {
  brandId: string
  brandName: string
  status: 'success' | 'failed' | 'skipped'
  reportId?: string
  error?: string
  totalPrompts?: number
  totalMentions?: number
  averagePosition?: number | null
  perplexity?: {
    attempted: number
    ok: number
    noResult: number
    errors: number
  }
  googleAIOverview?: {
    attempted: number
    ok: number
    noResult: number
    errors: number
  }
}

/**
 * Generate daily reports for all eligible brands
 */
export const generateDailyReports = async (): Promise<{
  success: boolean
  processedBrands: number
  results: ReportResult[]
}> => {
  const timestamp = new Date().toISOString()
  console.log(`🚀 [REPORT GENERATOR] Starting daily report generation - Timestamp: ${timestamp}`)
  
  const supabase = createServiceClient()
  
  try {
    // Get test user (for now, limit to test user only)
    const { data: testUser, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('email', 'kk1995current@gmail.com')
      .single()

    if (userError || !testUser) {
      console.log('ℹ️ [REPORT GENERATOR] Test user not found, skipping daily reports')
      return {
        success: true,
        processedBrands: 0,
        results: []
      }
    }

    console.log(`👤 [REPORT GENERATOR] Found test user: ${testUser.id}`)

    // Get brands for test user with active prompts
    const { data: brands, error: brandsError } = await supabase
      .from('brands')
      .select(`
        id, 
        name, 
        owner_user_id,
        onboarding_answers,
        brand_prompts!inner(id)
      `)
      .eq('owner_user_id', testUser.id)
      .eq('onboarding_completed', true)
      .eq('brand_prompts.status', 'active')

    if (brandsError) {
      console.error('❌ [REPORT GENERATOR] Error fetching brands:', brandsError)
      throw new Error(`Failed to fetch brands: ${brandsError.message}`)
    }

    if (!brands || brands.length === 0) {
      console.log('ℹ️ [REPORT GENERATOR] No brands with active prompts found')
      return {
        success: true,
        processedBrands: 0,
        results: []
      }
    }

    console.log(`📊 [REPORT GENERATOR] Found ${brands.length} brands to process:`, brands.map(b => `${b.name} (${b.id})`))

    const results: ReportResult[] = []

    // Process each brand
    for (const brand of brands) {
      try {
        console.log(`\n${'='.repeat(80)}`)
        console.log(`🔄 [REPORT GENERATOR] Processing brand: ${brand.name} (${brand.id})`)
        console.log('='.repeat(80))

        const result = await processBrandReport(brand)
        results.push(result)

        // Add delay between brands to avoid overwhelming APIs
        if (brands.length > 1) {
          console.log('⏳ [REPORT GENERATOR] Waiting 5 seconds before next brand...')
          await new Promise(resolve => setTimeout(resolve, 5000))
        }

      } catch (error) {
        console.error(`❌ [REPORT GENERATOR] Error processing brand ${brand.name}:`, error)
        results.push({
          brandId: brand.id,
          brandName: brand.name,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }

    console.log('\n🎉 [REPORT GENERATOR] Daily reports generation completed')
    console.log(`📈 [REPORT GENERATOR] Final results:`, results)

    return {
      success: true,
      processedBrands: brands.length,
      results
    }

  } catch (error) {
    console.error('❌ [REPORT GENERATOR] Fatal error in daily reports generation:', error)
    return {
      success: false,
      processedBrands: 0,
      results: []
    }
  }
}

/**
 * Process a single brand's daily report
 */
const processBrandReport = async (brand: any): Promise<ReportResult> => {
  const supabase = createServiceClient()
  
  try {
    // Check if report already exists for today
    const today = new Date().toISOString().split('T')[0]
    const { data: existingReport, error: existingReportError } = await supabase
      .from('daily_reports')
      .select('*')
      .eq('brand_id', brand.id)
      .eq('report_date', today)
      .single()

    if (existingReportError && existingReportError.code !== 'PGRST116') {
      throw new Error(`Failed to check existing report: ${existingReportError.message}`)
    }

    let dailyReport: any

    if (existingReport) {
      console.log(`ℹ️ [REPORT GENERATOR] Found existing report for today: ${existingReport.id}`)
      
      // Check completion status
      if (existingReport.generated) {
        console.log(`ℹ️ [REPORT GENERATOR] Report already complete for ${brand.name} today`)
        return {
          brandId: brand.id,
          brandName: brand.name,
          status: 'skipped',
          reportId: existingReport.id
        }
      }

      // Resume incomplete report
      dailyReport = existingReport
      console.log(`🔄 [REPORT GENERATOR] Resuming incomplete report: ${dailyReport.id}`)
      console.log(`📊 [REPORT GENERATOR] Current status - Perplexity: ${dailyReport.perplexity_status}, Google AI Overview: ${dailyReport.google_ai_overview_status}, URL Processing: ${dailyReport.url_processing_status}`)
    } else {
      // Create new daily report record
      const { data: newReport, error: reportError } = await supabase
        .from('daily_reports')
        .insert({
          brand_id: brand.id,
          report_date: today,
          status: 'running',
          total_prompts: 0,
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
          google_ai_overview_no_result: 0,
          urls_total: 0,
          urls_extracted: 0,
          urls_classified: 0
        })
        .select()
        .single()

      if (reportError) {
        throw new Error(`Failed to create daily report: ${reportError.message}`)
      }

      dailyReport = newReport
      console.log('✅ [REPORT GENERATOR] Created new daily report:', dailyReport.id)
    }

    // Process prompts (Perplexity + Google AI Overview)
    const promptResult = await processPromptsForBrand(brand, dailyReport)
    
    // Process URLs (extract content and classify)
    const urlResult = await processUrlsForReport(dailyReport.id)
    
    // Update completion status
    const isComplete = await updateCompletionStatus(dailyReport.id)
    
    // Final summary
    console.log(`📊 [REPORT GENERATOR] Final Summary for ${brand.name}:`)
    console.log(`  Perplexity: ${promptResult.perplexity.attempted} attempted, ${promptResult.perplexity.ok} ok, ${promptResult.perplexity.noResult} no result, ${promptResult.perplexity.errors} errors`)
    console.log(`  Google AI Overview: ${promptResult.googleAIOverview.attempted} attempted, ${promptResult.googleAIOverview.ok} ok, ${promptResult.googleAIOverview.noResult} no result, ${promptResult.googleAIOverview.errors} errors`)
    console.log(`  URL Processing: ${urlResult.totalUrls} total, ${urlResult.extractedUrls} extracted, ${urlResult.classifiedUrls} classified`)
    console.log(`  Report Status: ${isComplete ? 'COMPLETE' : 'INCOMPLETE'}`)

    return {
      brandId: brand.id,
      brandName: brand.name,
      status: isComplete ? 'success' : 'failed',
      reportId: dailyReport.id,
      totalPrompts: promptResult.totalPrompts,
      totalMentions: promptResult.totalMentions,
      averagePosition: promptResult.averagePosition,
      perplexity: promptResult.perplexity,
      googleAIOverview: promptResult.googleAIOverview
    }

  } catch (error) {
    console.error(`❌ [REPORT GENERATOR] Error processing brand ${brand.name}:`, error)
    throw error
  }
}

/**
 * Update daily report completion status
 */
const updateCompletionStatus = async (dailyReportId: string): Promise<boolean> => {
  const supabase = createServiceClient()
  
  console.log(`🔍 [COMPLETION] Checking completion status for report ${dailyReportId}`)
  
  const { data: report, error } = await supabase
    .from('daily_reports')
    .select('perplexity_status, google_ai_overview_status, url_processing_status, report_date')
    .eq('id', dailyReportId)
    .single()

  if (error || !report) {
    console.error('❌ [COMPLETION] Error fetching report status:', error)
    return false
  }

  const today = new Date().toISOString().split('T')[0]
  const reportDate = report.report_date
  
  // Check if all phases are complete
  const isPerplexityComplete = report.perplexity_status === 'complete'
  const isGoogleComplete = reportDate < today 
    ? ['expired', 'skipped', 'complete', 'failed'].includes(report.google_ai_overview_status)
    : ['complete', 'failed'].includes(report.google_ai_overview_status)
  const isUrlProcessingComplete = report.url_processing_status === 'complete'
  
  console.log(`🔍 [COMPLETION] Status checks:`, {
    isPerplexityComplete,
    isGoogleComplete,
    isUrlProcessingComplete,
    reportDate,
    today
  })
  
  // Report is complete when ALL THREE phases are complete
  const shouldMarkComplete = isPerplexityComplete && isGoogleComplete && isUrlProcessingComplete
  
  const { error: updateError } = await supabase
    .from('daily_reports')
    .update({
      generated: shouldMarkComplete,
      status: shouldMarkComplete ? 'completed' : 'running',
      completed_at: shouldMarkComplete ? new Date().toISOString() : null
    })
    .eq('id', dailyReportId)

  if (updateError) {
    console.error('❌ [COMPLETION] Error updating completion status:', updateError)
    return false
  }
  
  console.log(`✅ [COMPLETION] Report marked as ${shouldMarkComplete ? 'complete' : 'incomplete'}`)
  return shouldMarkComplete
}


