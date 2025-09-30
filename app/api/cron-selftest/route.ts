import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Force Node runtime (not Edge) - critical for service role
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    console.log('🔥 [CRON SELFTEST] Heartbeat triggered! v2')
    
    const timestamp = new Date().toISOString()
    const userAgent = request.headers.get('user-agent') || 'unknown'
    
    // Use service client to bypass RLS
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    
    // Insert heartbeat record
    const { data, error } = await supabase
      .from('cron_invocations')
      .insert({
        source: 'vercel-cron',
        path: '/api/cron-selftest',
        user_agent: userAgent
      })
      .select()
      .single()
    
    if (error) {
      console.error('❌ [CRON SELFTEST] Database error:', error)
      return NextResponse.json({
        success: false,
        error: error.message,
        timestamp
      }, { status: 500 })
    }
    
    console.log('✅ [CRON SELFTEST] Heartbeat recorded:', data.id)
    
    return NextResponse.json({
      success: true,
      message: 'Heartbeat recorded successfully',
      id: data.id,
      timestamp,
      userAgent,
      source: 'vercel-cron'
    })
    
  } catch (error) {
    console.error('❌ [CRON SELFTEST] Unexpected error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}
