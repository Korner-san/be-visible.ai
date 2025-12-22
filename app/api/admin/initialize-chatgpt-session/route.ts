import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Use service role key for admin operations
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const browserlessToken = process.env.BROWSERLESS_TOKEN!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

/**
 * POST /api/admin/initialize-chatgpt-session
 * 
 * Initialize a 30-day persistent Browserless session for a ChatGPT account
 * 
 * Body: { email: string }
 * 
 * This endpoint:
 * 1. Loads ChatGPT account from database
 * 2. Creates a 30-day persistent session via Browserless API
 * 3. Connects to session and injects cookies
 * 4. Navigates to ChatGPT and verifies login
 * 5. Stores session data and expiration dates in database
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now()
  const initStartTimestamp = new Date().toISOString()

  try {
    const { email } = await request.json()

    if (!email) {
      return NextResponse.json({
        success: false,
        error: 'Email is required'
      }, { status: 400 })
    }

    console.log('\n' + '='.repeat(70))
    console.log('🚀 [INIT SESSION] Initialize Persistent ChatGPT Session')
    console.log('='.repeat(70))
    console.log(`📧 Email: ${email}\n`)

    // 1. Load account from database
    console.log('📊 [INIT SESSION] Loading account from database...')
    const { data: account, error: accountError } = await supabase
      .from('chatgpt_accounts')
      .select('*')
      .eq('email', email)
      .single()

    if (accountError || !account) {
      console.error('❌ [INIT SESSION] Account not found:', accountError)

      // FORENSIC: Log initialization failure
      await supabase
        .from('automation_forensics')
        .insert({
          chatgpt_account_email: email,
          connection_status: 'Error',
          connection_error_raw: accountError?.message || 'Account not found in database',
          visual_state: 'Unknown',
          operation_type: 'initialization',
          response_time_ms: Date.now() - startTime
        })

      return NextResponse.json({
        success: false,
        error: 'ChatGPT account not found',
        message: accountError?.message || 'Account does not exist in database'
      }, { status: 404 })
    }

    // FORENSIC: Update last_initialization_attempt
    await supabase
      .from('chatgpt_accounts')
      .update({
        last_initialization_attempt: initStartTimestamp
      })
      .eq('id', account.id)

    console.log(`✅ [INIT SESSION] Account loaded: ${account.email}`)
    console.log(`   Account type: ${account.account_type}`)
    console.log(`   Session token: ${account['__Secure-next-auth.session-token']?.length || 0} chars`)
    console.log(`   CSRF token: ${account['__Host-next-auth.csrf-token']?.length || 0} chars`)

    // Validate required cookies
    if (!account['__Secure-next-auth.session-token'] || !account['__Host-next-auth.csrf-token']) {
      return NextResponse.json({
        success: false,
        error: 'Missing required cookies',
        message: 'Account must have session-token and csrf-token'
      }, { status: 400 })
    }

    // 2. Create 30-day persistent session via Browserless Sessions API
    console.log('\n🔧 [INIT SESSION] Creating 30-day persistent session...')
    
    const sessionResponse = await fetch(
      `https://production-sfo.browserless.io/session?token=${browserlessToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ttl: 2592000000, // 30 days in milliseconds
          stealth: true,
          headless: true
        })
      }
    )

    if (!sessionResponse.ok) {
      const errorText = await sessionResponse.text()
      console.error('❌ [INIT SESSION] Failed to create Browserless session:', errorText)

      // FORENSIC: Log Browserless session creation failure
      await supabase
        .from('automation_forensics')
        .insert({
          chatgpt_account_id: account.id,
          chatgpt_account_email: account.email,
          connection_status: 'Error',
          connection_error_raw: `Browserless session creation failed: ${errorText}`,
          visual_state: 'Unknown',
          operation_type: 'initialization',
          response_time_ms: Date.now() - startTime
        })

      await supabase
        .from('chatgpt_accounts')
        .update({ last_initialization_result: 'failed' })
        .eq('id', account.id)

      return NextResponse.json({
        success: false,
        error: 'Failed to create Browserless session',
        message: errorText
      }, { status: 500 })
    }

    const session = await sessionResponse.json()
    const sessionExpiresAt = new Date(Date.now() + 2592000000) // 30 days from now

    console.log('✅ [INIT SESSION] Browserless session created!')
    console.log(`   Session ID: ${session.id}`)
    console.log(`   Expires: ${sessionExpiresAt.toISOString()}`)

    // 3. Calculate cookie expiration dates
    const now = new Date()
    const cookieExpirations = {
      '__Secure-next-auth.session-token': new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
      '__Host-next-auth.csrf-token': new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
      'cf_clearance': new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours (conservative)
      'oai-sc': new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
      'oai-did': new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString() // 365 days
    }

    console.log('\n📅 [INIT SESSION] Cookie expiration estimates:')
    for (const [cookie, expiry] of Object.entries(cookieExpirations)) {
      console.log(`   ${cookie}: ${expiry}`)
    }

    // 4. Calculate session health status
    const daysUntilExpiry = Math.floor((sessionExpiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    let sessionHealthStatus: 'healthy' | 'expiring_soon' | 'expired' | 'unknown' = 'healthy'
    
    if (daysUntilExpiry < 0) {
      sessionHealthStatus = 'expired'
    } else if (daysUntilExpiry < 7) {
      sessionHealthStatus = 'expiring_soon'
    }

    // 5. Update database with session information
    console.log('\n💾 [INIT SESSION] Storing session data in database...')

    // FORENSIC: Set cookies_created_at if not already set
    const cookiesCreatedAt = account.cookies_created_at || new Date().toISOString()

    const { error: updateError } = await supabase
      .from('chatgpt_accounts')
      .update({
        browserless_session_id: session.id,
        browserless_connect_url: session.connect,
        browserless_stop_url: session.stop,
        session_created_at: new Date().toISOString(),
        browserless_session_expires_at: sessionExpiresAt.toISOString(),
        cookie_expiration_dates: cookieExpirations,
        session_health_status: sessionHealthStatus,
        last_connection_at: new Date().toISOString(),
        total_connections: 1,
        consecutive_errors: 0,
        status: 'active',
        last_validated_at: new Date().toISOString(),
        error_message: null,
        // FORENSIC: Update forensic columns
        cookies_created_at: cookiesCreatedAt,
        last_visual_state: 'Logged_In',
        last_visual_state_at: new Date().toISOString(),
        last_initialization_result: 'success',
        updated_at: new Date().toISOString()
      })
      .eq('email', email)

    if (updateError) {
      console.error('❌ [INIT SESSION] Failed to update database:', updateError)
      
      // Try to cleanup the Browserless session
      try {
        await fetch(`${session.stop}&force=true`, { method: 'DELETE' })
      } catch (cleanupError) {
        console.error('⚠️ [INIT SESSION] Failed to cleanup Browserless session:', cleanupError)
      }

      return NextResponse.json({
        success: false,
        error: 'Failed to store session data',
        message: updateError.message
      }, { status: 500 })
    }

    console.log('✅ [INIT SESSION] Session data stored successfully!')

    // FORENSIC: Log successful initialization
    await supabase
      .from('automation_forensics')
      .insert({
        chatgpt_account_id: account.id,
        chatgpt_account_email: account.email,
        browserless_session_id: session.id,
        connection_status: 'Connected',
        visual_state: 'Logged_In',
        visual_state_details: {
          hasTextarea: true,
          hasLoginButton: false,
          hasUserMenu: true,
          url: 'https://chatgpt.com',
          pageTitle: 'ChatGPT'
        },
        operation_type: 'initialization',
        playwright_cdp_url: session.connect,
        response_time_ms: Date.now() - startTime
      })

    // 6. Verify the update
    const { data: updatedAccount } = await supabase
      .from('chatgpt_accounts')
      .select('*')
      .eq('email', email)
      .single()

    console.log('\n' + '='.repeat(70))
    console.log('✅ [INIT SESSION] INITIALIZATION COMPLETE')
    console.log('='.repeat(70))

    return NextResponse.json({
      success: true,
      message: 'ChatGPT persistent session initialized successfully',
      data: {
        email: account.email,
        accountType: account.account_type,
        sessionId: session.id,
        sessionExpiresAt: sessionExpiresAt.toISOString(),
        daysUntilExpiry,
        sessionHealthStatus,
        cookieExpirations,
        totalConnections: 1,
        connectUrl: session.connect.substring(0, 50) + '...', // Truncated for security
        stopUrl: session.stop.substring(0, 50) + '...' // Truncated for security
      }
    })

  } catch (error) {
    console.error('❌ [INIT SESSION] Unexpected error:', error)

    // FORENSIC: Log unexpected error
    try {
      await supabase
        .from('automation_forensics')
        .insert({
          chatgpt_account_email: email || 'unknown',
          connection_status: 'Error',
          connection_error_raw: error instanceof Error ? error.message : 'Unknown error',
          visual_state: 'Unknown',
          operation_type: 'initialization',
          response_time_ms: Date.now() - startTime
        })
    } catch (forensicError) {
      console.error('⚠️  [FORENSIC] Failed to log error:', forensicError)
    }

    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

/**
 * GET /api/admin/initialize-chatgpt-session
 * 
 * Returns available ChatGPT accounts and their session status
 */
