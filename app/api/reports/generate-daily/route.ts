import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { callPerplexityAPI, extractPerplexityContent, extractPerplexityCitations } from '@/lib/providers/perplexity'
import { callGoogleAIOverviewAPI, extractGoogleContent, extractGoogleCitations, hasGoogleResults } from '@/lib/providers/google-ai-overview'
import { processUrlsForDailyReport } from '@/lib/services/url-classification-service'

// Types imported from provider clients

interface BrandMentionAnalysis {
  mentioned: boolean
  mentionCount: number
  position: number
  sentiment: number
  competitorMentions: Array<{name: string, count: number, portrayalType: string, position: number}>
}

// Sentiment analysis using simple keyword matching
const analyzeSentiment = (text: string, brandName: string): number => {
  const positiveWords = ['excellent', 'great', 'amazing', 'outstanding', 'superior', 'best', 'leading', 'innovative', 'reliable', 'trusted', 'quality', 'effective', 'successful', 'popular', 'recommended']
  const negativeWords = ['poor', 'bad', 'terrible', 'awful', 'inferior', 'worst', 'failing', 'unreliable', 'problematic', 'disappointing', 'ineffective', 'unsuccessful', 'criticized']
  
  const brandContext = text.toLowerCase()
  const brandIndex = brandContext.indexOf(brandName.toLowerCase())
  
  if (brandIndex === -1) return 0
  
  // Get context around brand mention (100 chars before/after)
  const contextStart = Math.max(0, brandIndex - 100)
  const contextEnd = Math.min(brandContext.length, brandIndex + brandName.length + 100)
  const context = brandContext.substring(contextStart, contextEnd)
  
  let score = 0
  positiveWords.forEach(word => {
    if (context.includes(word)) score += 0.1
  })
  negativeWords.forEach(word => {
    if (context.includes(word)) score -= 0.1
  })
  
  return Math.max(-1, Math.min(1, score))
}

// Analyze brand mentions in response
const analyzeBrandMention = (text: string, brandName: string, competitors: string[]): BrandMentionAnalysis => {
  const lowerText = text.toLowerCase()
  const lowerBrand = brandName.toLowerCase()
  
  // Find all brand mentions
  const brandMentions: number[] = []
  let index = lowerText.indexOf(lowerBrand)
  while (index !== -1) {
    brandMentions.push(index)
    index = lowerText.indexOf(lowerBrand, index + 1)
  }
  
  const mentioned = brandMentions.length > 0
  const firstMentionIndex = mentioned ? brandMentions[0] : -1
  
  // Find competitor mentions with positions
  const competitorMentions = competitors.map(competitor => {
    const competitorPositions: number[] = []
    const lowerCompetitor = competitor.toLowerCase()
    let compIndex = lowerText.indexOf(lowerCompetitor)
    while (compIndex !== -1) {
      competitorPositions.push(compIndex)
      compIndex = lowerText.indexOf(lowerCompetitor, compIndex + 1)
    }
    
    return {
        name: competitor,
      count: competitorPositions.length,
      position: competitorPositions.length > 0 ? competitorPositions[0] : -1, // First mention position
      portrayalType: 'neutral' // Will be classified by LLM later
    }
  }).filter(comp => comp.count > 0)
  
  return {
    mentioned,
    mentionCount: brandMentions.length,
    position: firstMentionIndex,
    sentiment: mentioned ? analyzeSentiment(text, brandName) : 0,
    competitorMentions
  }
}

// Provider API functions now imported from /lib/providers/

