import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import {
  classifyPortrayal,
  extractSnippet,
  generateSnippetHash,
  getProviderResponseField,
  getProviderPortrayalField,
  getProviderClassifierStageField,
  getProviderSnippetHashField,
  getProviderConfidenceField,
  getProviderClassifierVersionField
} from '@/lib/classifiers/portrayal-classifier'
import { Provider, ACTIVE_PROVIDERS } from '@/types/domain/provider'

const CLASSIFIER_VERSION = 'v1'

/**
 * Unified classification endpoint for all providers
 * Replaces classify-portrayal, classify-claude-portrayal, classify-google-ai-overview-portrayal
 */
export async function POST(request: NextRequest) {
  try {
    const { brandId, provider = 'perplexity', fromCron = false, dailyReportId = null } = await request.json()
    
    console.log(`🔄 [CLASSIFICATION] Starting ${provider} classification for brand:`, brandId, fromCron ? '(from cron)' : '(manual)', dailyReportId ? `report: ${dailyReportId}` : '(all reports)')
    
    if (!brandId) {
      return NextResponse.json({
        success: false,
        error: 'Brand ID is required'
      }, { status: 400 })
    }

    if (!ACTIVE_PROVIDERS.includes(provider as Provider)) {
      return NextResponse.json({
        success: false,
        error: `Invalid provider: ${provider}. Must be one of: ${ACTIVE_PROVIDERS.join(', ')}`
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
      console.error(`❌ [CLASSIFICATION] Brand not found:`, brandError)
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

    // Get provider-specific field names
    const responseField = getProviderResponseField(provider as Provider)
    const portrayalField = getProviderPortrayalField(provider as Provider)
    const classifierStageField = getProviderClassifierStageField(provider as Provider)
    const snippetHashField = getProviderSnippetHashField(provider as Provider)
    const confidenceField = getProviderConfidenceField(provider as Provider)
    const versionField = getProviderClassifierVersionField(provider as Provider)

    // Build query for unclassified brand mentions
    let query = supabase
      .from('prompt_results')
      .select(`
        id,
        ${responseField},
        brand_mentioned,
        ${portrayalField},
        ${classifierStageField},
        ${versionField},
        ${snippetHashField},
        daily_report_id,
        provider,
        brand_prompts!inner(
          brand_id
        )
      `)
      .eq('brand_prompts.brand_id', brandId)
      .eq('brand_mentioned', true)
      .or(`${classifierStageField}.is.null,${classifierStageField}.neq.llm`)
      .eq('provider', provider)

    // If dailyReportId is provided, only process results from that specific report
    if (dailyReportId) {
      query = query.eq('daily_report_id', dailyReportId)
    }

    const { data: unclassifiedResults, error: resultsError } = await query

    if (resultsError) {
      console.error(`❌ [CLASSIFICATION] Error fetching results:`, resultsError)
      return NextResponse.json({
        success: false,
        error: 'Failed to fetch prompt results'
      }, { status: 500 })
    }

    if (!unclassifiedResults || unclassifiedResults.length === 0) {
      console.log(`ℹ️ [CLASSIFICATION] No unclassified ${provider} results found`)
      return NextResponse.json({
        success: true,
        message: `No unclassified ${provider} results found`,
        processed: 0,
        skipped: 0
      })
    }

    console.log(`📊 [CLASSIFICATION] Found ${unclassifiedResults.length} unclassified ${provider} results for brand: ${brand.name}`)

    let processed = 0
    let skipped = 0
    const errors: Array<{ id: string; error: string }> = []

    for (const result of unclassifiedResults) {
      const responseText = (result as any)[responseField]
      
      if (!responseText) {
        skipped++
        continue
      }

      const snippet = extractSnippet(responseText, brand.name)
      const snippetHash = generateSnippetHash(brand.name, snippet)

      // Check if already classified with same snippet
      const currentHash = (result as any)[snippetHashField]
      const currentStage = (result as any)[classifierStageField]
      
      if (currentHash === snippetHash && currentStage === 'llm') {
        skipped++
        continue
      }

      try {
        const classification = await classifyPortrayal(brand.name, snippet)

        const updateData: any = {}
        updateData[portrayalField] = classification.category
        updateData[confidenceField] = classification.confidence
        updateData[classifierStageField] = 'llm'
        updateData[versionField] = CLASSIFIER_VERSION
        updateData[snippetHashField] = snippetHash

        const { error: updateError } = await supabase
          .from('prompt_results')
          .update(updateData)
          .eq('id', result.id)

        if (updateError) {
          console.error(`❌ [CLASSIFICATION] Error updating result ${result.id}:`, updateError)
          errors.push({ id: result.id, error: updateError.message })
        } else {
          processed++
        }
      } catch (error) {
        console.error(`❌ [CLASSIFICATION] Error classifying result ${result.id}:`, error)
        errors.push({ id: result.id, error: (error as Error).message })
      }
    }

    console.log(`✅ [CLASSIFICATION] ${provider} classification complete - Processed: ${processed}, Skipped: ${skipped}, Errors: ${errors.length}`)

    return NextResponse.json({
      success: true,
      provider,
      processed,
      skipped,
      errors,
      classifierVersion: CLASSIFIER_VERSION
    })

  } catch (error) {
    console.error('❌ [CLASSIFICATION] Unexpected error:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 })
  }
}

