import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import OpenAI from 'openai'

interface BrandPrompt {
  id: string
  brand_id: string
  source_template_code: string
  raw_prompt: string
  improved_prompt?: string
  status: string
}

// Rate limiting helper
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// Improve a single prompt using ChatGPT
const improvePrompt = async (openai: OpenAI, rawPrompt: string, brandName: string): Promise<string> => {
  const improvementPrompt = `
You are a professional editor focused on light-touch improvements.

Your task: Make minimal edits to fix grammar and improve clarity ONLY. Do not change meaning or reframe the question.

Original query: "${rawPrompt}"

Guidelines:
1. Fix grammar errors and typos only
2. Improve sentence clarity without changing meaning
3. Keep the original structure and intent intact
4. Do not add, remove, or change any brand names, competitors, or specific details
5. If the query is already clear and grammatically correct, return it unchanged
6. Make minimal edits - only what's necessary for clarity

Respond with ONLY the corrected query text, no explanations or additional text.
`

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a professional editor focused on light-touch improvements. Fix only grammar and clarity issues without changing meaning. Always respond with only the corrected query text."
        },
        {
          role: "user",
          content: improvementPrompt
        }
      ],
      temperature: 0.3,
      max_tokens: 200,
    })

    const improvedPrompt = completion.choices[0]?.message?.content?.trim()
    
    if (!improvedPrompt) {
      throw new Error('No response from OpenAI')
    }

    return improvedPrompt
  } catch (error) {
    console.error('Error improving prompt:', error)
    throw error
  }
}

