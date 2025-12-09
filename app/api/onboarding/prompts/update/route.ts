import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface UpdatePromptRequest {
  promptId: string
  improvedPrompt: string
}

export async function POST(request: NextRequest) {
  try {
    const { promptId, improvedPrompt }: UpdatePromptRequest = await request.json()
    
    if (!promptId || !improvedPrompt) {
      return NextResponse.json({
        success: false,
        error: 'Prompt ID and improved prompt text are required'
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

    // Update the prompt (RLS will ensure user can only update their own prompts)
    const { data, error: updateError } = await supabase
      .from('brand_prompts')
      .update({
        improved_prompt: improvedPrompt.trim(),
        status: 'improved'
      })
      .eq('id', promptId)
      .select('id, improved_prompt, status')
      .single()

    if (updateError) {
      console.error('Error updating prompt:', updateError)
      return NextResponse.json({
        success: false,
        error: 'Failed to update prompt'
      }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({
        success: false,
        error: 'Prompt not found or access denied'
      }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      message: 'Prompt updated successfully',
      prompt: data
    })

  } catch (error) {
    console.error('Error in prompt update API:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    }, { status: 500 })
  }
}
