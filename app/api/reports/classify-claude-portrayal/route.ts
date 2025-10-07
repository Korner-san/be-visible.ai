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

// Call GPT-mini for classification (same as Perplexity classification)
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
      max_tokens: 50,
      temperature: 0,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0
    })
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`OpenAI API error: ${response.status} ${errorText}`)
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content?.trim()
  
  if (!content) {
    throw new Error('No content in OpenAI response')
  }

  try {
    const result = JSON.parse(content)
    if (!result.category || typeof result.confidence !== 'number') {
      throw new Error('Invalid classification result format')
    }
    return result
  } catch (parseError) {
    throw new Error(`Failed to parse classification result: ${content}`)
  }
}

export async function POST(request: NextRequest) {
  try {
    const { brandId, fromCron = false, dailyReportId } = await request.json()
    
    console.log('🤖 [CLAUDE PORTRAYAL CLASSIFICATION] Starting Claude portrayal classification for brand:', brandId)
    
    const supabase = createServiceClient()
    
    // Get brand info
    const { data: brand, error: brandError } = await supabase
      .from('brands')
      .select('id, name')
      .eq('id', brandId)
      .single()

    if (brandError || !brand) {
      return NextResponse.json(
        { error: 'Brand not found' },
        { status: 404 }
      )
    }

    // Build query for unclassified Claude results
    let query = supabase
      .from('prompt_results')
      .select(`
        id,
        claude_response,
        claude_classifier_stage,
        claude_classifier_version,
        claude_snippet_hash,
        daily_report_id,
        daily_reports!inner(
          brand_id,
          brands!inner(name)
        )
      `)
      .eq('daily_reports.brand_id', brandId)
      .not('claude_response', 'is', null) // Only process results with Claude responses
      .neq('claude_classifier_stage', 'llm') // Only process if not LLM classified

    // If specific daily report ID provided, only process that report
    if (dailyReportId) {
      query = query.eq('daily_report_id', dailyReportId)
    }

    const { data: unclassifiedResults, error: queryError } = await query

    if (queryError) {
      console.error('❌ [CLAUDE PORTRAYAL CLASSIFICATION] Query error:', queryError)
      return NextResponse.json(
        { error: 'Failed to fetch unclassified results' },
        { status: 500 }
      )
    }

    if (!unclassifiedResults || unclassifiedResults.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No unclassified Claude results found',
        processed: 0,
        skipped: 0
      })
    }

    console.log(`📊 [CLAUDE PORTRAYAL CLASSIFICATION] Found ${unclassifiedResults.length} unclassified Claude results`)

    const classifierVersion = 'claude-v1.0'
    let processed = 0
    let skipped = 0
    const errors = []

    for (const result of unclassifiedResults) {
      try {
        // Extract snippet
        const snippet = extractSnippet(result.claude_response, brand.name)
        const snippetHash = generateSnippetHash(brand.name, snippet)
        
        // Check if we've already classified this snippet
        if (result.claude_snippet_hash === snippetHash && result.claude_classifier_version === classifierVersion) {
          console.log(`⏭️ [CLAUDE PORTRAYAL CLASSIFICATION] Skipping already classified snippet for result ${result.id}`)
          skipped++
          continue
        }

        // Classify with LLM
        const classification = await classifyPortrayal(brand.name, snippet)
        
        // Update the result
        const { error: updateError } = await supabase
          .from('prompt_results')
          .update({
            claude_portrayal_type: classification.category,
            claude_portrayal_confidence: classification.confidence,
            claude_classifier_stage: 'llm',
            claude_classifier_version: classifierVersion,
            claude_snippet_hash: snippetHash
          })
          .eq('id', result.id)

        if (updateError) {
          console.error(`❌ [CLAUDE PORTRAYAL CLASSIFICATION] Error updating result ${result.id}:`, updateError)
          errors.push(`Failed to update result ${result.id}: ${updateError.message}`)
          continue
        }

        console.log(`✅ [CLAUDE PORTRAYAL CLASSIFICATION] Classified result ${result.id}: ${classification.category} (${classification.confidence})`)
        processed++

        // Add small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100))

      } catch (error) {
        console.error(`❌ [CLAUDE PORTRAYAL CLASSIFICATION] Error processing result ${result.id}:`, error)
        errors.push(`Failed to process result ${result.id}: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }

    console.log(`🎉 [CLAUDE PORTRAYAL CLASSIFICATION] Completed! Processed: ${processed}, Skipped: ${skipped}, Errors: ${errors.length}`)

    return NextResponse.json({
      success: true,
      message: 'Claude portrayal classification completed',
      processed,
      skipped,
      errors: errors.length > 0 ? errors : undefined
    })

  } catch (error) {
    console.error('❌ [CLAUDE PORTRAYAL CLASSIFICATION] Unexpected error:', error)
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
