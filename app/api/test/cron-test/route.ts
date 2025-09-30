import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  try {
    console.log('🧪 [TEST] Testing cron endpoint directly')
    
    // Call the cron endpoint directly
    const cronResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/cron/daily-reports`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    })

    const cronResult = await cronResponse.json()
    
    console.log('🧪 [TEST] Cron response:', cronResult)

    return NextResponse.json({
      success: true,
      message: 'Cron test completed',
      cronResponse: {
        status: cronResponse.status,
        data: cronResult
      }
    })

  } catch (error) {
    console.error('❌ [TEST] Error testing cron:', error)
    return NextResponse.json({
      success: false,
      error: 'Test failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export async function POST() {
  return GET()
}
