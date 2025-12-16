import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  console.log('🔄 [GET PROMPTS API] Starting get prompts request')
  console.log('🔄 [GET PROMPTS API] Timestamp:', new Date().toISOString())

  try {
    const supabase = await createClient()

    // Get current user
    console.log('🔍 [GET PROMPTS API] Getting user from server auth...')
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    console.log('📊 [GET PROMPTS API] Auth result:', {
      hasUser: !!user,
      userId: user?.id,
      userEmail: user?.email,
      authError: authError?.message
    })

    if (authError || !user) {
      console.error('❌ [GET PROMPTS API] Auth failed:', authError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's pending brand
    console.log('🔍 [GET PROMPTS API] Looking for pending brand for user:', user.id)
    const { data: pendingBrands, error: brandError } = await supabase
      .from('brands')
      .select('*')
      .eq('owner_user_id', user.id)
      .eq('is_demo', false)
      .eq('onboarding_completed', false)
      .order('created_at', { ascending: false })
      .limit(1)

    console.log('📊 [GET PROMPTS API] Brand query result:', {
      pendingBrandsCount: pendingBrands?.length || 0,
      brandError: brandError?.message,
      brands: pendingBrands?.map(b => ({
        id: b.id,
        name: b.name,
        onboarding_completed: b.onboarding_completed
      }))
    })

    if (brandError || !pendingBrands || pendingBrands.length === 0) {
      console.error('❌ [GET PROMPTS API] No pending brand found for user:', user.id)
      return NextResponse.json({ error: 'No pending brand found' }, { status: 404 })
    }

    const brand = pendingBrands[0]
    console.log('✅ [GET PROMPTS API] Found pending brand:', brand.id)

    // Get generated prompts for this brand
    console.log('🔍 [GET PROMPTS API] Fetching prompts for brand:', brand.id)
    const { data: prompts, error: promptsError } = await supabase
      .from('brand_prompts')
      .select('*')
      .eq('brand_id', brand.id)
      .order('created_at', { ascending: true })

    console.log('📊 [GET PROMPTS API] Prompts query result:', {
      promptsCount: prompts?.length || 0,
      promptsError: promptsError?.message
    })

    if (promptsError) {
      console.error('❌ [GET PROMPTS API] Error fetching prompts:', promptsError)
      return NextResponse.json({ error: 'Failed to fetch prompts' }, { status: 500 })
    }

    // Get system prompt templates as fallback
    const { data: templates, error: templatesError } = await supabase
      .from('prompt_templates')
      .select('*')
      .order('created_at', { ascending: true })

    let systemPrompts: Array<{ id: string; text: string; improved?: string }> = []
    
    if (prompts && prompts.length > 0) {
      // Use generated prompts with IDs
      systemPrompts = prompts.map(p => ({
        id: p.id,
        text: p.improved_prompt || p.raw_prompt,
        improved: p.improved_prompt
      })).filter(p => p.text)
    } else if (templates && templates.length > 0) {
      // Use template prompts as fallback (no IDs available, will need to be created)
      systemPrompts = templates.map(t => ({
        id: t.id || '',
        text: t.template || '',
        improved: t.template
      })).filter(p => p.text)
    } else {
      // Fallback to some default prompts (no IDs, will be created)
      const defaultPrompts = [
        "What are the best {brandName} alternatives?",
        "How does {brandName} compare to competitors?",
        "What are the main features of {brandName}?",
        "Is {brandName} worth the price?",
        "What problems does {brandName} solve?",
        "How to use {brandName} effectively?",
        "What are users saying about {brandName}?",
        "Is {brandName} good for beginners?",
        "What are the pros and cons of {brandName}?",
        "How does {brandName} integrate with other tools?",
        "What industries use {brandName}?",
        "How reliable is {brandName}?",
        "What support does {brandName} offer?",
        "How to get started with {brandName}?",
        "What makes {brandName} different?"
      ]
      systemPrompts = defaultPrompts.map(text => ({
        id: '',
        text,
        improved: text
      }))
    }

    const successResponse = {
      success: true,
      brandId: brand.id,
      customPrompts: [], // User can add custom prompts
      systemPrompts: systemPrompts
    }

    console.log('✅ [GET PROMPTS API] Returning success response:', {
      brandId: brand.id,
      customPromptsCount: 0,
      systemPromptsCount: systemPrompts.length
    })

    return NextResponse.json(successResponse)

  } catch (error) {
    console.error('❌ [GET PROMPTS API] Unexpected error:', error)
    console.error('❌ [GET PROMPTS API] Error stack:', error instanceof Error ? error.stack : 'No stack trace')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
