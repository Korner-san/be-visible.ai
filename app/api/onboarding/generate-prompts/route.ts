import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import OpenAI from 'openai'

interface OnboardingFormData {
  brandName: string
  industry: string
  productCategory: string
  problemSolved: string
  tasksHelped: string[]
  goalFacilitated: string
  keyFeatures: string[]
  useCases: string[]
  competitors: string[]
  uniqueSellingProps: string[]
}


interface GeneratedPrompt {
  rawPrompt: string
  category: string
  source: 'ai_generated'
}

// Generate discovery-focused prompts using GPT-4o
const generatePromptsWithGPT = async (formData: OnboardingFormData): Promise<GeneratedPrompt[]> => {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })

  // Create structured input exactly as you specified
  const structuredInput = `
Industry: ${formData.industry}
Product Category: ${formData.productCategory}
Problem Solved: ${formData.problemSolved}
Tasks Helped: ${formData.tasksHelped.join(', ')}
Goal Facilitated: ${formData.goalFacilitated}
Key Features: ${formData.keyFeatures.join(', ')}
Use Cases: ${formData.useCases.join(', ')}
Unique Selling Props: ${formData.uniqueSellingProps.join(', ')}
`

  // Use EXACT system prompt you provided
  const systemPrompt = `You are a prompt generator helping a brand appear in AI search results (e.g. ChatGPT or Perplexity).

Your goal is to come up with natural-sounding, curiosity-driven search questions that users might type *without knowing about the brand* — but whose answers would logically include this brand.

Do NOT include brand names or specific competitors.

Use the following brand information to understand what problems the product solves, who it helps, what features it offers, and where it fits:

${structuredInput}

Output 15–30 unique, realistic search prompts.

They should simulate questions a user might ask if they were trying to solve these problems or find tools in this category.

Return the response as a valid JSON object with a "prompts" field containing an array of objects with "prompt" and "category" fields. Do not wrap the JSON in markdown code blocks or any other formatting. Return only the raw JSON object.

Example format:
{
  "prompts": [
    {"prompt": "What are the best tools for...", "category": "Discovery"},
    {"prompt": "How to solve...", "category": "Problem Solving"}
  ]
}`

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: "Generate discovery-focused prompts based on the brand information provided. Return only valid JSON, no markdown formatting."
        }
      ],
      temperature: 0.7,
      max_tokens: 3000,
      response_format: { type: "json_object" }
    })

    const response = completion.choices[0]?.message?.content?.trim()
    
    if (!response) {
      throw new Error('No response from OpenAI')
    }

    // Clean and parse JSON response (handle markdown code blocks)
    let cleanResponse = response.trim()
    
    // Remove markdown code blocks if present
    if (cleanResponse.startsWith('```json')) {
      cleanResponse = cleanResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '')
    } else if (cleanResponse.startsWith('```')) {
      cleanResponse = cleanResponse.replace(/^```\s*/, '').replace(/\s*```$/, '')
    }
    
    console.log('🔧 [GPT RESPONSE] Raw response length:', response.length)
    console.log('🔧 [GPT RESPONSE] Raw first 200 chars:', response.substring(0, 200))
    console.log('🔧 [GPT RESPONSE] Cleaned response length:', cleanResponse.length)
    console.log('🔧 [GPT RESPONSE] Cleaned first 200 chars:', cleanResponse.substring(0, 200))
    
    let promptsData
    try {
      promptsData = JSON.parse(cleanResponse)
    } catch (parseError) {
      console.error('❌ [GPT RESPONSE] JSON parse failed:', parseError)
      console.error('❌ [GPT RESPONSE] Full cleaned response:', cleanResponse)
      throw new Error(`Failed to parse GPT response as JSON: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`)
    }
    
    // Validate the response structure
    if (typeof promptsData !== 'object' || !promptsData.prompts) {
      console.error('❌ [GPT RESPONSE] Response missing prompts field:', promptsData)
      throw new Error('GPT response missing prompts field')
    }
    
    if (!Array.isArray(promptsData.prompts)) {
      console.error('❌ [GPT RESPONSE] Prompts field is not an array:', typeof promptsData.prompts)
      throw new Error('GPT response prompts field is not an array')
    }
    
    // Convert to our format
    const generatedPrompts: GeneratedPrompt[] = promptsData.prompts.map((item: any, index: number) => {
      if (!item.prompt || typeof item.prompt !== 'string') {
        throw new Error(`Invalid prompt at index ${index}: missing or invalid prompt field`)
      }
      
      return {
        rawPrompt: item.prompt,
        category: item.category || 'Discovery',
        source: 'ai_generated' as const
      }
    })

    return generatedPrompts
  } catch (error) {
    console.error('Error generating prompts with GPT:', error)
    throw error
  }
}

