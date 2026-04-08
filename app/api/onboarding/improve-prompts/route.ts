import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import OpenAI from 'openai'

interface BrandPrompt {
  id: string
  brand_id: string
  source_template_code: string
  raw_prompt: string
  improved_prompt?: string
  category?: string
  generation_metadata?: Record<string, any>
  status: string
}

interface ImproveResult {
  improved: string
  genericity_score: number  // 1=very specific, 5=too generic
  quality_note: string      // 'ok' | 'vague' | 'robotic' | 'duplicate_risk' | 'good'
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const improvePrompt = async (openai: OpenAI, rawPrompt: string): Promise<ImproveResult> => {
  const systemMessage = 'You are a quality controller for AI search prompts. Return only valid JSON.'

  const userMessage = `Lightly improve this search prompt for naturalness and quality. Keep the meaning intact.

Allowed changes:
1. Fix grammar and typos
2. Make phrasing sound more like a real ChatGPT user — conversational, goal-focused
3. Remove robotic or marketing-style language
4. Tighten verbose phrasing without losing specificity

Not allowed:
- Changing the topic, intent, or core meaning
- Adding brand names, product names, or competitors
- Rewriting from scratch
- Making it more generic

Prompt: "${rawPrompt}"

Return ONLY valid JSON:
{
  "improved": "the improved prompt text",
  "genericity_score": 2,
  "quality_note": "ok"
}

Where:
- genericity_score: 1–5 (1 = very specific and useful, 5 = so generic it could apply to anything)
- quality_note: one of "ok", "vague", "robotic", "duplicate_risk", "good"`

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.3,
      max_tokens: 200,
      response_format: { type: 'json_object' },
    })

    const raw = completion.choices[0]?.message?.content?.trim()
    if (!raw) throw new Error('No response from OpenAI')

    const parsed = JSON.parse(raw) as ImproveResult
    return {
      improved: typeof parsed.improved === 'string' && parsed.improved.trim() ? parsed.improved.trim() : rawPrompt,
      genericity_score: typeof parsed.genericity_score === 'number' ? parsed.genericity_score : 3,
      quality_note: typeof parsed.quality_note === 'string' ? parsed.quality_note : 'ok',
    }
  } catch (error) {
    console.error('Error improving prompt:', error)
    // Return original prompt on failure — don't block the whole flow
    return { improved: rawPrompt, genericity_score: 3, quality_note: 'ok' }
  }
}

// Token overlap deduplication — flags prompts sharing >60% meaningful word overlap
const flagNearDuplicates = async (
  supabase: any,
  brandId: string
): Promise<void> => {
  const { data: allPrompts } = await supabase
    .from('brand_prompts')
    .select('id, improved_prompt, generation_metadata')
    .eq('brand_id', brandId)
    .not('improved_prompt', 'is', null)
    .order('created_at', { ascending: true })

  if (!allPrompts?.length) return

  const seen: { id: string; words: Set<string> }[] = []
  const duplicateIds: string[] = []

  for (const p of allPrompts) {
    const text = (p.improved_prompt || '').toLowerCase()
    const words = new Set<string>(text.split(/\W+/).filter((w: string) => w.length > 3))

    const isDuplicate = seen.some(s => {
      const overlap = Array.from(words).filter(w => s.words.has(w)).length
      return overlap / Math.max(words.size, s.words.size) > 0.6
    })

    if (isDuplicate) {
      duplicateIds.push(p.id)
    } else {
      seen.push({ id: p.id, words })
    }
  }

  if (duplicateIds.length === 0) return

  console.log(`🔁 [IMPROVE PROMPTS] Flagging ${duplicateIds.length} near-duplicate prompts`)

  // Fetch existing metadata for duplicate prompts, merge flag in
  const { data: dupePrompts } = await supabase
    .from('brand_prompts')
    .select('id, generation_metadata')
    .in('id', duplicateIds)

  await Promise.all((dupePrompts || []).map((p: any) =>
    supabase.from('brand_prompts').update({
      generation_metadata: { ...(p.generation_metadata || {}), is_near_duplicate: true },
    }).eq('id', p.id)
  ))
}

