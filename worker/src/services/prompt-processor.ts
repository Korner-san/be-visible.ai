/**
 * Prompt Processing Service
 * Handles processing prompts with Perplexity and Google AI Overview
 */

import { createServiceClient } from '../lib/supabase-client'
import { callPerplexityAPI, extractPerplexityContent, extractPerplexityCitations } from '../lib/providers/perplexity'
import { callGoogleAIOverviewAPI, extractGoogleContent, extractGoogleCitations, hasGoogleResults } from '../lib/providers/google-ai-overview'

interface BrandMentionAnalysis {
  mentioned: boolean
  mentionCount: number
  position: number
  sentiment: number
  competitorMentions: Array<{ name: string; count: number; portrayalType: string; position: number }>
}

/**
 * Analyze sentiment based on keywords around brand mentions
 */
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

/**
 * Analyze brand mentions in response
 */
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
      position: competitorPositions.length > 0 ? competitorPositions[0] : -1,
      portrayalType: 'neutral'
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

/**
 * Process prompts for a single provider
 */
const processProviderPrompts = async (
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
  const supabase = createServiceClient()
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
          noResult++
          providerError = 'No search results found'
        }
      }

      if (responseContent) {
        // Analyze brand mentions
        const analysis = analyzeBrandMention(responseContent, brandName, competitors)

        // Save prompt result
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
          portrayal_type: null,
          classifier_stage: null,
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
      
      // Save error record (non-blocking - if this fails, we continue)
      try {
        await supabase
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
      } catch (saveError) {
        console.error(`❌ [${provider.toUpperCase()}] Error saving error record:`, saveError)
      }
      
      errors++
    }
  }

  console.log(`📊 [${provider.toUpperCase()}] Pass completed - Attempted: ${attempted}, OK: ${ok}, No Result: ${noResult}, Errors: ${errors}`)
  
  return { attempted, ok, noResult, errors }
}

/**
 * Update provider status in daily report
 */
