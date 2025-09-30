import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { selectedPrompts } = await request.json()

    if (!selectedPrompts || !Array.isArray(selectedPrompts)) {
      return NextResponse.json({ error: 'Invalid prompts data' }, { status: 400 })
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

    // Update existing prompts to inactive, then insert selected ones
    await supabase
      .from('brand_prompts')
      .update({ status: 'inactive' })
      .eq('brand_id', brand.id)

    // Insert selected prompts (use upsert to handle duplicates)
    const promptsToInsert = selectedPrompts.map((prompt: string) => ({
      brand_id: brand.id,
      raw_prompt: prompt,
      status: 'active',
      source: 'user_selected',
      created_at: new Date().toISOString()
    }))

    const { error: insertError } = await supabase
      .from('brand_prompts')
      .upsert(promptsToInsert, { 
        onConflict: 'brand_id,raw_prompt',
        ignoreDuplicates: false 
      })

    if (insertError) {
      console.error('Error inserting prompts:', insertError)
      return NextResponse.json({ error: 'Failed to save prompts' }, { status: 500 })
    }

    // Mark onboarding as completed
    const { error: updateError } = await supabase
      .from('brands')
      .update({ 
        onboarding_completed: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', brand.id)

    if (updateError) {
      console.error('Error updating brand completion:', updateError)
      return NextResponse.json({ error: 'Failed to complete onboarding' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'Prompts saved and onboarding completed'
    })

  } catch (error) {
    console.error('Error in save-prompts API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
