import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

// Types for Perplexity API
interface PerplexityResponse {
  id: string
  object: string
  created: number
  model: string
  choices: {
    index: number
    finish_reason: string
    message: {
      role: string
      content: string
    }
    delta?: {
      role?: string
      content?: string
    }
  }[]
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
  search_results?: Array<{url: string, title?: string, snippet?: string}>
}

// Types for Google AI Overview API
interface GoogleAIOverviewResponse {
  items?: Array<{
    title: string
    link: string
    snippet: string
    displayLink: string
  }>
  searchInformation?: {
    searchTime: number
    totalResults: string
  }
  response_time_ms?: number
}

interface BrandMentionAnalysis {
  mentioned: boolean
  mentionCount: number
  position: number
  sentiment: number
  competitorMentions: Array<{name: string, count: number, portrayalType: string}>
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
  
  // Find competitor mentions
  const competitorMentions = competitors.map(competitor => {
    const competitorMentions: number[] = []
    const lowerCompetitor = competitor.toLowerCase()
    let compIndex = lowerText.indexOf(lowerCompetitor)
    while (compIndex !== -1) {
      competitorMentions.push(compIndex)
      compIndex = lowerText.indexOf(lowerCompetitor, compIndex + 1)
    }
    
    return {
        name: competitor,
      count: competitorMentions.length,
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

// Call Perplexity API
const callPerplexityAPI = async (prompt: string): Promise<PerplexityResponse> => {
  const apiKey = process.env.PERPLEXITY_API_KEY
  if (!apiKey) {
    throw new Error('PERPLEXITY_API_KEY not configured')
  }

  const model = 'sonar'
  console.log('🤖 [PERPLEXITY] Calling API with model:', model, 'prompt:', prompt.substring(0, 100) + '...')
  
  const startTime = Date.now()
  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: model,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 1000,
      temperature: 0.2,
      top_p: 0.9,
      return_citations: true,
      search_recency_filter: 'month'
    })
  })

  const responseTime = Date.now() - startTime
  console.log('🤖 [PERPLEXITY] HTTP Status:', response.status, 'Response time:', responseTime, 'ms')

  if (!response.ok) {
    const errorText = await response.text()
    console.error('❌ [PERPLEXITY] API Error - Status:', response.status, 'Payload:', errorText)
    throw new Error(`Perplexity API error: ${response.status} ${errorText}`)
  }

  const data = await response.json()
  
  const hasSearchResults = data.search_results && Array.isArray(data.search_results)
  const citationCount = hasSearchResults ? data.search_results.length : 0
  console.log('✅ [PERPLEXITY] Success - Search results exists:', hasSearchResults, 'Citations count:', citationCount)
  
  return { ...data, response_time_ms: responseTime }
}

