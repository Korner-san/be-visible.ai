import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import crypto from 'crypto'

// Classification result interface
interface ClassificationResult {
  category: string
  confidence: number
}

// Generate snippet hash for caching
function generateSnippetHash(brandName: string, snippet: string): string {
  const content = `${brandName.toLowerCase()}:${snippet.toLowerCase()}`
  return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16)
}

// Extract snippet around brand mention
function extractSnippet(text: string, brandName: string, maxLength: number = 800): string {
  if (!text || !brandName) return ''
  
  const lowerText = text.toLowerCase()
  const lowerBrand = brandName.toLowerCase()
  const brandIndex = lowerText.indexOf(lowerBrand)
  
  if (brandIndex === -1) return text.substring(0, maxLength).trim()
  
  const halfLength = Math.floor(maxLength / 2)
  const start = Math.max(0, brandIndex - halfLength)
  const end = Math.min(text.length, brandIndex + halfLength)
  
  return text.slice(start, end).trim()
}

// Call GPT-mini for classification (same as Perplexity and Claude classification)
async function classifyPortrayal(brandName: string, snippet: string): Promise<ClassificationResult> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured')
  }

  const systemMessage = `You are a deterministic classifier for brand portrayal in AI responses.
Return exactly one label from this fixed set (uppercase slugs):

RECOMMENDATION — the text steers the reader to choose/use the brand.

COMPARISON — the brand is contrasted with alternatives.

PROBLEM_SOLVER — the brand is framed as solving a specific problem/pain.

FEATURE_BENEFIT — the brand's capabilities/benefits are highlighted.

NEUTRAL_DESCRIPTION — simple definition/intro of the brand.

AUTHORITY_REFERENCE — the brand is cited as example/reference/benchmark/best practice.

USE_CASE — scenario where the brand fits/is typically used.

OTHER — none fit confidently.

Precedence: RECOMMENDATION > COMPARISON > PROBLEM_SOLVER > best fit > OTHER.

Respond with only the category slug and confidence (0.0-1.0) as JSON: {"category": "CATEGORY", "confidence": 0.95}`

  const userMessage = `Brand: ${brandName}

Text snippet: ${snippet}

Classify the portrayal of "${brandName}" in this text.`

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userMessage }
      ],
      temperature: 0, // Deterministic
      max_tokens: 100
    })
  })

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`)
  }

  const data = await response.json()
  const content = data.choices[0]?.message?.content || '{"category": "OTHER", "confidence": 0.0}'
  
  try {
    return JSON.parse(content)
  } catch {
    return { category: 'OTHER', confidence: 0.0 }
  }
}

export async function POST(request: NextRequest) {
  try {
    const { brandId, fromCron = false, dailyReportId } = await request.json()
    
    console.log('🤖 [GOOGLE AI OVERVIEW CLASSIFICATION] Starting classification for brand:', brandId)
    
    if (!brandId) {
      return NextResponse.json({
        success: false,
        error: 'Brand ID is required'
      }, { status: 400 })
    }

    const supabase = createServiceClient()

    // Get brand information
    const { data: brand, error: brandError } = await supabase
      .from('brands')
      .select('id, name')
      .eq('id', brandId)
      .single()

    if (brandError || !brand) {
      console.error('❌ [GOOGLE AI OVERVIEW CLASSIFICATION] Brand not found:', brandError)
      return NextResponse.json({
        success: false,
        error: 'Brand not found'
      }, { status: 404 })
    }

    // Build query for unclassified Google AI Overview brand mentions
    let query = supabase
      .from('prompt_results')
      .select(`
        id,
        google_ai_overview_response,
        google_ai_overview_portrayal_type,
        google_ai_overview_classifier_stage,
        google_ai_overview_snippet_hash,
        brand_prompts!inner(
          brand_id
        )
      `)
      .eq('brand_prompts.brand_id', brandId)
      .not('google_ai_overview_response', 'is', null)
      .neq('google_ai_overview_response', '')
      .or('google_ai_overview_classifier_stage.is.null,google_ai_overview_classifier_stage.neq.llm')

    // If dailyReportId is provided, only process results from that specific report
    if (dailyReportId) {
      query = query.eq('daily_report_id', dailyReportId)
      console.log('🎯 [GOOGLE AI OVERVIEW CLASSIFICATION] Processing only results from daily report:', dailyReportId)
    }

    const { data: results, error: resultsError } = await query

    if (resultsError) {
      console.error('❌ [GOOGLE AI OVERVIEW CLASSIFICATION] Error fetching results:', resultsError)
      return NextResponse.json({
        success: false,
        error: 'Failed to fetch results'
      }, { status: 500 })
    }

    if (!results || results.length === 0) {
      console.log('ℹ️ [GOOGLE AI OVERVIEW CLASSIFICATION] No unclassified Google AI Overview results found')
      return NextResponse.json({
        success: true,
        processed: 0,
        skipped: 0,
        errors: []
      })
    }

    console.log(`📊 [GOOGLE AI OVERVIEW CLASSIFICATION] Found ${results.length} results to classify`)

    let processed = 0
    let skipped = 0
    const errors: string[] = []

    for (const result of results) {
      try {
        const responseText = result.google_ai_overview_response || ''
        
        // Check if brand is mentioned in the response
        if (!responseText.toLowerCase().includes(brand.name.toLowerCase())) {
          console.log(`⏭️ [GOOGLE AI OVERVIEW CLASSIFICATION] Skipping result ${result.id} - brand not mentioned`)
          skipped++
          continue
        }

        // Extract snippet around brand mention
        const snippet = extractSnippet(responseText, brand.name)
        const snippetHash = generateSnippetHash(brand.name, snippet)

        // Check if we've already classified this snippet
        if (result.google_ai_overview_snippet_hash === snippetHash) {
          console.log(`⏭️ [GOOGLE AI OVERVIEW CLASSIFICATION] Skipping result ${result.id} - already classified (hash match)`)
          skipped++
          continue
        }

        console.log(`🔍 [GOOGLE AI OVERVIEW CLASSIFICATION] Classifying result ${result.id} for brand: ${brand.name}`)

        // Classify the portrayal
        const classification = await classifyPortrayal(brand.name, snippet)

        // Update the result with classification
        const { error: updateError } = await supabase
          .from('prompt_results')
          .update({
            google_ai_overview_portrayal_type: classification.category,
            google_ai_overview_portrayal_confidence: classification.confidence,
            google_ai_overview_classifier_stage: 'llm',
            google_ai_overview_classifier_version: '1.0',
            google_ai_overview_snippet_hash: snippetHash
          })
          .eq('id', result.id)

        if (updateError) {
          console.error(`❌ [GOOGLE AI OVERVIEW CLASSIFICATION] Error updating result ${result.id}:`, updateError)
          errors.push(`Result ${result.id}: ${updateError.message}`)
        } else {
          console.log(`✅ [GOOGLE AI OVERVIEW CLASSIFICATION] Classified result ${result.id}: ${classification.category} (${classification.confidence})`)
          processed++
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100))

      } catch (error) {
        console.error(`❌ [GOOGLE AI OVERVIEW CLASSIFICATION] Error processing result ${result.id}:`, error)
        errors.push(`Result ${result.id}: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }

    console.log(`🎉 [GOOGLE AI OVERVIEW CLASSIFICATION] Completed! Processed: ${processed}, Skipped: ${skipped}, Errors: ${errors.length}`)

    return NextResponse.json({
      success: true,
      processed,
      skipped,
      errors
    })

  } catch (error) {
    console.error('❌ [GOOGLE AI OVERVIEW CLASSIFICATION] Unexpected error:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 })
  }
}