// Quality control: Check for brand/competitor mentions
const hasProblematicMentions = (prompt: string, brandName: string, competitors: string[]): boolean => {
  const lowerPrompt = prompt.toLowerCase()
  const lowerBrand = brandName.toLowerCase()
  
  // Check for brand name
  if (lowerPrompt.includes(lowerBrand)) {
    return true
  }
  
  // Check for competitor names
  return competitors.some(competitor => 
    competitor.trim() && lowerPrompt.includes(competitor.toLowerCase())
  )
}


export async function POST(request: NextRequest) {
  console.log('🔄 [GENERATE PROMPTS API] Starting prompt generation request')
  console.log('🔄 [GENERATE PROMPTS API] Timestamp:', new Date().toISOString())
  
  try {
    // Get user from server-side auth
    const supabase = createClient()
    console.log('🔍 [GENERATE PROMPTS API] Getting user from server auth...')
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    console.log('📊 [GENERATE PROMPTS API] Auth result:', {
      hasUser: !!user,
      userId: user?.id,
      userEmail: user?.email,
      authError: authError?.message
    })
    
    if (authError || !user) {
      console.error('❌ [GENERATE PROMPTS API] Auth failed:', authError)
      return NextResponse.json({
        success: false,
        error: 'Unauthorized'
      }, { status: 401 })
    }

    console.log('🔄 [GENERATE PROMPTS] Starting generation for user:', user.id)

    // Get the user's pending brand and onboarding answers
    console.log('🔍 [GENERATE PROMPTS API] Looking for pending brand for user:', user.id)
    const { data: pendingBrands, error: brandError } = await supabase
      .from('brands')
      .select('id, onboarding_answers, name, onboarding_completed, owner_user_id')
      .eq('owner_user_id', user.id)
      .eq('is_demo', false)
      .eq('onboarding_completed', false)
      .order('created_at', { ascending: false })
      .limit(1)

    console.log('📊 [GENERATE PROMPTS API] Brand query result:', {
      pendingBrandsCount: pendingBrands?.length || 0,
      brandError: brandError?.message,
      brands: pendingBrands?.map(b => ({
        id: b.id,
        name: b.name,
        onboarding_completed: b.onboarding_completed,
        owner_user_id: b.owner_user_id,
        hasOnboardingAnswers: !!b.onboarding_answers
      }))
    })

    if (brandError) {
      console.error('❌ [GENERATE PROMPTS API] Error finding pending brand:', brandError)
      return NextResponse.json({
        success: false,
        error: 'Database error while finding brand'
      }, { status: 500 })
    }

    if (!pendingBrands || pendingBrands.length === 0) {
      console.error('❌ [GENERATE PROMPTS API] No pending brand found for user:', user.id)
      return NextResponse.json({
        success: false,
        error: 'No pending brand found. Please complete the onboarding form first.'
      }, { status: 404 })
    }

    const brand = pendingBrands[0]
    console.log('✅ [GENERATE PROMPTS API] Found pending brand:', brand.id)
    
    const onboardingAnswers = brand.onboarding_answers as OnboardingFormData
    console.log('📝 [GENERATE PROMPTS API] Onboarding answers check:', {
      hasOnboardingAnswers: !!onboardingAnswers,
      brandName: onboardingAnswers?.brandName,
      answersKeys: onboardingAnswers ? Object.keys(onboardingAnswers) : []
    })

    if (!onboardingAnswers || !onboardingAnswers.brandName) {
      console.error('❌ [GENERATE PROMPTS API] Missing onboarding answers for brand:', brand.id)
      return NextResponse.json({
        success: false,
        error: 'Onboarding answers not found. Please complete the form first.'
      }, { status: 400 })
    }

    // Generate discovery-focused prompts using GPT-4o
    console.log('🤖 [GENERATE PROMPTS API] Generating prompts with GPT-4o...')
    console.log('🎯 [GENERATE PROMPTS] Brand data:', {
      brandName: onboardingAnswers.brandName,
      tasksCount: onboardingAnswers.tasksHelped?.length || 0,
      featuresCount: onboardingAnswers.keyFeatures?.length || 0,
      useCasesCount: onboardingAnswers.useCases?.length || 0,
      competitorsCount: onboardingAnswers.competitors?.length || 0,
      uspsCount: onboardingAnswers.uniqueSellingProps?.length || 0
    })

    let generatedPrompts: GeneratedPrompt[]
    try {
      generatedPrompts = await generatePromptsWithGPT(onboardingAnswers)
    } catch (error) {
      console.error('❌ [GENERATE PROMPTS API] Error generating prompts with GPT:', error)
      return NextResponse.json({
        success: false,
        error: 'Failed to generate prompts with AI. Please try again.'
      }, { status: 500 })
    }

    console.log(`🎯 [GENERATE PROMPTS] Generated ${generatedPrompts.length} raw prompts`)

    // Upsert prompts into brand_prompts table (avoid duplicates)
    console.log('💾 [GENERATE PROMPTS API] Preparing to save prompts to database...')
    const promptsToInsert = generatedPrompts.map((prompt, index) => ({
      brand_id: brand.id,
      source_template_code: `gpt_${index + 1}`, // Use GPT-based template codes
      raw_prompt: prompt.rawPrompt,
      status: 'inactive' as const,
      category: prompt.category
    }))

    console.log('📊 [GENERATE PROMPTS API] Prompts to insert:', {
      count: promptsToInsert.length,
      brandId: brand.id,
      samplePrompts: promptsToInsert.slice(0, 3).map(p => ({
        templateCode: p.source_template_code,
        promptPreview: p.raw_prompt.substring(0, 50) + '...'
      }))
    })

    // Use upsert to handle duplicates (based on unique constraint on brand_id + raw_prompt)
    console.log('💾 [GENERATE PROMPTS API] Executing upsert to brand_prompts table...')
    const { data: insertedPrompts, error: insertError } = await supabase
      .from('brand_prompts')
      .upsert(promptsToInsert, {
        onConflict: 'brand_id,raw_prompt',
        ignoreDuplicates: false
      })
      .select('id, source_template_code, raw_prompt, status')

    console.log('📊 [GENERATE PROMPTS API] Upsert result:', {
      insertedCount: insertedPrompts?.length || 0,
      insertError: insertError?.message,
      sampleInserted: insertedPrompts?.slice(0, 3).map(p => ({
        id: p.id,
        templateCode: p.source_template_code,
        status: p.status
      }))
    })

    if (insertError) {
      console.error('❌ [GENERATE PROMPTS API] Error inserting prompts:', insertError)
      return NextResponse.json({
        success: false,
        error: 'Failed to save generated prompts'
      }, { status: 500 })
    }

    // Get final count of prompts for this brand
    console.log('🔍 [GENERATE PROMPTS API] Getting final prompt count for brand:', brand.id)
    const { count: totalPrompts } = await supabase
      .from('brand_prompts')
      .select('*', { count: 'exact', head: true })
      .eq('brand_id', brand.id)

    console.log(`✅ [GENERATE PROMPTS API] Generation complete:`, {
      brandId: brand.id,
      brandName: brand.name,
      upsertedPrompts: insertedPrompts?.length || 0,
      totalPromptsInDB: totalPrompts || 0
    })

    const successResponse = {
      success: true,
      message: 'Prompts generated successfully',
      totalPrompts: totalPrompts || 0,
      newPrompts: insertedPrompts?.length || 0,
      brandName: onboardingAnswers.brandName,
      brandId: brand.id
    }

    console.log('✅ [GENERATE PROMPTS API] Returning success response:', successResponse)

    return NextResponse.json(successResponse)

  } catch (error) {
    console.error('❌ [GENERATE PROMPTS API] Unexpected error in generation:', error)
    console.error('❌ [GENERATE PROMPTS API] Error stack:', error instanceof Error ? error.stack : 'No stack trace')
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    }, { status: 500 })
  }
}