export async function POST(request: NextRequest) {
  console.log('🔄 [IMPROVE PROMPTS API] Starting — timestamp:', new Date().toISOString())

  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const { brandId } = body

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ success: false, error: 'AI improvement service not configured' }, { status: 500 })
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

    const { data: pendingBrands, error: brandError } = await supabase
      .from('brands')
      .select('id, name, onboarding_answers, onboarding_completed, owner_user_id')
      .eq('owner_user_id', user.id)
      .eq('is_demo', false)
      .eq('onboarding_completed', false)
      .order('created_at', { ascending: false })
      .limit(1)

    if (brandError || !pendingBrands || pendingBrands.length === 0) {
      return NextResponse.json({ success: false, error: 'No pending brand found' }, { status: 404 })
    }

    const brand = pendingBrands[0]
    const brandName = brand.name || (brand.onboarding_answers as any)?.brandName || 'Your Brand'

    // Get all inactive prompts without improved versions yet
    const { data: draftPrompts, error: promptsError } = await supabase
      .from('brand_prompts')
      .select('id, brand_id, source_template_code, raw_prompt, improved_prompt, category, generation_metadata, status')
      .eq('brand_id', brand.id)
      .eq('status', 'inactive')
      .is('improved_prompt', null)
      .order('source_template_code')

    if (promptsError) {
      return NextResponse.json({ success: false, error: 'Failed to load prompts' }, { status: 500 })
    }

    if (!draftPrompts || draftPrompts.length === 0) {
      console.log('⚠️ [IMPROVE PROMPTS] No draft prompts to improve for brand:', brand.id)
      // Still return the existing prompts so the preview works
      const { data: existingPrompts } = await supabase
        .from('brand_prompts')
        .select('id, raw_prompt, improved_prompt, category, generation_metadata')
        .eq('brand_id', brand.id)
        .order('created_at', { ascending: true })

      return NextResponse.json({
        success: true,
        message: 'No draft prompts found to improve',
        improvedCount: 0,
        totalPrompts: existingPrompts?.length || 0,
        prompts: existingPrompts || [],
      })
    }

    console.log(`📝 [IMPROVE PROMPTS] ${draftPrompts.length} prompts to improve for: ${brandName}`)

    let improvedCount = 0
    let errorCount = 0
    const batchSize = 5
    const delayBetweenBatches = 2000

    for (let i = 0; i < draftPrompts.length; i += batchSize) {
      const batch = draftPrompts.slice(i, i + batchSize)

      const batchResults = await Promise.all(batch.map(async (prompt: BrandPrompt) => {
        try {
          const result = await improvePrompt(openai, prompt.raw_prompt)

          const mergedMetadata = {
            ...(prompt.generation_metadata || {}),
            genericity_score: result.genericity_score,
            quality_note: result.quality_note,
          }

          const { error: updateError } = await supabase
            .from('brand_prompts')
            .update({ improved_prompt: result.improved, generation_metadata: mergedMetadata })
            .eq('id', prompt.id)

          if (updateError) {
            console.error(`Error updating prompt ${prompt.id}:`, updateError)
            return { success: false }
          }

          return { success: true }
        } catch (error) {
          console.error(`Error improving prompt ${prompt.id}:`, error)
          return { success: false }
        }
      }))

      batchResults.forEach(r => r.success ? improvedCount++ : errorCount++)

      if (i + batchSize < draftPrompts.length) {
        await delay(delayBetweenBatches)
      }
    }

    console.log(`✅ [IMPROVE PROMPTS] ${improvedCount} improved, ${errorCount} errors`)

    // Near-duplicate detection pass
    await flagNearDuplicates(supabase, brand.id)

    // Return final prompts for the preview step
    const { data: finalPrompts } = await supabase
      .from('brand_prompts')
      .select('id, raw_prompt, improved_prompt, category, generation_metadata')
      .eq('brand_id', brand.id)
      .order('created_at', { ascending: true })

    return NextResponse.json({
      success: true,
      message: `Successfully improved ${improvedCount} prompts`,
      improvedCount,
      errorCount,
      totalPrompts: finalPrompts?.length || 0,
      prompts: finalPrompts || [],
      brandName,
    })

  } catch (error) {
    console.error('❌ [IMPROVE PROMPTS] Error:', error)
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 })
  }
}