// Process prompts for a specific provider
const processProviderPrompts = async (
  supabase: any,
  dailyReportId: string,
  activePrompts: any[],
  brandName: string,
  competitors: string[],
  provider: 'perplexity' | 'google_ai_overview'
): Promise<{
  attempted: number
  ok: number
  noResult: number
  errors: number
}> => {
  let attempted = 0
  let ok = 0
  let noResult = 0
  let errors = 0

  console.log(`🚀 [${provider.toUpperCase()}] Starting ${provider} pass with ${activePrompts.length} prompts`)

  for (let i = 0; i < activePrompts.length; i++) {
    const prompt = activePrompts[i]
    const promptText = prompt.improved_prompt || prompt.raw_prompt
    
    console.log(`🤖 [${provider.toUpperCase()}] Processing prompt ${i + 1}/${activePrompts.length}: ${prompt.source_template_code}`)

    attempted++
    
    try {
      let responseContent = ''
      let responseTimeMs = 0
      let citations: any[] = []
      let providerError = null

      if (provider === 'perplexity') {
        const perplexityResponse = await callPerplexityAPI(promptText)
        responseContent = extractPerplexityContent(perplexityResponse)
        responseTimeMs = perplexityResponse.response_time_ms || 0
        citations = extractPerplexityCitations(perplexityResponse)
      } else if (provider === 'google_ai_overview') {
        const googleResponse = await callGoogleAIOverviewAPI(promptText)
        if (hasGoogleResults(googleResponse)) {
          responseContent = extractGoogleContent(googleResponse)
          responseTimeMs = googleResponse.response_time_ms || 0
          citations = extractGoogleCitations(googleResponse)
        } else {
          // No results from Google AI Overview
          noResult++
          providerError = 'No search results found'
        }
      }

      if (responseContent) {
        // Analyze brand mentions (basic analysis only - no portrayal classification)
        const analysis = analyzeBrandMention(responseContent, brandName, competitors)

        // Save prompt result with provider-specific data
        const resultData: any = {
          daily_report_id: dailyReportId,
          brand_prompt_id: prompt.id,
          prompt_text: promptText,
          provider: provider,
          provider_status: 'ok',
          brand_mentioned: analysis.mentioned,
          brand_position: analysis.mentioned ? analysis.position : null,
          competitor_mentions: analysis.competitorMentions,
          sentiment_score: analysis.sentiment,
          portrayal_type: null, // Will be set by LLM classification
          classifier_stage: null, // Will be set by LLM classification
          classifier_version: null,
          snippet_hash: null,
          portrayal_confidence: null,
          created_at: new Date().toISOString()
        }

        // Add provider-specific fields
        if (provider === 'perplexity') {
          resultData.perplexity_response = responseContent
          resultData.response_time_ms = responseTimeMs
          resultData.citations = citations
        } else if (provider === 'google_ai_overview') {
          resultData.google_ai_overview_response = responseContent
          resultData.google_ai_overview_response_time_ms = responseTimeMs
          resultData.google_ai_overview_citations = citations
        }

        // Upsert the result (idempotent)
        const { error: upsertError } = await supabase
          .from('prompt_results')
          .upsert(resultData, {
            onConflict: 'daily_report_id,brand_prompt_id,provider'
          })

        if (upsertError) {
          console.error(`❌ [${provider.toUpperCase()}] Error upserting result for prompt ${i + 1}:`, upsertError)
          errors++
        } else {
          ok++
          console.log(`✅ [${provider.toUpperCase()}] Success for prompt ${i + 1}, response length: ${responseContent.length}`)
        }
      } else if (providerError) {
        // Save no-result record
        const { error: upsertError } = await supabase
          .from('prompt_results')
          .upsert({
            daily_report_id: dailyReportId,
            brand_prompt_id: prompt.id,
            prompt_text: promptText,
            provider: provider,
            provider_status: 'no_result',
            provider_error_message: providerError,
            brand_mentioned: false,
            competitor_mentions: [],
            sentiment_score: 0,
            portrayal_type: null,
            classifier_stage: null,
            created_at: new Date().toISOString()
          }, {
            onConflict: 'daily_report_id,brand_prompt_id,provider'
          })

        if (upsertError) {
          console.error(`❌ [${provider.toUpperCase()}] Error saving no-result for prompt ${i + 1}:`, upsertError)
          errors++
        }
      }

    } catch (error) {
      console.error(`❌ [${provider.toUpperCase()}] Error for prompt ${i + 1}:`, error)
      
      // Save error record
      const { error: upsertError } = await supabase
        .from('prompt_results')
        .upsert({
          daily_report_id: dailyReportId,
          brand_prompt_id: prompt.id,
          prompt_text: promptText,
          provider: provider,
          provider_status: 'error',
          provider_error_message: (error as Error).message,
          brand_mentioned: false,
          competitor_mentions: [],
          sentiment_score: 0,
          portrayal_type: null,
          classifier_stage: null,
          created_at: new Date().toISOString()
        }, {
          onConflict: 'daily_report_id,brand_prompt_id,provider'
        })

      if (upsertError) {
        console.error(`❌ [${provider.toUpperCase()}] Error saving error record for prompt ${i + 1}:`, upsertError)
      }
      
      errors++
    }
  }

  console.log(`📊 [${provider.toUpperCase()}] Pass completed - Attempted: ${attempted}, OK: ${ok}, No Result: ${noResult}, Errors: ${errors}`)
  
  return { attempted, ok, noResult, errors }
}

