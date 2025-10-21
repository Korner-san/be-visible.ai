import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { callPerplexityAPI, extractPerplexityContent, extractPerplexityCitations } from '@/lib/providers/perplexity'

/**
 * Process Perplexity stage for a daily report
 * This is called by the background job processor
 */
export async function POST(request: NextRequest) {
  try {
    const { dailyReportId, jobId, processingData } = await request.json()
    
    console.log(`🚀 [PERPLEXITY] Starting Perplexity processing for report ${dailyReportId}`)
    
    const supabase = createServiceClient()
    
    // Get active prompts for this report's brand
    const { data: report, error: reportError } = await supabase
      .from('daily_reports')
      .select(`
        id,
        brand_id,
        brands!inner(
          id,
          name,
          onboarding_answers
        )
      `)
      .eq('id', dailyReportId)
      .single()

    if (reportError || !report) {
      console.error('❌ [PERPLEXITY] Error fetching report:', reportError)
      return NextResponse.json({
        success: false,
        error: 'Report not found'
      }, { status: 404 })
    }

    const { data: activePrompts, error: promptsError } = await supabase
      .from('brand_prompts')
      .select('id, raw_prompt, improved_prompt, source_template_code, category')
      .eq('brand_id', report.brand_id)
      .eq('status', 'active')

    if (promptsError || !activePrompts) {
      console.error('❌ [PERPLEXITY] Error fetching prompts:', promptsError)
      return NextResponse.json({
        success: false,
        error: 'Failed to fetch active prompts'
      }, { status: 500 })
    }

    console.log(`📊 [PERPLEXITY] Processing ${activePrompts.length} prompts for brand: ${report.brands.name}`)

    // Update report status
    await supabase
      .from('daily_reports')
      .update({
        perplexity_status: 'running',
        processing_stage: 'perplexity'
      })
      .eq('id', dailyReportId)

    const brandName = report.brands.name
    const competitors = (report.brands.onboarding_answers as any)?.competitors || []
    
    let attempted = 0
    let ok = 0
    let noResult = 0
    let errors = 0

    // Process prompts in batches to avoid overwhelming the API
    const batchSize = 5
    for (let i = 0; i < activePrompts.length; i += batchSize) {
      const batch = activePrompts.slice(i, i + batchSize)
      console.log(`📊 [PERPLEXITY] Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(activePrompts.length/batchSize)} (${batch.length} prompts)`)
      
      for (let j = 0; j < batch.length; j++) {
        const prompt = batch[j]
        const promptText = prompt.improved_prompt || prompt.raw_prompt
        
        console.log(`🤖 [PERPLEXITY] Processing prompt ${i + j + 1}/${activePrompts.length}: ${prompt.source_template_code}`)
        
        attempted++
        
        try {
          const perplexityResponse = await callPerplexityAPI(promptText)
          const responseContent = extractPerplexityContent(perplexityResponse)
          const responseTimeMs = perplexityResponse.response_time_ms || 0
          const citations = extractPerplexityCitations(perplexityResponse)

          if (responseContent) {
            // Analyze brand mentions (basic analysis)
            const analysis = analyzeBrandMention(responseContent, brandName, competitors)

            // Save prompt result
            const resultData = {
              daily_report_id: dailyReportId,
              brand_prompt_id: prompt.id,
              prompt_text: promptText,
              provider: 'perplexity',
              provider_status: 'ok',
              brand_mentioned: analysis.mentioned,
              brand_position: analysis.mentioned ? analysis.position : null,
              competitor_mentions: analysis.competitorMentions,
              sentiment_score: analysis.sentiment,
              perplexity_response: responseContent,
              response_time_ms: responseTimeMs,
              citations: citations,
              created_at: new Date().toISOString()
            }

            const { error: upsertError } = await supabase
              .from('prompt_results')
              .upsert(resultData, {
                onConflict: 'daily_report_id,brand_prompt_id,provider'
              })

            if (upsertError) {
              console.error(`❌ [PERPLEXITY] Error upserting result for prompt ${i + j + 1}:`, upsertError)
              errors++
            } else {
              ok++
              console.log(`✅ [PERPLEXITY] Success for prompt ${i + j + 1}, response length: ${responseContent.length}`)
            }
          } else {
            noResult++
            console.log(`⚠️ [PERPLEXITY] No result for prompt ${i + j + 1}`)
          }

        } catch (error) {
          console.error(`❌ [PERPLEXITY] Error for prompt ${i + j + 1}:`, error)
          errors++
        }
      }
      
      // Add delay between batches to avoid rate limiting
      if (i + batchSize < activePrompts.length) {
        await new Promise(resolve => setTimeout(resolve, 2000))
      }
    }

    // Update report with final status
    const perplexityStatus = errors > 0 ? 'failed' : 'complete'
    await supabase
      .from('daily_reports')
      .update({
        perplexity_status: perplexityStatus,
        perplexity_attempted: attempted,
        perplexity_ok: ok,
        perplexity_no_result: noResult,
        processing_stage: perplexityStatus === 'complete' ? 'google_ai_overview' : 'perplexity'
      })
      .eq('id', dailyReportId)

    console.log(`📊 [PERPLEXITY] Pass completed - Attempted: ${attempted}, OK: ${ok}, No Result: ${noResult}, Errors: ${errors}`)
    console.log(`✅ [PERPLEXITY] Perplexity processing complete for report ${dailyReportId}`)

    return NextResponse.json({
      success: true,
      message: 'Perplexity processing completed',
      reportId: dailyReportId,
      jobId,
      stats: { attempted, ok, noResult, errors }
    })

  } catch (error) {
    console.error('❌ [PERPLEXITY] Unexpected error:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// Helper function for brand mention analysis (copied from generate-daily)
function analyzeBrandMention(text: string, brandName: string, competitors: string[]): any {
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

function analyzeSentiment(text: string, brandName: string): number {
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
