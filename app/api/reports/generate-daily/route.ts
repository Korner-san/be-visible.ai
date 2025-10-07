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

interface BrandMentionAnalysis {
  mentioned: boolean
  mentionCount: number // NEW: actual count of mentions
  position: number
  sentiment: number // -1 to 1
  portrayalType: string
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
  const contextEnd = Math.min(text.length, brandIndex + brandName.length + 100)
  const context = brandContext.slice(contextStart, contextEnd)
  
  let score = 0
  positiveWords.forEach(word => {
    if (context.includes(word)) score += 0.2
  })
  negativeWords.forEach(word => {
    if (context.includes(word)) score -= 0.2
  })
  
  return Math.max(-1, Math.min(1, score))
}

// Analyze brand mentions in text
const analyzeBrandMention = (text: string, brandName: string, competitors: string[]): BrandMentionAnalysis => {
  const lowerText = text.toLowerCase()
  const lowerBrand = brandName.toLowerCase()
  
  // Count ALL occurrences of brand name
  const brandMentions = []
  let brandIndex = lowerText.indexOf(lowerBrand)
  while (brandIndex !== -1) {
    brandMentions.push(brandIndex)
    brandIndex = lowerText.indexOf(lowerBrand, brandIndex + 1)
  }
  
  const mentioned = brandMentions.length > 0
  const firstMentionIndex = brandMentions.length > 0 ? brandMentions[0] : -1
  
  // Find competitor mentions with their analysis
  const competitorMentions: Array<{name: string, count: number, portrayalType: string}> = []
  
  competitors.forEach(competitor => {
    const lowerCompetitor = competitor.toLowerCase()
    const mentions = []
    let compIndex = lowerText.indexOf(lowerCompetitor)
    
    while (compIndex !== -1) {
      mentions.push(compIndex)
      compIndex = lowerText.indexOf(lowerCompetitor, compIndex + 1)
    }
    
    if (mentions.length > 0) {
      competitorMentions.push({
        name: competitor,
        count: mentions.length,
        portrayalType: 'neutral' // Simplified - no keyword-based competitor portrayal analysis
      })
    }
  })
  
  return {
    mentioned,
    mentionCount: brandMentions.length,
    position: firstMentionIndex,
    sentiment: mentioned ? analyzeSentiment(text, brandName) : 0,
    portrayalType: null, // No longer doing keyword-based portrayal classification
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
  
  // Log success details
  const hasSearchResults = data.search_results && Array.isArray(data.search_results)
  const citationCount = hasSearchResults ? data.search_results.length : 0
  console.log('✅ [PERPLEXITY] Success - Search results exists:', hasSearchResults, 'Citations count:', citationCount)
  
  return { ...data, response_time_ms: responseTime }
}

// Types for Claude API
interface ClaudeResponse {
  id: string
  type: string
  role: string
  model: string
  content: Array<{
    type: string
    text: string
  }>
  stop_reason: string
  usage: {
    input_tokens: number
    output_tokens: number
    service_tier: string
  }
  response_time_ms?: number
}

// Call Claude API
const callClaudeAPI = async (prompt: string): Promise<ClaudeResponse> => {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured')
  }

  const model = 'claude-sonnet-4-20250514'
  console.log('🤖 [CLAUDE] Calling API with model:', model, 'prompt:', prompt.substring(0, 100) + '...')
  
  const startTime = Date.now()
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: model,
      max_tokens: 1000,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    })
  })

  const responseTime = Date.now() - startTime
  console.log('🤖 [CLAUDE] HTTP Status:', response.status, 'Response time:', responseTime, 'ms')

  if (!response.ok) {
    const errorText = await response.text()
    console.error('❌ [CLAUDE] API Error - Status:', response.status, 'Payload:', errorText)
    throw new Error(`Claude API error: ${response.status} ${errorText}`)
  }

  const data = await response.json()
  
  // Log success details
  const hasContent = data.content && Array.isArray(data.content) && data.content.length > 0
  const contentLength = hasContent ? data.content[0]?.text?.length || 0 : 0
  console.log('✅ [CLAUDE] Success - Content exists:', hasContent, 'Content length:', contentLength)
  
  return { ...data, response_time_ms: responseTime }
}

