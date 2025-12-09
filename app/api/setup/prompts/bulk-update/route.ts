import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const { brandId, promptIds, status } = await request.json()

    if (!brandId || !promptIds || !Array.isArray(promptIds) || !status) {
      return NextResponse.json({
        success: false,
        error: 'Brand ID, prompt IDs array, and status are required'
      }, { status: 400 })
    }

    if (!['active', 'inactive'].includes(status)) {
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

    // Verify all prompts belong to this brand
    const { data: existingPrompts, error: promptsError } = await supabase
      .from('brand_prompts')
      .select('id')
      .eq('brand_id', brandId)
      .in('id', promptIds)

    if (promptsError) {
      console.error('Error verifying prompts:', promptsError)
      return NextResponse.json({
        success: false,
        error: 'Failed to verify prompts'
      }, { status: 500 })
    }

    if (!existingPrompts || existingPrompts.length !== promptIds.length) {
      return NextResponse.json({
        success: false,
        error: 'Some prompts do not belong to this brand or do not exist'
      }, { status: 400 })
    }

    // Special handling for 'active' status - ensure only 15 total active
    if (status === 'active') {
      // Count currently active prompts (excluding ones we're about to change)
      const { count: currentActiveCount, error: countError } = await supabase
        .from('brand_prompts')
        .select('*', { count: 'exact', head: true })
        .eq('brand_id', brandId)
        .eq('status', 'active')
        .not('id', 'in', `(${promptIds.join(',')})`)

      if (countError) {
        console.error('Error counting active prompts:', countError)
        return NextResponse.json({
          success: false,
          error: 'Failed to verify current active prompts'
        }, { status: 500 })
      }

      const totalActive = (currentActiveCount || 0) + promptIds.length
      if (totalActive > 15) {
        return NextResponse.json({
          success: false,
          error: `Cannot activate ${promptIds.length} prompts. This would result in ${totalActive} active prompts, but maximum is 15.`
        }, { status: 400 })
      }
    }

    // Update the prompts
    const { data: updatedPrompts, error: updateError } = await supabase
      .from('brand_prompts')
      .update({
        status,
        updated_at: new Date().toISOString()
      })
      .eq('brand_id', brandId)
      .in('id', promptIds)
      .select('id, source_template_code, status')

    if (updateError) {
      console.error('Error updating prompts:', updateError)
      return NextResponse.json({
        success: false,
        error: 'Failed to update prompts'
      }, { status: 500 })
    }

    console.log(`✅ [BULK UPDATE] Updated ${updatedPrompts?.length || 0} prompts to status '${status}' for brand: ${brand.name}`)

    return NextResponse.json({
      success: true,
      message: `Successfully updated ${updatedPrompts?.length || 0} prompts to ${status}`,
      updatedCount: updatedPrompts?.length || 0,
      brandName: brand.name,
      updatedPrompts: updatedPrompts?.map(p => ({
        id: p.id,
        templateCode: p.source_template_code,
        status: p.status
      }))
    })

  } catch (error) {
    console.error('Error in bulk prompt update:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    }, { status: 500 })
  }
}
