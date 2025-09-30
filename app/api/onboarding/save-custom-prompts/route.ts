import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface CustomPromptData {
  prompt: string
  hasWarning: boolean
}

export async function POST(request: NextRequest) {
  console.log('🔄 [SAVE CUSTOM PROMPTS API] Starting request')
  
  try {
    const { brandId, customPrompts } = await request.json()
    
    if (!brandId || !customPrompts || !Array.isArray(customPrompts)) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields'
      }, { status: 400 })
    }

    const supabase = createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({
        success: false,
        error: 'Unauthorized'
      }, { status: 401 })
    }

    // Verify brand ownership
    const { data: brand, error: brandError } = await supabase
      .from('brands')
      .select('id, owner_user_id')
      .eq('id', brandId)
      .eq('owner_user_id', user.id)
      .single()

    if (brandError || !brand) {
      return NextResponse.json({
        success: false,
        error: 'Brand not found or access denied'
      }, { status: 404 })
    }

    // Prepare custom prompts for insertion
    const promptsToInsert = customPrompts.map((promptData: CustomPromptData, index: number) => ({
      brand_id: brandId,
      source_template_code: `custom_${index + 1}`,
      raw_prompt: promptData.prompt,
      status: 'inactive' as const,
      category: 'Custom',
      source: 'user_added' as const,
      generation_metadata: {
        hasWarning: promptData.hasWarning,
        addedAt: new Date().toISOString()
      }
    }))

    console.log(`💾 [SAVE CUSTOM PROMPTS] Saving ${promptsToInsert.length} custom prompts for brand:`, brandId)

    // Insert custom prompts
    const { data: insertedPrompts, error: insertError } = await supabase
      .from('brand_prompts')
      .insert(promptsToInsert)
      .select()

    if (insertError) {
      console.error('❌ [SAVE CUSTOM PROMPTS] Error inserting prompts:', insertError)
      return NextResponse.json({
        success: false,
        error: 'Failed to save custom prompts'
      }, { status: 500 })
    }

    console.log(`✅ [SAVE CUSTOM PROMPTS] Successfully saved ${insertedPrompts?.length || 0} custom prompts`)

    return NextResponse.json({
      success: true,
      message: 'Custom prompts saved successfully',
      promptsCount: insertedPrompts?.length || 0
    })

  } catch (error) {
    console.error('❌ [SAVE CUSTOM PROMPTS API] Unexpected error:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 })
  }
}
