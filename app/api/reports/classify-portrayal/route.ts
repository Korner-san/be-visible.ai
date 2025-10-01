import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

// Fixed taxonomy slugs
const PORTRAYAL_CATEGORIES = [
  'RECOMMENDATION',
  'COMPARISON', 
  'PROBLEM_SOLVER',
  'FEATURE_BENEFIT',
  'NEUTRAL_DESCRIPTION',
  'AUTHORITY_REFERENCE',
  'USE_CASE',
  'OTHER'
] as const

type PortrayalCategory = typeof PORTRAYAL_CATEGORIES[number]

interface ClassificationResult {
  category: PortrayalCategory
  confidence: number
}

// Generate snippet hash for caching
function generateSnippetHash(brandName: string, snippet: string): string {
  const crypto = require('crypto')
  return crypto.createHash('sha256').update(`${brandName.toLowerCase()}|${snippet.toLowerCase()}`).digest('hex')
}

// Extract snippet around brand mention
function extractSnippet(text: string, brandName: string, maxLength: number = 800): string {
  const lowerText = text.toLowerCase()
  const lowerBrand = brandName.toLowerCase()
  
  // Find all brand mentions
  const mentions = []
  let index = lowerText.indexOf(lowerBrand)
  while (index !== -1) {
    mentions.push(index)
    index = lowerText.indexOf(lowerBrand, index + 1)
  }
  
  if (mentions.length === 0) return text.slice(0, maxLength)
  
  // Use the first mention as reference point
  const mentionIndex = mentions[0]
  
  // Extract context around the mention
  const start = Math.max(0, mentionIndex - 200)
  const end = Math.min(text.length, start + maxLength)
  
  return text.slice(start, end).trim()
}

// Call GPT-mini for classification
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

AUTHORITY_REFERENCE — cited as example/reference/benchmark/best practice.

USE_CASE — a scenario describing where the brand fits/is typically used.

OTHER — none of the above fits confidently.

Precedence rules:

If recommendation signals appear → RECOMMENDATION.

If "vs/compared to/alternative to" language appears → COMPARISON.

If a concrete pain + remedy is explicit → PROBLEM_SOLVER.
Else pick the best fit; if uncertain → OTHER.

Validation:

If the snippet does not mention the brand, return OTHER with confidence 0.

Output only JSON exactly in this shape:
{"category":"<ONE_SLUG>","confidence":<0..1>}`

  const userMessage = `Classify how the brand is portrayed in the snippet.
Return JSON only with keys category and confidence.

Brand: ${brandName}

Snippet (≤ ~800 characters, include the sentence with the mention):
"""
${snippet}
"""

Keep this instruction text identical across calls to maximize consistency and caching.`

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
      temperature: 0,
      top_p: 1,
      max_tokens: 50,
      response_format: { type: 'json_object' }
    })
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`OpenAI API error: ${response.status} ${errorText}`)
  }

  const data = await response.json()
  const content = data.choices[0]?.message?.content
  
  if (!content) {
    throw new Error('No response content from OpenAI')
  }

  try {
    const result = JSON.parse(content) as ClassificationResult
    
    // Validate the result
    if (!PORTRAYAL_CATEGORIES.includes(result.category as PortrayalCategory)) {
      throw new Error(`Invalid category: ${result.category}`)
    }
    
    if (typeof result.confidence !== 'number' || result.confidence < 0 || result.confidence > 1) {
      throw new Error(`Invalid confidence: ${result.confidence}`)
    }
    
    return result
  } catch (error) {
    console.error('Failed to parse classification result:', content, error)
    throw new Error('Invalid JSON response from OpenAI')
  }
}

export async function POST(request: NextRequest) {
  try {
    const { brandId, fromCron = false, dailyReportId = null } = await request.json()
    
    console.log('🔄 [PORTRAYAL CLASSIFICATION] Starting LLM classification for brand:', brandId, fromCron ? '(from cron)' : '(manual)', dailyReportId ? `report: ${dailyReportId}` : '(all reports)')
    
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

    // Get brand info
    const { data: brand, error: brandError } = await supabase
      .from('brands')
      .select('id, name, owner_user_id')
      .eq('id', brandId)
      .single()

    if (brandError || !brand) {
      console.error('❌ [PORTRAYAL CLASSIFICATION] Brand not found:', brandError)
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

    // Build query for unclassified brand mentions
    let query = supabase
      .from('prompt_results')
      .select(`
        id,
        perplexity_response,
        brand_mentioned,
        portrayal_type,
        classifier_stage,
        classifier_version,
        snippet_hash,
        daily_report_id,
        brand_prompts!inner(
          brand_id
        )
      `)
      .eq('brand_prompts.brand_id', brandId)
      .eq('brand_mentioned', true)
      .neq('classifier_stage', 'llm')

    // If dailyReportId is provided, only process results from that specific report
    if (dailyReportId) {
      query = query.eq('daily_report_id', dailyReportId)
    }

    const { data: unclassifiedResults, error: resultsError } = await query

    if (resultsError) {
      console.error('❌ [PORTRAYAL CLASSIFICATION] Error fetching results:', resultsError)
      return NextResponse.json({
        success: false,
        error: 'Failed to fetch prompt results'
      }, { status: 500 })
    }

    if (!unclassifiedResults || unclassifiedResults.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No unclassified results found',
        processed: 0,
        skipped: 0
      })
    }

    console.log(`📊 [PORTRAYAL CLASSIFICATION] Found ${unclassifiedResults.length} unclassified results for brand: ${brand.name}`)

    const classifierVersion = 'v1'
    let processed = 0
    let skipped = 0
    const errors = []

    for (const result of unclassifiedResults) {
      try {
        // Extract snippet
        const snippet = extractSnippet(result.perplexity_response, brand.name)
        const snippetHash = generateSnippetHash(brand.name, snippet)
        
        // Check if we've already classified this snippet
        if (result.snippet_hash === snippetHash && result.classifier_version === classifierVersion) {
          console.log(`⏭️ [PORTRAYAL CLASSIFICATION] Skipping already classified snippet for result ${result.id}`)
          skipped++
          continue
        }

        // Classify with LLM
        const classification = await classifyPortrayal(brand.name, snippet)
        
        // Update the result
        const { error: updateError } = await supabase
          .from('prompt_results')
          .update({
            portrayal_type: classification.category,
            portrayal_confidence: classification.confidence,
            classifier_stage: 'llm',
            classifier_version: classifierVersion,
            snippet_hash: snippetHash
          })
          .eq('id', result.id)

        if (updateError) {
          console.error(`❌ [PORTRAYAL CLASSIFICATION] Error updating result ${result.id}:`, updateError)
          errors.push(`Failed to update result ${result.id}: ${updateError.message}`)
          continue
        }

        console.log(`✅ [PORTRAYAL CLASSIFICATION] Classified result ${result.id}: ${classification.category} (${classification.confidence})`)
        processed++

        // Add small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100))

      } catch (error) {
        console.error(`❌ [PORTRAYAL CLASSIFICATION] Error processing result ${result.id}:`, error)
        errors.push(`Failed to process result ${result.id}: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }

    console.log(`🎉 [PORTRAYAL CLASSIFICATION] Completed! Processed: ${processed}, Skipped: ${skipped}, Errors: ${errors.length}`)

    return NextResponse.json({
      success: true,
      processed,
      skipped,
      errors: errors.length > 0 ? errors : undefined,
      classifierVersion
    })

  } catch (error) {
    console.error('❌ [PORTRAYAL CLASSIFICATION] Unexpected error:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 })
  }
}