// Update daily report provider status
const updateProviderStatus = async (
  supabase: any,
  dailyReportId: string,
  provider: 'perplexity' | 'google_ai_overview',
  status: 'not_started' | 'running' | 'complete' | 'failed',
  counts?: { attempted: number; ok: number; noResult: number; errors: number }
) => {
  const updateData: any = {}
  
  if (provider === 'perplexity') {
    updateData.perplexity_status = status
    if (counts) {
      updateData.perplexity_attempted = counts.attempted
      updateData.perplexity_ok = counts.ok
      updateData.perplexity_no_result = counts.noResult
    }
  } else if (provider === 'google_ai_overview') {
    updateData.google_ai_overview_status = status
    if (counts) {
      updateData.google_ai_overview_attempted = counts.attempted
      updateData.google_ai_overview_ok = counts.ok
      updateData.google_ai_overview_no_result = counts.noResult
    }
  }

  const { error } = await supabase
    .from('daily_reports')
    .update(updateData)
    .eq('id', dailyReportId)

  if (error) {
    console.error(`❌ [${provider.toUpperCase()}] Error updating status:`, error)
  } else {
    console.log(`✅ [${provider.toUpperCase()}] Status updated to: ${status}`)
  }
}

// Check if daily report is complete (Perplexity-only rule)
const isDailyReportComplete = async (supabase: any, dailyReportId: string): Promise<boolean> => {
  const { data: report, error } = await supabase
    .from('daily_reports')
    .select('perplexity_status')
    .eq('id', dailyReportId)
    .single()

  if (error || !report) {
    console.error('❌ [COMPLETION CHECK] Error fetching report status:', error)
    return false
  }

  // New rule: Report is complete when Perplexity is complete (Google AI Overview is secondary)
  return report.perplexity_status === 'complete'
}

// Check if both phases have been attempted (for determining when to mark as complete)
const haveBothPhasesBeenAttempted = async (supabase: any, dailyReportId: string): Promise<boolean> => {
  const { data: report, error } = await supabase
    .from('daily_reports')
    .select('perplexity_status, google_ai_overview_status, report_date')
    .eq('id', dailyReportId)
    .single()

  if (error || !report) {
    console.error('❌ [PHASE CHECK] Error fetching report status:', error)
    return false
  }

  const today = new Date().toISOString().split('T')[0]
  const reportDate = report.report_date
  
  // If it's a past date, Google AI Overview should be expired/skipped, so consider it "attempted"
  if (reportDate < today) {
    return report.perplexity_status === 'complete' && 
           ['expired', 'skipped', 'complete', 'failed'].includes(report.google_ai_overview_status)
  }
  
  // For today's date, both phases must be attempted
  return report.perplexity_status === 'complete' && 
         ['complete', 'failed', 'running'].includes(report.google_ai_overview_status)
}

// Update daily report completion status
const updateCompletionStatus = async (supabase: any, dailyReportId: string) => {
  const isPerplexityComplete = await isDailyReportComplete(supabase, dailyReportId)
  const bothPhasesAttempted = await haveBothPhasesBeenAttempted(supabase, dailyReportId)
  
  // Check if URL processing is complete
  const { data: reportStatus } = await supabase
    .from('daily_reports')
    .select('url_processing_status, urls_total, urls_classified')
    .eq('id', dailyReportId)
    .single()
  
  const isUrlProcessingComplete = reportStatus?.url_processing_status === 'complete'
  
  // Only mark as complete if ALL THREE phases are complete:
  // 1. Perplexity is complete
  // 2. Both provider phases have been attempted
  // 3. URL processing and classification is complete
  const shouldMarkComplete = isPerplexityComplete && bothPhasesAttempted && isUrlProcessingComplete
  
  const { error } = await supabase
    .from('daily_reports')
    .update({
      generated: shouldMarkComplete,
      status: shouldMarkComplete ? 'completed' : 'running',
      completed_at: shouldMarkComplete ? new Date().toISOString() : null
    })
    .eq('id', dailyReportId)

  if (error) {
    console.error('❌ [COMPLETION] Error updating completion status:', error)
  } else {
    console.log(`✅ [COMPLETION] Report marked as ${shouldMarkComplete ? 'complete' : 'incomplete'} (Perplexity: ${isPerplexityComplete}, Both phases: ${bothPhasesAttempted}, URL processing: ${isUrlProcessingComplete})`)
  }

  return shouldMarkComplete
}

