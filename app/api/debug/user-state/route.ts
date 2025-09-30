import { NextResponse } from 'next/server'
import { getUserState } from '@/lib/supabase/user-state'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Only available in development' }, { status: 403 })
  }

  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Get user state
    const userState = await getUserState()

    // Get raw brand data
    const { data: brands, error: brandsError } = await supabase
      .from('brands')
      .select('*')
      .or(`owner_user_id.eq.${user.id},user_id.eq.${user.id}`)
      .order('created_at', { ascending: false })

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email
      },
      userState,
      rawBrands: brands || [],
      brandsError,
      debug: {
        timestamp: new Date().toISOString(),
        env: process.env.NODE_ENV
      }
    })
  } catch (error) {
    console.error('Debug endpoint error:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
