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
  competitors: Array<string | { name: string; domain?: string }>
  uniqueSellingProps: string[]
  // Rich fields from website scan
  businessSummary?: string
  coreFunction?: string
  industryKeywords?: string[]
  businessLabel?: string
  businessType?: string   // 'saas_platform' | 'agency_service' | 'local_service' | 'ecommerce' | 'other'
  marketScope?: string    // 'local' | 'global'
  marketCountry?: string | null
}

interface GeneratedPrompt {
  rawPrompt: string
  category: string
  intentType: string
  source: 'ai_generated'
}

// Prompt families adapt to business type
const getPromptFamilies = (businessType: string, marketScope: string, country: string | null): string => {
  const geo = country ? ` in ${country}` : ''

  if (businessType === 'saas_platform') {
    return `Family 1 — Problem/Discovery (6 prompts): Users trying to find a tool or solution category for a specific problem
Family 2 — Comparison/Evaluation (6 prompts): Users comparing tools, platforms, or approaches in this category
Family 3 — Implementation/Integration (6 prompts): Users trying to get a tool to work with their stack, workflow, or team
Family 4 — Constraint-based (6 prompts): Users with real practical constraints — budget, team size, scale, reliability, compliance
Family 5 — Expert/Advanced (6 prompts): Experienced users seeking best practices, deeper solutions, or advanced use cases`
  }

  if (businessType === 'agency_service') {
    return `Family 1 — Service Discovery (6 prompts): Who provides this type of service? What type of service exists for this need?
Family 2 — Provider Comparison (6 prompts): Agency vs freelancer, in-house vs outsourced, comparing provider types
Family 3 — Budget/Scope (6 prompts): Cost, timeline, and scope questions for this type of service
Family 4 — Industry-specific (6 prompts): This service applied to a specific industry, audience, or business context
Family 5 — Outcome/Trust (6 prompts): How to evaluate, vet, or choose a provider — quality signals, reviews, credentials`
  }

  if (businessType === 'local_service') {
    return `Family 1 — Location-based Discovery (6 prompts): Finding this service${geo} — "best X near me" or "X in [city]" style
Family 2 — Provider Comparison (6 prompts): Comparing local options, chains vs independent, quality vs price tradeoffs
Family 3 — Urgency/Price (6 prompts): Affordable, fast, or emergency versions of this service${geo}
Family 4 — Trust/Quality (6 prompts): Reviews, reliability, certifications, or safety signals for this service type
Family 5 — Situation-specific (6 prompts): This service for a specific personal situation, life stage, condition, or need`
  }

  if (businessType === 'ecommerce') {
    return `Family 1 — Product Discovery (6 prompts): Finding the right product type for a specific need or use
Family 2 — Comparison (6 prompts): Product vs product, brand comparisons, material or spec tradeoffs
Family 3 — Budget/Value (6 prompts): Best product under a price point, budget picks, value recommendations
Family 4 — Use-case suitability (6 prompts): Best product for a specific activity, person type, or situation
Family 5 — Alternatives/Recommendations (6 prompts): What to buy recommendations, alternatives to known products`
  }

  // default / other
  return `Family 1 — Discovery (6 prompts): Users discovering this category of solution for the first time
Family 2 — Comparison (6 prompts): Users evaluating options within this category
Family 3 — Problem-solving (6 prompts): Users with a specific problem looking for how to solve it
Family 4 — Constraint-based (6 prompts): Users with budget, time, geography, or scale constraints
Family 5 — Expert guidance (6 prompts): Users looking for best practices, recommendations, or advanced approaches`
}

