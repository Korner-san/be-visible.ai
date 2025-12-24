import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const { brandId, promptText, status } = await request.json()

    if (!brandId || !promptText) {
      return NextResponse.json({
        success: false,
        error: 'Brand ID and prompt text are required'
      }, { status: 400 })
    }

    if (status && !['active', 'inactive'].includes(status)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid status. Must be: active or inactive'
      }, { status: 400 })
    }

    // Get user from server-side auth
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({
        success: false,
        error: 'Unauthorized'
      }, { status: 401 })
    }

    // Verify user owns this brand
    const { data: brand, error: brandError } = await supabase
      .from('brands')
      .select('id, name')
      .eq('id', brandId)
      .eq('owner_user_id', user.id)
      .eq('is_demo', false)
      .single()

    if (brandError || !brand) {
      return NextResponse.json({
        success: false,
        error: 'Brand not found or access denied'
      }, { status: 404 })
    }

    // If status is 'active', check if we've reached the limit
    if (status === 'active') {
      const { count: currentActiveCount, error: countError } = await supabase
        .from('brand_prompts')
        .select('*', { count: 'exact', head: true })
        .eq('brand_id', brandId)
        .eq('status', 'active')

      if (countError) {
        console.error('Error counting active prompts:', countError)
        return NextResponse.json({
          success: false,
          error: 'Failed to verify current active prompts'
        }, { status: 500 })
      }

      if ((currentActiveCount || 0) >= 10) {
        return NextResponse.json({
          success: false,
          error: `Cannot activate prompt. You already have 10 active prompts (maximum allowed).`
        }, { status: 400 })
      }
    }

    // Get count of existing user-added prompts to generate unique template code
    const { count: userPromptCount, error: userCountError } = await supabase
      .from('brand_prompts')
      .select('*', { count: 'exact', head: true })
      .eq('brand_id', brandId)
      .like('source_template_code', 'user_custom_%')

    if (userCountError) {
      console.error('Error counting user prompts:', userCountError)
      return NextResponse.json({
        success: false,
        error: 'Failed to generate template code'
      }, { status: 500 })
    }

    const nextNumber = (userPromptCount || 0) + 1
    const templateCode = `user_custom_${nextNumber}`

    // Create the new prompt
    const { data: newPrompt, error: createError } = await supabase
      .from('brand_prompts')
      .insert({
        brand_id: brandId,
        source_template_code: templateCode,
        raw_prompt: promptText.trim(),
        improved_prompt: null,
        status: status || 'inactive',
        category: 'Custom',
        source: 'user_added',
        generation_metadata: {
          created_via: 'prompts_management_page',
          created_at: new Date().toISOString()
        }
      })
      .select('*')
      .single()

    if (createError) {
      console.error('Error creating prompt:', createError)
      return NextResponse.json({
        success: false,
        error: 'Failed to create prompt'
      }, { status: 500 })
    }

    console.log(`✅ [CREATE PROMPT] Created new prompt ${templateCode} for brand: ${brand.name}`)

    return NextResponse.json({
      success: true,
      message: `Successfully created new prompt`,
      prompt: newPrompt
    })

  } catch (error) {
    console.error('Error in create prompt API:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    }, { status: 500 })
  }
}