// Call Google AI Overview API
const callGoogleAIOverviewAPI = async (prompt: string): Promise<GoogleAIOverviewResponse> => {
  const apiKey = process.env.GOOGLE_API_KEY
  const cseId = process.env.GOOGLE_CSE_ID
  
  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY not configured')
  }
  if (!cseId) {
    throw new Error('GOOGLE_CSE_ID not configured')
  }

  console.log('🤖 [GOOGLE AI OVERVIEW] Calling API with prompt:', prompt.substring(0, 100) + '...')
  
  const startTime = Date.now()
  const apiUrl = 'https://www.googleapis.com/customsearch/v1'
  
  const response = await fetch(`${apiUrl}?key=${apiKey}&cx=${cseId}&q=${encodeURIComponent(prompt)}&num=10`, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
    }
  })

  const responseTime = Date.now() - startTime
  console.log('🤖 [GOOGLE AI OVERVIEW] HTTP Status:', response.status, 'Response time:', responseTime, 'ms')

  if (!response.ok) {
    const errorText = await response.text()
    console.error('❌ [GOOGLE AI OVERVIEW] API Error - Status:', response.status, 'Payload:', errorText)
    throw new Error(`Google AI Overview API error: ${response.status} ${errorText}`)
  }

  const data = await response.json()
  
  const hasItems = data.items && Array.isArray(data.items) && data.items.length > 0
  const itemCount = hasItems ? data.items.length : 0
  console.log('✅ [GOOGLE AI OVERVIEW] Success - Items found:', itemCount)
  
  return { ...data, response_time_ms: responseTime }
}

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
        responseContent = perplexityResponse.choices[0]?.message?.content || ''
        responseTimeMs = perplexityResponse.response_time_ms || 0
        citations = perplexityResponse.search_results || []
      } else if (provider === 'google_ai_overview') {
        const googleResponse = await callGoogleAIOverviewAPI(promptText)
        if (googleResponse.items && googleResponse.items.length > 0) {
          responseContent = googleResponse.items.map(item => item.snippet).join('\n\n')
          responseTimeMs = googleResponse.response_time_ms || 0
          citations = googleResponse.items.map(item => ({
            title: item.title,
            link: item.link,
            snippet: item.snippet,
            domain: item.displayLink
          }))
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
  
  // Only mark as complete if Perplexity is complete AND both phases have been attempted
  const shouldMarkComplete = isPerplexityComplete && bothPhasesAttempted
  
  const { error } = await supabase
    .from('daily_reports')
    .update({
      generated: shouldMarkComplete,
      status: shouldMarkComplete ? 'completed' : 'incomplete',
      completed_at: shouldMarkComplete ? new Date().toISOString() : null
    })
    .eq('id', dailyReportId)

  if (error) {
    console.error('❌ [COMPLETION] Error updating completion status:', error)
  } else {
    console.log(`✅ [COMPLETION] Report marked as ${shouldMarkComplete ? 'complete' : 'incomplete'} (Perplexity: ${isPerplexityComplete ? 'complete' : 'incomplete'}, Both phases attempted: ${bothPhasesAttempted})`)
  }

  return shouldMarkComplete
}

export async function POST(request: NextRequest) {
  try {
    const { brandId, manual = false, fromCron = false } = await request.json()
    
    console.log('🚀 [DAILY REPORT] Starting generation for brand:', brandId, 'Manual:', manual, 'From Cron:', fromCron)
    
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
    
    // Count total mentions and calculate average position from ALL providers
    const { data: allResults, error: allResultsError } = await supabase
      .from('prompt_results')
      .select('brand_mentioned, brand_position, sentiment_score')
      .eq('daily_report_id', dailyReport.id)

    if (!allResultsError && allResults) {
      const totalMentions = allResults.filter(r => r.brand_mentioned).length
      const mentionsWithPosition = allResults.filter(r => r.brand_mentioned && r.brand_position !== null)
      const averagePosition = mentionsWithPosition.length > 0
        ? mentionsWithPosition.reduce((sum, r) => sum + (r.brand_position || 0), 0) / mentionsWithPosition.length
        : null

      // Update daily report with aggregated metrics
      await supabase
        .from('daily_reports')
        .update({
          total_mentions: totalMentions,
          average_position: averagePosition,
          completed_prompts: allResults.length
        })
        .eq('id', dailyReport.id)

      console.log(`✅ [AGGREGATION] Updated metrics - Total mentions: ${totalMentions}, Avg position: ${averagePosition}`)
    }

    // Check completion and update final status (only after both phases attempted)
    const isComplete = await updateCompletionStatus(supabase, dailyReport.id)

    // PHASE 4: Run LLM classification for completed providers
    if (isComplete) {
      console.log('🤖 [CLASSIFICATION] Starting LLM classification for completed providers')
      
      try {
        // Always run Perplexity classification if Perplexity is complete
        if (perplexityCounts.attempted > 0) {
          const perplexityClassificationResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/reports/classify-portrayal`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              brandId: brandId,
              fromCron: fromCron,
              dailyReportId: dailyReport.id
            })
          })

          if (perplexityClassificationResponse.ok) {
            const perplexityClassificationResult = await perplexityClassificationResponse.json()
            console.log('✅ [PERPLEXITY CLASSIFICATION] Completed:', perplexityClassificationResult)
          } else {
            console.error('❌ [PERPLEXITY CLASSIFICATION] Failed:', await perplexityClassificationResponse.text())
          }
        }

        // Only run Google AI Overview classification if Google AI Overview is complete
        if (googleCounts.attempted > 0 && googleCounts.errors === 0) {
          const googleClassificationResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/reports/classify-google-ai-overview-portrayal`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              brandId: brandId,
              fromCron: fromCron,
              dailyReportId: dailyReport.id
            })
          })

          if (googleClassificationResponse.ok) {
            const googleClassificationResult = await googleClassificationResponse.json()
            console.log('✅ [GOOGLE AI OVERVIEW CLASSIFICATION] Completed:', googleClassificationResult)
          } else {
            console.error('❌ [GOOGLE AI OVERVIEW CLASSIFICATION] Failed:', await googleClassificationResponse.text())
          }
        }

      } catch (classificationError) {
        console.error('❌ [CLASSIFICATION] Error during LLM classification:', classificationError)
        // Don't fail the entire report for classification errors
      }
    }

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
    console.error('❌ [DAILY REPORT] Unexpected error:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 })
  }
}