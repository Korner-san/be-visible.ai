import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { updateOnboardingAnswers } from '@/lib/supabase/user-state'

export async function POST(request: NextRequest) {
  console.log('🔄 [SAVE API] Starting onboarding save request')
  console.log('🔄 [SAVE API] Timestamp:', new Date().toISOString())
  
  try {
    const { answers } = await request.json()
    console.log('📝 [SAVE API] Received answers:', {
      hasAnswers: !!answers,
      brandName: answers?.brandName,
      website: answers?.website,
      answersKeys: answers ? Object.keys(answers) : []
    })
    
    if (!answers) {
      console.error('❌ [SAVE API] No answers provided')
      return NextResponse.json(
        { success: false, error: 'Answers are required' },
        { status: 400 }
      )
    }

    const supabase = createClient()
    
    // Get user from server-side auth (no client-provided brandId needed)
    console.log('🔍 [SAVE API] Getting user from server auth...')
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    console.log('📊 [SAVE API] Auth result:', { 
      hasUser: !!user, 
      userId: user?.id,
      userEmail: user?.email,
      authError: authError?.message 
    })
    
    if (authError || !user) {
      console.error('❌ [SAVE API] Auth failed:', authError)
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Server-side brand resolution - find the user's pending brand
    console.log('🔍 [SAVE API] Looking for pending brand for user:', user.id)
    const { data: pendingBrands, error: brandError } = await supabase
      .from('brands')
      .select('id, name, onboarding_completed, owner_user_id')
      .eq('owner_user_id', user.id)
      .eq('is_demo', false)
      .eq('onboarding_completed', false)
      .order('created_at', { ascending: false })
      .limit(1)

    console.log('📊 [SAVE API] Brand query result:', {
      pendingBrandsCount: pendingBrands?.length || 0,
      brandError: brandError?.message,
      brands: pendingBrands?.map(b => ({ 
        id: b.id, 
        name: b.name, 
        onboarding_completed: b.onboarding_completed,
        owner_user_id: b.owner_user_id
      }))
    })

    if (brandError) {
      console.error('❌ [SAVE API] Error finding pending brand:', brandError)
      return NextResponse.json(
        { success: false, error: 'Database error while finding brand' },
        { status: 500 }
      )
    }

    if (!pendingBrands || pendingBrands.length === 0) {
      console.error('❌ [SAVE API] No pending brand found for user:', user.id)
      return NextResponse.json(
        { success: false, error: 'We couldn\'t save your progress. Please try again.' },
        { status: 404 }
      )
    }

    const brandId = pendingBrands[0].id
    console.log('✅ [SAVE API] Found pending brand:', brandId)

    // Update onboarding answers using the server-resolved brandId
    console.log('💾 [SAVE API] Updating onboarding answers for brand:', brandId)
    const success = await updateOnboardingAnswers(brandId, answers)
    
    console.log('📊 [SAVE API] Update result:', { success })
    
    if (!success) {
      console.error('❌ [SAVE API] Failed to save answers for brand:', brandId)
      return NextResponse.json(
        { success: false, error: 'Failed to save answers' },
        { status: 500 }
      )
    }

    console.log('✅ [SAVE API] Successfully saved onboarding answers for brand:', brandId)
    
    // Return updated brand information
    const brandName = answers?.brandName || pendingBrands[0].name || 'Your Brand'
    console.log('🏷️ [SAVE API] Returning brand name:', brandName)

    return NextResponse.json({ 
      success: true,
      brandId,
      brandName // Return the updated brand name for immediate UI update
    })

  } catch (error) {
    console.error('❌ [SAVE API] Unexpected error in save route:', error)
    console.error('❌ [SAVE API] Error stack:', error instanceof Error ? error.stack : 'No stack trace')
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
