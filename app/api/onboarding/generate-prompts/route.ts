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
  businessSummary?: string
  businessLabel?: string
  marketScope?: string
  marketCountry?: string | null
}

interface GeneratedPrompt {
  rawPrompt: string
  category: string
  source: 'ai_generated'
}

const generatePromptsWithGPT = async (formData: OnboardingFormData): Promise<GeneratedPrompt[]> => {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const marketDescription = formData.marketScope === 'local' && formData.marketCountry
    ? `local (${formData.marketCountry})`
    : 'global'

  const structuredInput = `
Business Summary: ${formData.businessSummary || `${formData.brandName} is a company in the ${formData.industry} industry offering ${formData.productCategory}.`}
Business Label: ${formData.businessLabel || formData.productCategory}
Industry: ${formData.industry}
Product Category: ${formData.productCategory}
Problem Solved: ${formData.problemSolved}
Actions Helped: ${formData.tasksHelped.join(', ')}
Goal Facilitated: ${formData.goalFacilitated}
Key Features: ${formData.keyFeatures.join(', ')}
Use Cases: ${formData.useCases.join(', ')}
Market: ${marketDescription}
`.trim()

  const systemPrompt = `You are a prompt generator helping a brand appear in AI search results (e.g. ChatGPT or Perplexity).

Your goal: generate exactly 25 realistic search prompts or questions that people might type or say to an AI assistant — WITHOUT knowing this brand — but whose answers would logically include this brand.

Do NOT include the brand name or any competitor names in any prompt.

---
BRAND CONTEXT:
${structuredInput}

---
GENERATE EXACTLY 25 PROMPTS IN TWO PARTS:

PART 1 — "Best In Category" (exactly 5 prompts)
These are the most direct, obvious questions someone asks when searching for the best provider in this type of business.
Use the businessLabel and market info. Vary the phrasing using these patterns:
- "Who are the best [businessLabel]?"
- "What are the top [businessLabel]?"
- "Which companies offer the best [service in this category]?"
- "Who are the leading providers of [this type of solution]?"
- "What are the most reliable [businessLabel] available [in this market]?"
If market is local, include the country in some of the prompts (e.g. "in Germany", "in Israel").
Category for all 5: "Best In Category"
promptType for all 5: "Labeled"

PART 2 — Dynamic prompts (exactly 20 prompts)
For each prompt, derive a SPECIFIC category name from the actual topics of this business (e.g. "Build Performance", "Developer Productivity", "Material Sourcing"). Do NOT use generic labels like "Discovery" or "General".

Distribute the 20 prompts EXACTLY as follows:

5 CONVERSATIONAL — promptType: "Conversational"
Simulate a user mid-conversation with ChatGPT: 2-4 sentences, first-person, informal. They describe their specific situation and pain point before asking. No formal search query phrasing. Imperfect grammar is fine. Each must be different in situation and angle.

5 STANDARD-CHECK — promptType: "Standard Check"
Questions that check how things normally work in this field: "How does X typically work in this industry?", "What is the standard approach for Y?", "How do teams in [industry] usually handle Z?"

5 SOLUTION-LANDSCAPE — promptType: "Solution Landscape"
Questions about how solutions in the market address specific scenarios or use cases: "How do solutions in the market handle [use case from the provided list]?", "How do leading tools in this space approach [specific challenge]?"
Use the actual use cases and features provided above.

5 GOAL-ORIENTED — promptType: "Goal Oriented"
Questions about how tools or solutions help achieve specific goals: "How do [type of tools] help teams achieve [goal from the provided data]?", "What approaches help businesses reach [specific goal]?"
Use the actual goals and outcomes from the context above.

---
Return ONLY a valid JSON object with a "prompts" field containing an array of exactly 25 objects.
Each object must have: "prompt" (string), "category" (string), "promptType" (string).
No markdown, no code blocks, raw JSON only.`

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: "Generate the 25 prompts based on the brand context provided. Return only valid JSON." }
      ],
      temperature: 0.75,
      max_tokens: 4000,
      response_format: { type: "json_object" }
    })

    const response = completion.choices[0]?.message?.content?.trim()
    if (!response) throw new Error('No response from OpenAI')

    let cleanResponse = response.trim()
    if (cleanResponse.startsWith('```json')) {
      cleanResponse = cleanResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '')
    } else if (cleanResponse.startsWith('```')) {
      cleanResponse = cleanResponse.replace(/^```\s*/, '').replace(/\s*```$/, '')
    }

    console.log('🔧 [GPT RESPONSE] Raw response length:', response.length)
    console.log('🔧 [GPT RESPONSE] Raw first 200 chars:', response.substring(0, 200))

    let promptsData: any
    try {
      promptsData = JSON.parse(cleanResponse)
    } catch (parseError) {
      console.error('❌ [GPT RESPONSE] JSON parse failed:', parseError)
      throw new Error(`Failed to parse GPT response as JSON`)
    }

    if (!promptsData?.prompts || !Array.isArray(promptsData.prompts)) {
      throw new Error('GPT response missing prompts array')
    }

    const generatedPrompts: GeneratedPrompt[] = promptsData.prompts.map((item: any, index: number) => {
      if (!item.prompt || typeof item.prompt !== 'string') {
        throw new Error(`Invalid prompt at index ${index}`)
      }
      return {
        rawPrompt: item.prompt,
        category: item.category || 'General',
        source: 'ai_generated' as const
      }
    })

    return generatedPrompts
  } catch (error) {
    console.error('Error generating prompts with GPT:', error)
    throw error
  }
}