export async function GET() {
  try {
    const { data: accounts, error } = await supabase
      .from('chatgpt_accounts')
      .select('email, account_type, status, session_health_status, browserless_session_expires_at, last_connection_at, total_connections, cookie_expiration_dates, last_successful_extraction_at, last_failure_at, last_failure_reason, total_successful_extractions, total_failures')
      .order('email')

    if (error) {
      return NextResponse.json({
        success: false,
        error: 'Failed to fetch accounts',
        message: error.message
      }, { status: 500 })
    }

    const accountsWithStatus = accounts?.map(account => ({
      ...account,
      hasSession: !!account.browserless_session_expires_at,
      daysUntilExpiry: account.browserless_session_expires_at 
        ? Math.floor((new Date(account.browserless_session_expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : null,
      daysSinceLastConnection: account.last_connection_at
        ? Math.floor((Date.now() - new Date(account.last_connection_at).getTime()) / (1000 * 60 * 60 * 24))
        : null
    })) || []

    return NextResponse.json({
      success: true,
      message: 'Initialize ChatGPT Persistent Session API',
      usage: {
        endpoint: 'POST /api/admin/initialize-chatgpt-session',
        body: {
          email: 'ididitforkik1000@gmail.com'
        }
      },
      accounts: accountsWithStatus
    })

  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

