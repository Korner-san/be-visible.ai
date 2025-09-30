import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient()
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's pending brand
    const { data: brand, error: brandError } = await supabase
      .from('brands')
      .select('*')
      .eq('owner_user_id', user.id)
      .eq('is_demo', false)
      .eq('onboarding_completed', false)
      .single()

    if (brandError || !brand) {
      return NextResponse.json({ error: 'No pending brand found' }, { status: 404 })
    }

    // Get generated prompts for this brand
    const { data: prompts, error: promptsError } = await supabase
      .from('brand_prompts')
      .select('*')
      .eq('brand_id', brand.id)
      .order('created_at', { ascending: true })

    if (promptsError) {
      console.error('Error fetching prompts:', promptsError)
      return NextResponse.json({ error: 'Failed to fetch prompts' }, { status: 500 })
    }

    // Get system prompt templates as fallback
    const { data: templates, error: templatesError } = await supabase
      .from('prompt_templates')
      .select('*')
      .order('created_at', { ascending: true })

    let systemPrompts: string[] = []
    
    if (prompts && prompts.length > 0) {
      // Use generated prompts
      systemPrompts = prompts.map(p => p.raw_prompt).filter(Boolean)
    } else if (templates && templates.length > 0) {
      // Use template prompts as fallback
      systemPrompts = templates.map(t => t.template).filter(Boolean)
    } else {
      // Fallback to some default prompts
      systemPrompts = [
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
    }

    return NextResponse.json({
      success: true,
      customPrompts: [], // User can add custom prompts
      systemPrompts: systemPrompts
    })

  } catch (error) {
    console.error('Error in get-prompts API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
