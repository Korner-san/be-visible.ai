import { NextRequest, NextResponse } from 'next/server'

/**
 * Test Tavily API - Extract content from URLs
 * This is a ONE-TIME test to verify Tavily integration
 */
export async function GET(request: NextRequest) {
  try {
    const apiKey = process.env.TAVILY_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'TAVILY_API_KEY not configured in .env.local' },
        { status: 500 }
      )
    }

    // Test prompt from kk1995current@gmail.com user
    const testPrompt = "Which platforms provide optimized infrastructure for web performance?"
    
    console.log('🔍 [TAVILY TEST] Starting API call...')
    console.log('📝 [TAVILY TEST] Prompt:', testPrompt)
    
    const startTime = Date.now()
    
    // Call Tavily Search API
    // Based on Tavily docs: https://docs.tavily.com/welcome
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: apiKey,
        query: testPrompt,
        search_depth: 'advanced', // Get more detailed content
        include_answer: true,
        include_raw_content: true, // Get full page content
        max_results: 3 // Limit to 3 URLs for this test
      })
    })

    const responseTime = Date.now() - startTime
    console.log('🔍 [TAVILY TEST] HTTP Status:', response.status, 'Response time:', responseTime, 'ms')

    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ [TAVILY TEST] API Error:', errorText)
      return NextResponse.json(
        { error: `Tavily API error: ${response.status}`, details: errorText },
        { status: response.status }
      )
    }

    const data = await response.json()
    
    console.log('✅ [TAVILY TEST] Success!')
    console.log('📊 [TAVILY TEST] Results count:', data.results?.length || 0)
    
    // Extract the key information we need
    const extractedData = {
      query: testPrompt,
      answer: data.answer || null,
      results: data.results?.map((result: any) => ({
        url: result.url,
        title: result.title,
        description: result.content, // This is the snippet/description
        raw_content: result.raw_content ? result.raw_content.substring(0, 500) + '...' : null, // First 500 chars
        score: result.score
      })) || [],
      response_time_ms: responseTime
    }

    console.log('📦 [TAVILY TEST] Extracted data structure:', {
      hasAnswer: !!extractedData.answer,
      resultsCount: extractedData.results.length,
      firstResultHasContent: extractedData.results[0]?.raw_content ? 'YES' : 'NO'
    })

    return NextResponse.json({
      success: true,
      message: 'Tavily API test successful',
      data: extractedData,
      raw_response: data // Include full response for inspection
    })

  } catch (error: any) {
    console.error('❌ [TAVILY TEST] Unexpected error:', error)
    return NextResponse.json(
      { 
        error: 'Test failed', 
        message: error.message,
        stack: error.stack 
      },
      { status: 500 }
    )
  }
}

