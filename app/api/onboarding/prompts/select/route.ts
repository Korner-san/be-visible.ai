import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const { brandId, selectedPromptIds } = await request.json()

    if (!brandId || !selectedPromptIds || !Array.isArray(selectedPromptIds)) {
      return NextResponse.json({
        success: false,
        error: 'Brand ID and selected prompt IDs are required'
      }, { status: 400 })
    }

    if (selectedPromptIds.length === 0 || selectedPromptIds.length > 15) {
      return NextResponse.json({
        success: false,
        error: 'Between 1 and 15 prompts must be selected'
      }, { status: 400 })
    }

    // Get user from server-side auth
    const supabase = createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({
        success: false,
        error: 'Unauthorized'
      }, { status: 401 })
    }

    console.log('🔄 [SELECT PROMPTS] Processing selection for user:', user.id, 'brand:', brandId)

    // Verify user owns this brand and it's not completed yet
    const { data: brand, error: brandError } = await supabase
      .from('brands')
      .select('id, name, onboarding_completed')
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

    if (brand.onboarding_completed) {
      return NextResponse.json({
        success: false,
        error: 'Onboarding already completed for this brand'
      }, { status: 400 })
    }

    // Verify all selected prompts belong to this brand and are in improved status
    const { data: existingPrompts, error: promptsError } = await supabase
      .from('brand_prompts')
      .select('id, status')
      .eq('brand_id', brandId)
      .in('id', selectedPromptIds)

    if (promptsError) {
      console.error('Error verifying prompts:', promptsError)
      return NextResponse.json({
        success: false,
        error: 'Failed to verify selected prompts'
      }, { status: 500 })
    }

    if (!existingPrompts || existingPrompts.length !== selectedPromptIds.length) {
      return NextResponse.json({
        success: false,
        error: 'Some selected prompts are invalid or do not belong to this brand'
      }, { status: 400 })
    }

    // First, set all prompts for this brand to inactive
    const { error: resetError } = await supabase
      .from('brand_prompts')
      .update({ 
        status: 'inactive',
        updated_at: new Date().toISOString()
      })
      .eq('brand_id', brandId)

    if (resetError) {
      console.error('Error resetting all prompts to inactive:', resetError)
      return NextResponse.json({
        success: false,
        error: 'Failed to reset prompt statuses'
      }, { status: 500 })
    }

    // Then set selected prompts to 'active' status
    const { data: updatedPrompts, error: updateError } = await supabase
      .from('brand_prompts')
      .update({ 
        status: 'active',
        updated_at: new Date().toISOString()
      })
      .eq('brand_id', brandId)
      .in('id', selectedPromptIds)
      .select('id, source_template_code')

    if (updateError) {
      console.error('Error updating selected prompts:', updateError)
      return NextResponse.json({
        success: false,
        error: 'Failed to save prompt selections'
      }, { status: 500 })
    }

    // Verify exactly 15 prompts were updated
    if (!updatedPrompts || updatedPrompts.length !== 15) {
      console.error('Unexpected number of prompts updated:', updatedPrompts?.length)
      return NextResponse.json({
        success: false,
        error: 'Failed to update all selected prompts'
      }, { status: 500 })
    }

    console.log('✅ [SELECT PROMPTS] Successfully selected 15 prompts for brand:', brand.name)
    console.log('📊 [SELECT PROMPTS] Selected prompts:', updatedPrompts.map(p => p.source_template_code).sort())

    return NextResponse.json({
      success: true,
      message: 'Prompt selections saved successfully',
      selectedCount: updatedPrompts.length,
      brandName: brand.name,
      selectedPrompts: updatedPrompts.map(p => ({
        id: p.id,
        templateCode: p.source_template_code
      }))
    })

  } catch (error) {
    console.error('Error in prompt selection:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    }, { status: 500 })
  }
}