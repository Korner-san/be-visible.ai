import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    
    // Get the current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({
        success: false,
        error: 'Unauthorized'
      }, { status: 401 })
    }

    // Get user profile from users table
    let { data: userProfile, error: profileError } = await supabase
      .from('users')
      .select('id, email, subscription_plan, created_at, updated_at')
      .eq('id', user.id)
      .single()

    // If user doesn't exist in users table, create it
    if (profileError && profileError.code === 'PGRST116') {
      console.log('User not found in users table, creating:', user.email)
      
      const { data: newUser, error: insertError } = await supabase
        .from('users')
        .insert({
          id: user.id,
          email: user.email,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single()

      if (insertError) {
        console.error('Error creating user profile:', insertError)
        return NextResponse.json({
          success: false,
          error: 'Failed to create user profile'
        }, { status: 500 })
      }

      userProfile = newUser
    } else if (profileError) {
      console.error('Error fetching user profile:', profileError)
      return NextResponse.json({
        success: false,
        error: 'Failed to fetch user profile'
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      id: userProfile.id,
      email: userProfile.email,
      subscription_plan: userProfile.subscription_plan,
      created_at: userProfile.created_at,
      updated_at: userProfile.updated_at
    })

  } catch (error) {
    console.error('Unexpected error in user profile API:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 })
  }
}
