import { NextRequest, NextResponse } from 'next/server'
import { extractUrlContent } from '@/lib/providers/tavily'

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json()
    
    if (!url) {
      return NextResponse.json({
        success: false,
        error: 'URL is required'
      }, { status: 400 })
    }
    
    console.log(`🧪 [TEST TAVILY] Testing Tavily API with URL: ${url}`)
    
    const result = await extractUrlContent([url])
    
    return NextResponse.json({
      success: true,
      result,
      url
    })
    
  } catch (error) {
    console.error('❌ [TEST TAVILY] Error:', error)
    return NextResponse.json({
      success: false,
      error: 'Tavily API test failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}