const hasProblematicMentions = (prompt: string, brandName: string, competitors: string[]): boolean => {
  const lowerPrompt = prompt.toLowerCase()
  if (lowerPrompt.includes(brandName.toLowerCase())) return true
  return competitors.some(c => c.trim() && lowerPrompt.includes(c.toLowerCase()))
}

export async function POST(request: NextRequest) {
  console.log('🔄 [GENERATE PROMPTS API] Starting prompt generation request')

  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    console.log('🔄 [GENERATE PROMPTS] Starting generation for user:', user.id)

    const { data: pendingBrands, error: brandError } = await supabase
      .from('brands')
      .select('id, onboarding_answers, name, onboarding_completed, owner_user_id')
      .eq('owner_user_id', user.id)
      .eq('is_demo', false)
      .eq('onboarding_completed', false)
      .order('created_at', { ascending: false })
      .limit(1)

    if (brandError) {
      return NextResponse.json({ success: false, error: 'Database error while finding brand' }, { status: 500 })
    }

    if (!pendingBrands || pendingBrands.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No pending brand found. Please complete the onboarding form first.'
      }, { status: 404 })
    }

    const brand = pendingBrands[0]
    const onboardingAnswers = brand.onboarding_answers as OnboardingFormData

    if (!onboardingAnswers?.brandName) {
      return NextResponse.json({
        success: false,
        error: 'Onboarding answers not found. Please complete the form first.'
      }, { status: 400 })
    }

    console.log('🤖 [GENERATE PROMPTS API] Generating 25 prompts with GPT-4o...')
    console.log('🎯 [GENERATE PROMPTS] businessLabel:', onboardingAnswers.businessLabel)
    console.log('🎯 [GENERATE PROMPTS] marketScope:', onboardingAnswers.marketScope, onboardingAnswers.marketCountry)

    let generatedPrompts: GeneratedPrompt[]
    try {
      generatedPrompts = await generatePromptsWithGPT(onboardingAnswers)
    } catch (error) {
      return NextResponse.json({
        success: false,
        error: 'Failed to generate prompts with AI. Please try again.'
      }, { status: 500 })
    }

    console.log(`🎯 [GENERATE PROMPTS] Generated ${generatedPrompts.length} prompts`)

    const promptsToInsert = generatedPrompts.map((prompt, index) => ({
      brand_id: brand.id,
      source_template_code: `gpt_${index + 1}`,
      raw_prompt: prompt.rawPrompt,
      status: 'inactive' as const,
      category: prompt.category
    }))

    const { data: insertedPrompts, error: insertError } = await supabase
      .from('brand_prompts')
      .upsert(promptsToInsert, {
        onConflict: 'brand_id,raw_prompt',
        ignoreDuplicates: false
      })
      .select('id, source_template_code, raw_prompt, status')

    if (insertError) {
      console.error('❌ [GENERATE PROMPTS API] Error inserting prompts:', insertError)
      return NextResponse.json({ success: false, error: 'Failed to save generated prompts' }, { status: 500 })
    }

    const { count: totalPrompts } = await supabase
      .from('brand_prompts')
      .select('*', { count: 'exact', head: true })
      .eq('brand_id', brand.id)

    console.log(`✅ [GENERATE PROMPTS API] Done — ${insertedPrompts?.length || 0} prompts saved`)

    return NextResponse.json({
      success: true,
      message: 'Prompts generated successfully',
      totalPrompts: totalPrompts || 0,
      newPrompts: insertedPrompts?.length || 0,
      brandName: onboardingAnswers.brandName,
      brandId: brand.id
    })

  } catch (error) {
    console.error('❌ [GENERATE PROMPTS API] Unexpected error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    }, { status: 500 })
  }
}
