import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/admin/forensic/initialize-session
 *
 * Triggers re-initialization of a Browserless session for a specific ChatGPT account
 * by calling the webhook server running on the production server
 *
 * The webhook server runs on the actual server where the initialization script can execute
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { accountEmail } = body

    if (!accountEmail) {
      return NextResponse.json({
        success: false,
        error: 'Missing required field: accountEmail'
      }, { status: 400 })
    }

    console.log(`🔄 [FORENSIC API] Calling webhook to re-initialize session for: ${accountEmail}`)

    // Call the webhook server running on the production server
    const webhookUrl = process.env.WEBHOOK_SERVER_URL || 'http://167.88.163.222:3001/initialize-session'
    const webhookSecret = process.env.WEBHOOK_SECRET || 'your-secret-key-here'

    const webhookResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        accountEmail,
        secret: webhookSecret
      })
    })

    const result = await webhookResponse.json()

    if (!webhookResponse.ok || !result.success) {
      console.error(`❌ [FORENSIC API] Webhook call failed for ${accountEmail}:`, result.message)
      return NextResponse.json({
        success: false,
        error: 'Re-initialization failed',
        message: result.message || result.error
      }, { status: webhookResponse.status })
    }

    console.log(`✅ [FORENSIC API] Session re-initialized successfully for ${accountEmail}`)
    return NextResponse.json({
      success: true,
      message: `Session re-initialized successfully for ${accountEmail}`,
      output: result.output
    })

  } catch (error) {
    console.error('❌ [FORENSIC API] Error calling webhook:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