export async function POST(request: NextRequest) {
  try {
    const { brandId, manual = false, fromCron = false } = await request.json()
    
    console.log('🔄 [DAILY REPORT] Starting daily report generation for brand:', brandId, fromCron ? '(from cron)' : '(manual)')
    
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

    // Create daily report record
    const today = new Date().toISOString().split('T')[0]
    const { data: dailyReport, error: reportError } = await supabase
      .from('daily_reports')
      .insert({
        brand_id: brandId,
        report_date: today,
        status: 'running',
        total_prompts: activePrompts.length,
        completed_prompts: 0,
        total_mentions: 0
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

    console.log('✅ [DAILY REPORT] Created daily report:', dailyReport.id)

    // Get competitors from onboarding answers
    const competitors = (brand.onboarding_answers as any)?.competitors || []
    console.log('🏢 [DAILY REPORT] Competitors:', competitors)

    // Process each prompt
    let totalMentions = 0
    let totalPosition = 0
    let mentionCount = 0
    const sentimentScores: { [key: string]: number } = {
      positive: 0,
      neutral: 0,
      negative: 0
    }

    for (let i = 0; i < activePrompts.length; i++) {
      const prompt = activePrompts[i]
      const promptText = prompt.improved_prompt || prompt.raw_prompt
      
      console.log(`🤖 [DAILY REPORT] Processing prompt ${i + 1}/${activePrompts.length}: ${prompt.source_template_code}`)

      try {
        // Call Perplexity API
        const perplexityResponse = await callPerplexityAPI(promptText)
        const responseContent = perplexityResponse.choices[0]?.message?.content || ''
        
        // Call Claude API (sequential after Perplexity)
        let claudeResponse = null
        let claudeResponseContent = ''
        try {
          console.log(`🤖 [CLAUDE] Processing same prompt ${i + 1}/${activePrompts.length} for Claude`)
          claudeResponse = await callClaudeAPI(promptText)
          claudeResponseContent = claudeResponse.content?.[0]?.text || ''
          console.log(`✅ [CLAUDE] Success for prompt ${i + 1}, response length: ${claudeResponseContent.length}`)
        } catch (claudeError) {
          console.error(`❌ [CLAUDE] Error for prompt ${i + 1}:`, claudeError)
          // Continue with Perplexity data even if Claude fails
        }
        
        // Analyze brand mentions (basic analysis only - no portrayal classification)
        const analysis = analyzeBrandMention(responseContent, brand.name, competitors)
        
        if (analysis.mentioned) {
          totalMentions += analysis.mentionCount // Use actual mention count!
          totalPosition += analysis.position
          mentionCount++
        }

        // Update sentiment scores
        if (analysis.sentiment > 0.3) {
          sentimentScores.positive++
        } else if (analysis.sentiment < -0.3) {
          sentimentScores.negative++
        } else {
          sentimentScores.neutral++
        }

        // Save prompt result (without portrayal classification - will be done by LLM)
        const { data: promptResult, error: promptResultError } = await supabase
          .from('prompt_results')
          .insert({
            daily_report_id: dailyReport.id,
            brand_prompt_id: prompt.id,
            prompt_text: promptText,
            perplexity_response: responseContent,
            response_time_ms: perplexityResponse.response_time_ms || 0,
            claude_response: claudeResponseContent,
            claude_response_time_ms: claudeResponse?.response_time_ms || null,
            claude_citations: [], // Claude doesn't provide structured citations
            brand_mentioned: analysis.mentioned,
            brand_position: analysis.mentioned ? analysis.position : null,
            competitor_mentions: analysis.competitorMentions,
            citations: perplexityResponse.search_results || [],
            sentiment_score: analysis.sentiment,
            portrayal_type: null, // Will be set by LLM classification
            classifier_stage: null, // Will be set by LLM classification
            classifier_version: null,
            snippet_hash: null,
            portrayal_confidence: null,
            claude_portrayal_type: null, // Will be set by LLM classification
            claude_classifier_stage: null, // Will be set by LLM classification
            claude_classifier_version: null,
            claude_snippet_hash: null,
            claude_portrayal_confidence: null
          })
          .select()
          .single()

        if (promptResultError) {
          console.error('❌ [DAILY REPORT] Error saving prompt result:', promptResultError)
        }

        // Save individual citations from search_results
        if (promptResult && perplexityResponse.search_results && perplexityResponse.search_results.length > 0) {
          const citationInserts = perplexityResponse.search_results.map((result: any) => {
            const url = result.url || result.link || ''
            const title = result.title || ''
            const domain = url ? new URL(url).hostname : ''
            
            // Determine content type based on domain
            let contentType = 'other'
            if (domain.includes('blog') || domain.includes('medium') || domain.includes('substack')) {
              contentType = 'blog'
            } else if (domain.includes('github') || domain.includes('docs')) {
              contentType = 'documentation'  
            } else if (domain.includes('news') || domain.includes('reuters') || domain.includes('cnn')) {
              contentType = 'news'
            } else if (url.includes('product') || url.includes('pricing')) {
              contentType = 'product_page'
            }
            
            return {
              prompt_result_id: promptResult.id,
              url,
              title,
              domain,
              content_type: contentType,
              relevance_score: 0.8 // Higher default score
            }
          })
          
          const { error: citationsError } = await supabase
            .from('citation_details')
            .insert(citationInserts)
            
          if (citationsError) {
            console.error('❌ [DAILY REPORT] Error saving citations:', citationsError)
          } else {
            console.log(`✅ [DAILY REPORT] Saved ${citationInserts.length} citations for prompt ${prompt.source_template_code}`)
          }
        }

        console.log(`✅ [DAILY REPORT] Processed prompt ${prompt.source_template_code}: mentioned=${analysis.mentioned}, sentiment=${analysis.sentiment.toFixed(2)}`)

        // Add delay to avoid rate limiting
        if (i < activePrompts.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000))
        }

      } catch (error) {
        console.error(`❌ [DAILY REPORT] Error processing prompt ${prompt.source_template_code}:`, error)
        
        // Save error result
        await supabase
          .from('prompt_results')
          .insert({
            daily_report_id: dailyReport.id,
            brand_prompt_id: prompt.id,
            prompt_text: promptText,
            error_message: error instanceof Error ? error.message : 'Unknown error'
          })
      }

      // Update progress
      await supabase
        .from('daily_reports')
        .update({
          completed_prompts: i + 1
        })
        .eq('id', dailyReport.id)
    }

    // Calculate final metrics
    const averagePosition = mentionCount > 0 ? totalPosition / mentionCount : null

    // Complete the report
    const { error: updateError } = await supabase
      .from('daily_reports')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        total_mentions: totalMentions,
        average_position: averagePosition,
        sentiment_scores: sentimentScores
      })
      .eq('id', dailyReport.id)

    if (updateError) {
      console.error('❌ [DAILY REPORT] Error updating final report:', updateError)
    }

    console.log(`🎉 [DAILY REPORT] Completed! Total mentions: ${totalMentions}, Average position: ${averagePosition}`)

    // Run LLM portrayal classification on the newly generated results
    console.log('🤖 [DAILY REPORT] Starting LLM portrayal classification...')
    try {
      // Run Perplexity classification
      const classificationResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/reports/classify-portrayal`, {
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

      if (classificationResponse.ok) {
        const classificationData = await classificationResponse.json()
        console.log('✅ [DAILY REPORT] Perplexity LLM classification completed:', {
          processed: classificationData.processed,
          skipped: classificationData.skipped,
          errors: classificationData.errors?.length || 0
        })
      } else {
        console.warn('⚠️ [DAILY REPORT] Perplexity LLM classification failed, but report generation succeeded')
      }

      // Run Claude classification
      const claudeClassificationResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/reports/classify-claude-portrayal`, {
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

      if (claudeClassificationResponse.ok) {
        const claudeClassificationData = await claudeClassificationResponse.json()
        console.log('✅ [DAILY REPORT] Claude LLM classification completed:', {
          processed: claudeClassificationData.processed,
          skipped: claudeClassificationData.skipped,
          errors: claudeClassificationData.errors?.length || 0
        })
      } else {
        console.warn('⚠️ [DAILY REPORT] Claude LLM classification failed, but report generation succeeded')
      }
    } catch (classificationError) {
      console.warn('⚠️ [DAILY REPORT] LLM classification error (non-blocking):', classificationError)
      // Don't fail the entire report generation if classification fails
    }

    return NextResponse.json({
      success: true,
      reportId: dailyReport.id,
      totalPrompts: activePrompts.length,
      totalMentions,
      averagePosition,
      sentimentScores
    })

  } catch (error) {
    console.error('❌ [DAILY REPORT] Unexpected error:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 })
  }
}