const generatePromptsWithGPT = async (formData: OnboardingFormData): Promise<GeneratedPrompt[]> => {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  // Normalize competitors to name strings (may come in as objects or strings)
  const competitorNames = (formData.competitors || [])
    .map((c: any) => typeof c === 'string' ? c.trim() : (c?.name || '').trim())
    .filter(Boolean)

  const businessType = formData.businessType || 'other'
  const marketScope = formData.marketScope || 'global'
  const marketCountry = formData.marketCountry || null

  const structuredInput = `BUSINESS SUMMARY: ${formData.businessSummary || '(not provided)'}
CORE FUNCTION: ${formData.coreFunction || '(not provided)'}
BUSINESS TYPE: ${formData.businessLabel || businessType} (${businessType})
MARKET: ${marketScope === 'local' ? `${marketCountry} (local)` : 'Global'}

Industry: ${formData.industry}
Product category: ${formData.productCategory}
Industry keywords: ${(formData.industryKeywords || []).join(', ') || '(none)'}

Problem solved: ${formData.problemSolved}
Tasks helped: ${(formData.tasksHelped || []).join(', ')}
Goal facilitated: ${formData.goalFacilitated}
Key features: ${(formData.keyFeatures || []).join(', ')}
Use cases: ${(formData.useCases || []).join(', ')}
Unique selling props: ${(formData.uniqueSellingProps || []).join(', ')}

Competitors (internal reference only — do NOT mention in prompts): ${competitorNames.join(', ') || 'none'}
Brand name (do NOT include in any prompt): ${formData.brandName || '(none)'}`

  const promptFamilies = getPromptFamilies(businessType, marketScope, marketCountry)

  const systemPrompt = `You are generating search prompts for a brand AI visibility tracking platform.

Mission: Generate EXACTLY 30 prompts that real users would type into ChatGPT when they have a need, problem, or question this business solves — WITHOUT knowing this brand exists. These prompts will be used to test whether this brand appears in AI answers.

${structuredInput}

Generate EXACTLY 30 prompts split across these 5 families of 6 prompts each:

${promptFamilies}

Realism rules:
- Write as a real person speaking to ChatGPT — conversational and goal-focused, not formal or academic
- Vary length: some short (5–8 words), some with context (up to 20 words)
- Include practical constraints in constraint-based prompts (specific budgets, team sizes, timelines, geographies)
- Use vocabulary from the industry keywords list — authentic domain language, not marketing copy
- NEVER include "${formData.brandName || 'the brand name'}" or any of these names: ${competitorNames.join(', ') || 'none'}
- Prefer user-goal phrasing over product-feature phrasing ("how do I track X" not "tool with X feature")
- Prompts should feel like real buying moments, research moments, or problem-solving moments

Return ONLY valid JSON, no markdown:
{
  "prompts": [
    {
      "prompt": "...",
      "category": "Family Name",
      "intent_type": "discovery|comparison|implementation|constraint|expert|local|transactional|troubleshooting"
    }
  ]
}`

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Generate the 30 prompts. Return only valid JSON.' },
      ],
      temperature: 0.7,
      max_tokens: 4500,
      response_format: { type: 'json_object' },
    })

    const raw = completion.choices[0]?.message?.content?.trim()
    if (!raw) throw new Error('No response from OpenAI')

    let cleanRaw = raw
    if (cleanRaw.startsWith('```json')) cleanRaw = cleanRaw.replace(/^```json\s*/, '').replace(/\s*```$/, '')
    else if (cleanRaw.startsWith('```')) cleanRaw = cleanRaw.replace(/^```\s*/, '').replace(/\s*```$/, '')

    console.log('🔧 [GPT RESPONSE] Raw length:', raw.length, '| First 200:', raw.substring(0, 200))

    let promptsData: any
    try {
      promptsData = JSON.parse(cleanRaw)
    } catch (parseError) {
      console.error('❌ [GPT RESPONSE] JSON parse failed:', parseError, '| Raw:', cleanRaw)
      throw new Error(`Failed to parse GPT response as JSON: ${parseError instanceof Error ? parseError.message : 'Unknown'}`)
    }

    if (!promptsData?.prompts || !Array.isArray(promptsData.prompts)) {
      throw new Error('GPT response missing prompts array')
    }

    return promptsData.prompts.map((item: any, index: number) => {
      if (!item.prompt || typeof item.prompt !== 'string') {
        throw new Error(`Invalid prompt at index ${index}`)
      }
      return {
        rawPrompt: item.prompt,
        category: item.category || 'Discovery',
        intentType: item.intent_type || 'discovery',
        source: 'ai_generated' as const,
      }
    })
  } catch (error) {
    console.error('Error generating prompts with GPT:', error)
    throw error
  }
}

export async function POST(request: NextRequest) {
  console.log('🔄 [GENERATE PROMPTS API] Starting — timestamp:', new Date().toISOString())

  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { data: pendingBrands, error: brandError } = await supabase
      .from('brands')
      .select('id, onboarding_answers, name, onboarding_completed, owner_user_id')
      .eq('owner_user_id', user.id)
      .eq('is_demo', false)
      .eq('onboarding_completed', false)
      .order('created_at', { ascending: false })
      .limit(1)

    if (brandError || !pendingBrands || pendingBrands.length === 0) {
      return NextResponse.json({ success: false, error: 'No pending brand found' }, { status: 404 })
    }

    const brand = pendingBrands[0]
    const onboardingAnswers = brand.onboarding_answers as OnboardingFormData

    if (!onboardingAnswers?.brandName) {
      return NextResponse.json({ success: false, error: 'Onboarding answers not found. Please complete the form first.' }, { status: 400 })
    }

    console.log('🎯 [GENERATE PROMPTS] Brand:', brand.id, '| Type:', onboardingAnswers.businessType, '| Market:', onboardingAnswers.marketScope)

    let generatedPrompts: GeneratedPrompt[]
    try {
      generatedPrompts = await generatePromptsWithGPT(onboardingAnswers)
    } catch (error) {
      console.error('❌ [GENERATE PROMPTS] GPT error:', error)
      return NextResponse.json({ success: false, error: 'Failed to generate prompts. Please try again.' }, { status: 500 })
    }

    console.log(`🎯 [GENERATE PROMPTS] Generated ${generatedPrompts.length} prompts`)

    const promptsToInsert = generatedPrompts.map((prompt, index) => ({
      brand_id: brand.id,
      source_template_code: `gpt_${index + 1}`,
      raw_prompt: prompt.rawPrompt,
      status: 'inactive' as const,
      category: prompt.category,
      generation_metadata: { intent_type: prompt.intentType, source: 'ai_generated' },
    }))

    const { data: insertedPrompts, error: insertError } = await supabase
      .from('brand_prompts')
      .upsert(promptsToInsert, { onConflict: 'brand_id,raw_prompt', ignoreDuplicates: false })
      .select('id, source_template_code, raw_prompt, status, category, generation_metadata')

    if (insertError) {
      console.error('❌ [GENERATE PROMPTS] Insert error:', insertError)
      return NextResponse.json({ success: false, error: 'Failed to save generated prompts' }, { status: 500 })
    }

    const { count: totalPrompts } = await supabase
      .from('brand_prompts')
      .select('*', { count: 'exact', head: true })
      .eq('brand_id', brand.id)

    console.log(`✅ [GENERATE PROMPTS] Done — ${insertedPrompts?.length || 0} upserted, ${totalPrompts} total`)

    return NextResponse.json({
      success: true,
      message: 'Prompts generated successfully',
      totalPrompts: totalPrompts || 0,
      newPrompts: insertedPrompts?.length || 0,
      prompts: insertedPrompts || [],
      brandName: onboardingAnswers.brandName,
      brandId: brand.id,
    })

  } catch (error) {
    console.error('❌ [GENERATE PROMPTS] Unexpected error:', error instanceof Error ? error.stack : error)
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 })
  }
}