export async function POST(request: NextRequest) {
  try {
    const { brandId, manual = false, fromCron = false } = await request.json()
    
    console.log('🚀 [DAILY REPORT] Starting generation for brand:', brandId, 'Manual:', manual, 'From Cron:', fromCron)
    
    // For manual reports, add a timeout to prevent hanging
    if (manual) {
      console.log('⏰ [DAILY REPORT] Manual report generation - setting 15 minute timeout')
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error('Manual report generation timeout after 15 minutes'))
        }, 15 * 60 * 1000)
      })
      
      const reportPromise = generateReport(brandId, manual, fromCron)
      
      return Promise.race([reportPromise, timeoutPromise])
    }
    
    return generateReport(brandId, manual, fromCron)
    
  } catch (error) {
    console.error('❌ [DAILY REPORT] Unexpected error:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

async function generateReport(brandId: string, manual: boolean, fromCron: boolean) {
  try {
    
    if (!brandId) {
      return NextResponse.json({
        success: false,
        error: 'Brand ID is required'
      }, { status: 400 })
    }

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
      console.error('❌ [DAILY REPORT] Brand not found:', brandError)
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
      console.error('❌ [DAILY REPORT] Error fetching prompts:', promptsError)
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

    console.log(`📊 [DAILY REPORT] Found ${activePrompts.length} active prompts for brand: ${brand.name}`)

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
      console.error('❌ [DAILY REPORT] Error checking existing report:', existingReportError)
      return NextResponse.json({
        success: false,
        error: 'Failed to check existing reports'
      }, { status: 500 })
    }

    if (existingReport) {
      console.log(`ℹ️ [DAILY REPORT] Found existing report for today: ${existingReport.id}`)
      
      // Check completion status
      if (existingReport.generated) {
        console.log(`ℹ️ [DAILY REPORT] Report already complete for ${brand.name} today`)
        return NextResponse.json({
          success: true,
          message: 'Report already complete for today',
          reportId: existingReport.id,
          generated: true
        })
      }

      // Resume incomplete report
      dailyReport = existingReport
      console.log(`🔄 [DAILY REPORT] Resuming incomplete report: ${dailyReport.id}`)
      console.log(`📊 [DAILY REPORT] Current status - Perplexity: ${dailyReport.perplexity_status}, Google AI Overview: ${dailyReport.google_ai_overview_status}`)
    } else {
      // Create new daily report record
      const { data: newReport, error: reportError } = await supabase
      .from('daily_reports')
      .insert({
        brand_id: brandId,
        report_date: today,
        status: 'running',
        total_prompts: activePrompts.length,
        completed_prompts: 0,
          total_mentions: 0,
          generated: false,
          perplexity_status: 'not_started',
          google_ai_overview_status: 'not_started',
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
      console.error('❌ [DAILY REPORT] Error creating report:', reportError)
      return NextResponse.json({
        success: false,
        error: 'Failed to create daily report'
      }, { status: 500 })
    }

      dailyReport = newReport
      console.log('✅ [DAILY REPORT] Created new daily report:', dailyReport.id)
    }

    // Get competitors from onboarding answers
    const competitors = (brand.onboarding_answers as any)?.competitors || []
    console.log('🏢 [DAILY REPORT] Competitors:', competitors)

    let perplexityCounts = { attempted: 0, ok: 0, noResult: 0, errors: 0 }
    let googleCounts = { attempted: 0, ok: 0, noResult: 0, errors: 0 }

    // PHASE 1: Process Perplexity prompts (if not already complete)
    if (dailyReport.perplexity_status !== 'complete') {
      console.log('🚀 [PERPLEXITY] Starting Perplexity pass')
      
      // Update status to running
      await updateProviderStatus(supabase, dailyReport.id, 'perplexity', 'running')
      
      // Process all Perplexity prompts
      perplexityCounts = await processProviderPrompts(
        supabase,
        dailyReport.id,
        activePrompts,
        brand.name,
        competitors,
        'perplexity'
      )
      
      // Update Perplexity status
      const perplexityStatus = perplexityCounts.errors > 0 ? 'failed' : 'complete'
      await updateProviderStatus(supabase, dailyReport.id, 'perplexity', perplexityStatus, perplexityCounts)
      
      console.log(`✅ [PERPLEXITY] Pass completed - Status: ${perplexityStatus}`)
    } else {
      console.log('⏭️ [PERPLEXITY] Pass already complete, skipping')
    }

    // PHASE 2: Process Google AI Overview prompts (today's date only)
    const reportDate = dailyReport.report_date
    
    if (dailyReport.google_ai_overview_status !== 'complete' && 
        dailyReport.google_ai_overview_status !== 'expired' && 
        dailyReport.google_ai_overview_status !== 'skipped' &&
        reportDate === today) {
      console.log('🚀 [GOOGLE AI OVERVIEW] Starting Google AI Overview pass for today only')
      
      // Update status to running
      await updateProviderStatus(supabase, dailyReport.id, 'google_ai_overview', 'running')
      
      // Process all Google AI Overview prompts
      googleCounts = await processProviderPrompts(
        supabase,
        dailyReport.id,
        activePrompts,
        brand.name,
        competitors,
        'google_ai_overview'
      )
      
      // Update Google AI Overview status
      const googleStatus = googleCounts.errors > 0 ? 'failed' : 'complete'
      await updateProviderStatus(supabase, dailyReport.id, 'google_ai_overview', googleStatus, googleCounts)
      
      console.log(`✅ [GOOGLE AI OVERVIEW] Pass completed - Status: ${googleStatus}`)
    } else if (reportDate < today) {
      console.log(`⏭️ [GOOGLE AI OVERVIEW] Skipping past date (${reportDate}) - Google AI Overview status: ${dailyReport.google_ai_overview_status}`)
      googleCounts = { attempted: 0, ok: 0, noResult: 0, errors: 0 }
    } else {
      console.log('⏭️ [GOOGLE AI OVERVIEW] Pass already complete or expired, skipping')
      googleCounts = { attempted: 0, ok: 0, noResult: 0, errors: 0 }
    }

    // PHASE 3: Update aggregated metrics from all providers
    console.log('📊 [AGGREGATION] Calculating aggregated metrics from all providers')
    
    // Get ALL results with full data to calculate metrics
    const { data: allResults, error: allResultsError } = await supabase
          .from('prompt_results')
      .select('brand_mentioned, brand_position, sentiment_score, competitor_mentions')
      .eq('daily_report_id', dailyReport.id)

    if (!allResultsError && allResults) {
      const totalMentions = allResults.filter(r => r.brand_mentioned).length
      
      // Calculate rank-based average position (mention order, not character position)
      const rankPositions: number[] = []
      allResults.forEach(result => {
        if (result.brand_mentioned && result.competitor_mentions && Array.isArray(result.competitor_mentions) && result.competitor_mentions.length > 0) {
          // Calculate rank based on mention order (who was mentioned first, second, etc.)
          const entities: { name: string, position: number }[] = []
          
          // Add brand
          if (result.brand_position !== null) {
            entities.push({ name: brand.name, position: result.brand_position })
          }
          
          // Add competitors with their positions
          result.competitor_mentions.forEach((comp: any) => {
            if (comp && comp.name) {
              // Use comp.position if available (new data), otherwise skip (old data without position)
              if (comp.position !== undefined && comp.position !== null && comp.position !== -1) {
                entities.push({ name: comp.name, position: comp.position })
              }
            }
          })
          
          // Only calculate rank if we have position data for competitors
          if (entities.length > 1) {
            // Sort by position to get rank order (earlier mention = lower position = higher rank)
            entities.sort((a, b) => a.position - b.position)
            
            // Find brand's rank (1 = first mentioned, 2 = second, etc.)
            const brandIndex = entities.findIndex(e => e.name === brand.name)
            if (brandIndex !== -1) {
              rankPositions.push(brandIndex + 1) // Rank is 1-based
            }
          }
        }
      })
      
      const averageRankPosition = rankPositions.length > 0
        ? rankPositions.reduce((sum, rank) => sum + rank, 0) / rankPositions.length
        : null

      // Calculate sentiment scores
      const sentimentCounts = { positive: 0, neutral: 0, negative: 0 }
      allResults.forEach(result => {
        if (result.brand_mentioned && result.sentiment_score !== null) {
          if (result.sentiment_score > 0.1) {
            sentimentCounts.positive++
          } else if (result.sentiment_score < -0.1) {
            sentimentCounts.negative++
          } else {
            sentimentCounts.neutral++
          }
        }
      })

      // Update daily report with aggregated metrics
      await supabase
        .from('daily_reports')
        .update({
          total_mentions: totalMentions,
          average_position: averageRankPosition, // Now using rank position, not character position
          completed_prompts: allResults.length,
          sentiment_scores: sentimentCounts
        })
        .eq('id', dailyReport.id)

      console.log(`✅ [AGGREGATION] Updated metrics - Total mentions: ${totalMentions}, Avg rank: ${averageRankPosition}, Sentiment: ${JSON.stringify(sentimentCounts)}`)
    }

    // PHASE 4: Process URLs and classify content (REQUIRED FOR REPORT COMPLETION)
    // Note: Old portrayal classification removed - we now use LLM-based classification in URL processing
    const bothPhasesAttempted = await haveBothPhasesBeenAttempted(supabase, dailyReport.id)
    
    if (bothPhasesAttempted) {
      console.log('🔍 [URL PROCESSING] Starting URL extraction and classification')
      
      // Mark URL processing as started
      await supabase
        .from('daily_reports')
        .update({ url_processing_status: 'running' })
        .eq('id', dailyReport.id)
      
      try {
        // Process URLs (extract content and classify)
        console.log(`🔍 [URL PROCESSING] Calling processUrlsForDailyReport for report ${dailyReport.id}`)
        const urlStats = await processUrlsForDailyReport(dailyReport.id)
        console.log(`✅ [URL PROCESSING] Processed URLs:`, urlStats)
        
        // Verify URL processing completed successfully
        if (urlStats.totalUrls === 0) {
          console.warn('⚠️ [URL PROCESSING] No URLs were processed - this might indicate an issue')
        }
        
        // URL processing is now required for report completion
        // If it fails, the report will be marked as incomplete
        
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
            urls_classified: 0
          })
          .eq('id', dailyReport.id)
        
        // Report will NOT be marked as complete if URL processing fails
        console.error('❌ [URL PROCESSING] Report will remain incomplete due to URL processing failure')
      }
    } else {
      console.log('⚠️ [URL PROCESSING] Skipping URL processing - not all provider phases completed')
    }
    
    // Check completion and update final status (AFTER URL processing)
    const isComplete = await updateCompletionStatus(supabase, dailyReport.id)

    // Final summary
    console.log(`📊 [DAILY REPORT] Final Summary for ${brand.name}:`)
    console.log(`  Perplexity: ${perplexityCounts.attempted} attempted, ${perplexityCounts.ok} ok, ${perplexityCounts.noResult} no result, ${perplexityCounts.errors} errors`)
    console.log(`  Google AI Overview: ${googleCounts.attempted} attempted, ${googleCounts.ok} ok, ${googleCounts.noResult} no result, ${googleCounts.errors} errors`)
    console.log(`  Report Status: ${isComplete ? 'COMPLETE' : 'INCOMPLETE'}`)

    return NextResponse.json({
      success: true,
      message: 'Daily report generation completed',
      reportId: dailyReport.id,
      generated: isComplete,
      perplexity: perplexityCounts,
      googleAIOverview: googleCounts,
      isComplete
    })

  } catch (error) {
    console.error('❌ [DAILY REPORT] Unexpected error in generateReport:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}