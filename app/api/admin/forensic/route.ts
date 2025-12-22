import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Use service role key for admin operations
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

/**
 * GET /api/admin/forensic
 *
 * Fetches forensic visibility data for the dashboard
 * Returns three datasets:
 * - sessionMatrix: Active/recent session attempts
 * - citationTrace: Batch execution and citation extraction traces
 * - schedulingQueue: Upcoming scheduled batches
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const table = searchParams.get('table') // 'sessions', 'citations', 'schedule', or 'all'

    // Table A: Session Matrix - Last 24 hours of session attempts
    if (!table || table === 'sessions' || table === 'all') {
      const { data: sessionMatrix, error: sessionsError } = await supabase
        .from('v_forensic_session_attempts_24h')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(100)

      if (sessionsError && table === 'sessions') {
        return NextResponse.json({
          success: false,
          error: 'Failed to fetch session matrix',
          message: sessionsError.message
        }, { status: 500 })
      }

      if (table === 'sessions') {
        return NextResponse.json({
          success: true,
          data: sessionMatrix || []
        })
      }
    }

    // Table B: Citation Trace - Recent prompt results with forensic data
    if (!table || table === 'citations' || table === 'all') {
      const { data: citationTrace, error: citationsError } = await supabase
        .from('prompt_results')
        .select(`
          id,
          created_at,
          brand_prompt_id,
          prompt_text,
          chatgpt_response,
          chatgpt_citations,
          browserless_session_id_used,
          execution_visual_state,
          provider_status,
          provider_error_message,
          brand_prompts!inner(
            id,
            brands!inner(
              name
            ),
            users!inner(
              email
            )
          ),
          daily_schedules(
            id,
            batch_number
          )
        `)
        .order('created_at', { ascending: false })
        .limit(100)

      if (citationsError && table === 'citations') {
        return NextResponse.json({
          success: false,
          error: 'Failed to fetch citation trace',
          message: citationsError.message
        }, { status: 500 })
      }

      // Transform the data for easier frontend consumption
      const transformedCitations = citationTrace?.map((row: any) => ({
        id: row.id,
        timestamp: row.created_at,
        brandName: row.brand_prompts?.brands?.name || 'Unknown',
        userEmail: row.brand_prompts?.users?.email || 'Unknown',
        promptSnippet: row.prompt_text?.substring(0, 100) + '...',
        responseLength: row.chatgpt_response?.length || 0,
        citationsCount: row.chatgpt_citations?.length || 0,
        sessionId: row.browserless_session_id_used,
        visualState: row.execution_visual_state,
        status: row.provider_status,
        errorMessage: row.provider_error_message,
        batchId: row.daily_schedules?.id,
        batchNumber: row.daily_schedules?.batch_number
      })) || []

      if (table === 'citations') {
        return NextResponse.json({
          success: true,
          data: transformedCitations
        })
      }
    }

    // Table C: Scheduling Queue - Today's and tomorrow's batches
    if (!table || table === 'schedule' || table === 'all') {
      const { data: schedulingQueue, error: scheduleError } = await supabase
        .from('v_forensic_schedule_queue')
        .select('*')
        .order('execution_time', { ascending: true })

      if (scheduleError && table === 'schedule') {
        return NextResponse.json({
          success: false,
          error: 'Failed to fetch scheduling queue',
          message: scheduleError.message
        }, { status: 500 })
      }

      if (table === 'schedule') {
        return NextResponse.json({
          success: true,
          data: schedulingQueue || []
        })
      }
    }

    // Return all tables if 'all' or no specific table requested
    if (!table || table === 'all') {
      // Fetch all three datasets in parallel
      const [sessionsResult, citationsResult, scheduleResult] = await Promise.all([
        supabase
          .from('v_forensic_session_attempts_24h')
          .select('*')
          .order('timestamp', { ascending: false })
          .limit(100),

        supabase
          .from('prompt_results')
          .select(`
            id,
            created_at,
            brand_prompt_id,
            prompt_text,
            chatgpt_response,
            chatgpt_citations,
            browserless_session_id_used,
            execution_visual_state,
            provider_status,
            provider_error_message,
            brand_prompts!inner(
              id,
              brands!inner(
                name
              ),
              users!inner(
                email
              )
            ),
            daily_schedules(
              id,
              batch_number
            )
          `)
          .order('created_at', { ascending: false })
          .limit(100),

        supabase
          .from('v_forensic_schedule_queue')
          .select('*')
          .order('execution_time', { ascending: true })
      ])

      // Transform citation data
      const transformedCitations = citationsResult.data?.map((row: any) => ({
        id: row.id,
        timestamp: row.created_at,
        brandName: row.brand_prompts?.brands?.name || 'Unknown',
        userEmail: row.brand_prompts?.users?.email || 'Unknown',
        promptSnippet: row.prompt_text?.substring(0, 100) + '...',
        responseLength: row.chatgpt_response?.length || 0,
        citationsCount: row.chatgpt_citations?.length || 0,
        sessionId: row.browserless_session_id_used,
        visualState: row.execution_visual_state,
        status: row.provider_status,
        errorMessage: row.provider_error_message,
        batchId: row.daily_schedules?.id,
        batchNumber: row.daily_schedules?.batch_number
      })) || []

      return NextResponse.json({
        success: true,
        data: {
          sessionMatrix: sessionsResult.data || [],
          citationTrace: transformedCitations,
          schedulingQueue: scheduleResult.data || []
        }
      })
    }

    // Invalid table parameter
    return NextResponse.json({
      success: false,
      error: 'Invalid table parameter',
      message: 'Use ?table=sessions, ?table=citations, ?table=schedule, or ?table=all'
    }, { status: 400 })

  } catch (error) {
    console.error('❌ [FORENSIC API] Unexpected error:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

/**
 * GET /api/admin/forensic/accounts
 *
 * Fetches detailed account forensic data
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action } = body

    if (action === 'accounts') {
      // Fetch detailed account data with forensic columns
      const { data: accounts, error } = await supabase
        .from('chatgpt_accounts')
        .select('email, browserless_session_id, proxy_host, proxy_port, cookies_created_at, last_connection_at, last_visual_state, last_visual_state_at, last_initialization_attempt, last_initialization_result, session_health_status, browserless_session_expires_at, total_connections')
        .order('email')

      if (error) {
        return NextResponse.json({
          success: false,
          error: 'Failed to fetch accounts',
          message: error.message
        }, { status: 500 })
      }

      // Calculate additional metrics
      const accountsWithMetrics = accounts?.map(account => {
        const sessionExpiresAt = account.browserless_session_expires_at ? new Date(account.browserless_session_expires_at) : null
        const lastConnection = account.last_connection_at ? new Date(account.last_connection_at) : null
        const cookiesCreated = account.cookies_created_at ? new Date(account.cookies_created_at) : null
        const now = new Date()

        return {
          ...account,
          proxyUsed: `${account.proxy_host}:${account.proxy_port}`,
          daysUntilSessionExpiry: sessionExpiresAt ? Math.floor((sessionExpiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null,
          hoursSinceLastConnection: lastConnection ? Math.floor((now.getTime() - lastConnection.getTime()) / (1000 * 60 * 60)) : null,
          daysSinceCookiesCreated: cookiesCreated ? Math.floor((now.getTime() - cookiesCreated.getTime()) / (1000 * 60 * 60 * 24)) : null
        }
      }) || []

      return NextResponse.json({
        success: true,
        data: accountsWithMetrics
      })
    }

    // Invalid action
    return NextResponse.json({
      success: false,
      error: 'Invalid action',
      message: 'Supported actions: accounts'
    }, { status: 400 })

  } catch (error) {
    console.error('❌ [FORENSIC API POST] Unexpected error:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