const updateProviderStatus = async (
  dailyReportId: string,
  provider: 'perplexity' | 'google_ai_overview',
  status: 'not_started' | 'running' | 'complete' | 'failed',
  counts?: { attempted: number; ok: number; noResult: number; errors: number }
) => {
  const supabase = createServiceClient()
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

/**
 * Main function to process all prompts for a brand
 */
export const processPromptsForBrand = async (
  brand: any,
  dailyReport: any
): Promise<{
  totalPrompts: number
  totalMentions: number
  averagePosition: number | null
  perplexity: { attempted: number; ok: number; noResult: number; errors: number }
  googleAIOverview: { attempted: number; ok: number; noResult: number; errors: number }
}> => {
  const supabase = createServiceClient()
  
  // Get active prompts
  const { data: activePrompts, error: promptsError } = await supabase
    .from('brand_prompts')
    .select('id, raw_prompt, improved_prompt, source_template_code, category')
    .eq('brand_id', brand.id)
    .eq('status', 'active')

  if (promptsError || !activePrompts || activePrompts.length === 0) {
    throw new Error('No active prompts found for brand')
  }

  console.log(`📊 [PROMPT PROCESSOR] Found ${activePrompts.length} active prompts for brand: ${brand.name}`)

  const competitors = (brand.onboarding_answers as any)?.competitors || []
  console.log('🏢 [PROMPT PROCESSOR] Competitors:', competitors)

  let perplexityCounts = { attempted: 0, ok: 0, noResult: 0, errors: 0 }
  let googleCounts = { attempted: 0, ok: 0, noResult: 0, errors: 0 }

  // PHASE 1: Process Perplexity prompts (if not already complete)
  if (dailyReport.perplexity_status !== 'complete') {
    console.log('🚀 [PERPLEXITY] Starting Perplexity pass')
    
    await updateProviderStatus(dailyReport.id, 'perplexity', 'running')
    
    perplexityCounts = await processProviderPrompts(
      dailyReport.id,
      activePrompts,
      brand.name,
      competitors,
      'perplexity'
    )
    
    const perplexityStatus = perplexityCounts.errors > 0 ? 'failed' : 'complete'
    await updateProviderStatus(dailyReport.id, 'perplexity', perplexityStatus, perplexityCounts)
    
    console.log(`✅ [PERPLEXITY] Pass completed - Status: ${perplexityStatus}`)
  } else {
    console.log('⏭️ [PERPLEXITY] Pass already complete, skipping')
  }

  // PHASE 2: Process Google AI Overview prompts (today's date only)
  const today = new Date().toISOString().split('T')[0]
  const reportDate = dailyReport.report_date
  
  if (dailyReport.google_ai_overview_status !== 'complete' && 
      dailyReport.google_ai_overview_status !== 'expired' && 
      dailyReport.google_ai_overview_status !== 'skipped' &&
      reportDate === today) {
    console.log('🚀 [GOOGLE AI OVERVIEW] Starting Google AI Overview pass for today only')
    
    await updateProviderStatus(dailyReport.id, 'google_ai_overview', 'running')
    
    googleCounts = await processProviderPrompts(
      dailyReport.id,
      activePrompts,
      brand.name,
      competitors,
      'google_ai_overview'
    )
    
    const googleStatus = googleCounts.errors > 0 ? 'failed' : 'complete'
    await updateProviderStatus(dailyReport.id, 'google_ai_overview', googleStatus, googleCounts)
    
    console.log(`✅ [GOOGLE AI OVERVIEW] Pass completed - Status: ${googleStatus}`)
  } else if (reportDate < today) {
    console.log(`⏭️ [GOOGLE AI OVERVIEW] Skipping past date (${reportDate})`)
  } else {
    console.log('⏭️ [GOOGLE AI OVERVIEW] Pass already complete or expired, skipping')
  }

  // PHASE 3: Update aggregated metrics
  console.log('📊 [AGGREGATION] Calculating aggregated metrics from all providers')
  
  const { data: allResults, error: allResultsError } = await supabase
    .from('prompt_results')
    .select('brand_mentioned, brand_position, sentiment_score, competitor_mentions')
    .eq('daily_report_id', dailyReport.id)

  let totalMentions = 0
  let averagePosition: number | null = null

  if (!allResultsError && allResults) {
    totalMentions = allResults.filter(r => r.brand_mentioned).length
    
    // Calculate rank-based average position
    const rankPositions: number[] = []
    allResults.forEach(result => {
      if (result.brand_mentioned && result.competitor_mentions && Array.isArray(result.competitor_mentions) && result.competitor_mentions.length > 0) {
        const entities: { name: string; position: number }[] = []
        
        if (result.brand_position !== null) {
          entities.push({ name: brand.name, position: result.brand_position })
        }
        
        result.competitor_mentions.forEach((comp: any) => {
          if (comp && comp.name && comp.position !== undefined && comp.position !== null && comp.position !== -1) {
            entities.push({ name: comp.name, position: comp.position })
          }
        })
        
        if (entities.length > 1) {
          entities.sort((a, b) => a.position - b.position)
          const brandIndex = entities.findIndex(e => e.name === brand.name)
          if (brandIndex !== -1) {
            rankPositions.push(brandIndex + 1)
          }
        }
      }
    })
    
    averagePosition = rankPositions.length > 0
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
        average_position: averagePosition,
        completed_prompts: allResults.length,
        sentiment_scores: sentimentCounts
      })
      .eq('id', dailyReport.id)

    console.log(`✅ [AGGREGATION] Updated metrics - Total mentions: ${totalMentions}, Avg rank: ${averagePosition}, Sentiment: ${JSON.stringify(sentimentCounts)}`)
  }

  return {
    totalPrompts: activePrompts.length,
    totalMentions,
    averagePosition,
    perplexity: perplexityCounts,
    googleAIOverview: googleCounts
  }
}


