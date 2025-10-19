import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const checks = {
      tavily: !!process.env.TAVILY_API_KEY,
      openai: !!process.env.OPENAI_API_KEY,
      perplexity: !!process.env.PERPLEXITY_API_KEY,
      google: !!process.env.GOOGLE_API_KEY && !!process.env.GOOGLE_CSE_ID,
      supabase: !!process.env.SUPABASE_URL && !!process.env.SUPABASE_ANON_KEY && !!process.env.SUPABASE_SERVICE_ROLE_KEY
    }
    
    const allConfigured = Object.values(checks).every(Boolean)
    
    return NextResponse.json({
      success: true,
      allConfigured,
      checks,
      environment: process.env.NODE_ENV
    })
    
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Failed to check API keys',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