export async function POST(request: NextRequest) {
  console.log('🔄 [IMPROVE PROMPTS API] Starting prompt improvement request')
  console.log('🔄 [IMPROVE PROMPTS API] Timestamp:', new Date().toISOString())
  
  try {
    // Get user from server-side auth
    const supabase = await createClient()
    console.log('🔍 [IMPROVE PROMPTS API] Getting user from server auth...')
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    console.log('📊 [IMPROVE PROMPTS API] Auth result:', {
      hasUser: !!user,
      userId: user?.id,
      userEmail: user?.email,
      authError: authError?.message
    })
    
    if (authError || !user) {
      console.error('❌ [IMPROVE PROMPTS API] Auth failed:', authError)
      return NextResponse.json({
        success: false,
        error: 'Unauthorized'
      }, { status: 401 })
    }

    console.log('🔄 [IMPROVE PROMPTS] Starting improvement for user:', user.id)

    // Initialize OpenAI client
    console.log('🔍 [IMPROVE PROMPTS API] Checking OpenAI configuration...')
    if (!process.env.OPENAI_API_KEY) {
      console.error('❌ [IMPROVE PROMPTS API] OPENAI_API_KEY missing from environment variables')
      return NextResponse.json({
        success: false,
        error: 'AI improvement service not configured'
      }, { status: 500 })
    }

    console.log('✅ [IMPROVE PROMPTS API] OpenAI client initialized')
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })

    // Get the user's pending brand
    console.log('🔍 [IMPROVE PROMPTS API] Looking for pending brand for user:', user.id)
    const { data: pendingBrands, error: brandError } = await supabase
      .from('brands')
      .select('id, name, onboarding_answers, onboarding_completed, owner_user_id')
      .eq('owner_user_id', user.id)
      .eq('is_demo', false)
      .eq('onboarding_completed', false)
      .order('created_at', { ascending: false })
      .limit(1)

    console.log('📊 [IMPROVE PROMPTS API] Brand query result:', {
      pendingBrandsCount: pendingBrands?.length || 0,
      brandError: brandError?.message,
      brands: pendingBrands?.map(b => ({
        id: b.id,
        name: b.name,
        onboarding_completed: b.onboarding_completed,
        owner_user_id: b.owner_user_id
      }))
    })

    if (brandError || !pendingBrands || pendingBrands.length === 0) {
      console.error('❌ [IMPROVE PROMPTS API] No pending brand found for user:', user.id)
      return NextResponse.json({
        success: false,
        error: 'No pending brand found'
      }, { status: 404 })
    }

    const brand = pendingBrands[0]
    const brandName = brand.name || (brand.onboarding_answers as any)?.brandName || 'Your Brand'
    console.log('✅ [IMPROVE PROMPTS API] Found pending brand:', brand.id, 'name:', brandName)

    // Get all inactive prompts for this brand that don't have improved versions yet
    console.log('🔍 [IMPROVE PROMPTS API] Looking for inactive prompts for brand:', brand.id)
    const { data: draftPrompts, error: promptsError } = await supabase
      .from('brand_prompts')
      .select('id, brand_id, source_template_code, raw_prompt, improved_prompt, status')
      .eq('brand_id', brand.id)
      .eq('status', 'inactive')
      .is('improved_prompt', null)
      .order('source_template_code')

    console.log('📊 [IMPROVE PROMPTS API] Inactive prompts query result:', {
      draftPromptsCount: draftPrompts?.length || 0,
      promptsError: promptsError?.message,
      samplePrompts: draftPrompts?.slice(0, 3).map(p => ({
        id: p.id,
        templateCode: p.source_template_code,
        status: p.status,
        hasImprovedPrompt: !!p.improved_prompt
      }))
    })

    if (promptsError) {
      console.error('❌ [IMPROVE PROMPTS API] Error loading draft prompts:', promptsError)
      return NextResponse.json({
        success: false,
        error: 'Failed to load prompts'
      }, { status: 500 })
    }

    if (!draftPrompts || draftPrompts.length === 0) {
      console.log('⚠️ [IMPROVE PROMPTS API] No draft prompts found to improve for brand:', brand.id)
      return NextResponse.json({
        success: true,
        message: 'No draft prompts found to improve',
        improvedCount: 0,
        totalPrompts: 0
      })
    }

    console.log(`📝 [IMPROVE PROMPTS] Found ${draftPrompts.length} draft prompts to improve for brand: ${brandName}`)

    let improvedCount = 0
    let errorCount = 0
    const batchSize = 5 // Process in small batches to avoid rate limits
    const delayBetweenBatches = 2000 // 2 seconds between batches

    // Process prompts in batches
    for (let i = 0; i < draftPrompts.length; i += batchSize) {
      const batch = draftPrompts.slice(i, i + batchSize)
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`🔄 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(draftPrompts.length / batchSize)}`)
      }

      // Process batch concurrently
      const batchPromises = batch.map(async (prompt) => {
        try {
          const improvedPrompt = await improvePrompt(openai, prompt.raw_prompt, brandName)
          
          // Update the prompt in database
          const { error: updateError } = await supabase
            .from('brand_prompts')
            .update({
              improved_prompt: improvedPrompt
              // Keep status as 'inactive' - don't change it during improvement
            })
            .eq('id', prompt.id)

          if (updateError) {
            console.error(`Error updating prompt ${prompt.id}:`, updateError)
            return { success: false, error: updateError }
          }

          if (process.env.NODE_ENV === 'development') {
            console.log(`✅ Improved prompt ${prompt.source_template_code}: "${prompt.raw_prompt}" → "${improvedPrompt}"`)
          }

          return { success: true, promptId: prompt.id }
        } catch (error) {
          console.error(`Error improving prompt ${prompt.id}:`, error)
          return { success: false, error, promptId: prompt.id }
        }
      })

      // Wait for batch to complete
      const batchResults = await Promise.all(batchPromises)
      
      // Count results
      batchResults.forEach(result => {
        if (result.success) {
          improvedCount++
        } else {
          errorCount++
        }
      })

      // Delay between batches to respect rate limits
      if (i + batchSize < draftPrompts.length) {
        await delay(delayBetweenBatches)
      }
    }

    // Get final counts
    const { count: totalImproved } = await supabase
      .from('brand_prompts')
      .select('*', { count: 'exact', head: true })
      .eq('brand_id', brand.id)
      .eq('status', 'improved')

    const { count: totalPrompts } = await supabase
      .from('brand_prompts')
      .select('*', { count: 'exact', head: true })
      .eq('brand_id', brand.id)

    if (process.env.NODE_ENV === 'development') {
      console.log(`✅ Improvement completed: ${improvedCount} improved, ${errorCount} errors`)
      console.log(`📊 Total improved prompts: ${totalImproved}, Total prompts: ${totalPrompts}`)
    }

    return NextResponse.json({
      success: true,
      message: `Successfully improved ${improvedCount} prompts`,
      improvedCount,
      errorCount,
      totalImproved: totalImproved || 0,
      totalPrompts: totalPrompts || 0,
      brandName
    })

  } catch (error) {
    console.error('Error in prompt improvement:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    }, { status: 500 })
  }
}
