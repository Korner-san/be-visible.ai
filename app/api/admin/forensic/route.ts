import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Use service role key for admin operations
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

const RESERVE_WINDOW_MINUTES = 15
const MINUTES_PER_PROMPT = 2.5

async function getSystemCapacity(db: ReturnType<typeof createClient>) {
  const now = new Date()
  const reserveWindowEnd = new Date(now.getTime() + RESERVE_WINDOW_MINUTES * 60 * 1000)

  const [
    { data: accounts },
    { data: runningBatches },
    { data: reservedBatches },
    { data: runningOnboardings }
  ] = await Promise.all([
    db.from('chatgpt_accounts').select('id, email, last_connection_at').eq('is_eligible', true).eq('status', 'active').not('proxy_host', 'is', null),
    db.from('daily_schedules').select('chatgpt_account_id, batch_size, execution_time').eq('status', 'running'),
    db.from('daily_schedules').select('chatgpt_account_id, batch_size, execution_time').eq('status', 'pending').gte('execution_time', now.toISOString()).lte('execution_time', reserveWindowEnd.toISOString()),
    db.from('brands').select('chatgpt_account_id, onboarding_prompts_sent').eq('first_report_status', 'running').not('chatgpt_account_id', 'is', null)
  ])

  const accountStates = (accounts || []).map((account: any) => {
    const dailyBatch = (runningBatches || [] as any[]).find((b: any) => b.chatgpt_account_id === account.id)
    const reserved = (reservedBatches || [] as any[]).find((b: any) => b.chatgpt_account_id === account.id)
    const onboarding = (runningOnboardings || [] as any[]).find((b: any) => b.chatgpt_account_id === account.id)

    if (dailyBatch) {
      const batchStart = new Date(dailyBatch.execution_time)
      const estimatedFreeAt = new Date(batchStart.getTime() + (dailyBatch.batch_size || 3) * MINUTES_PER_PROMPT * 60 * 1000)
      return { id: account.id, email: account.email, state: 'BUSY:daily', estimatedFreeAt: estimatedFreeAt.toISOString() }
    }
    if (onboarding) {
      const remaining = Math.max(1, 30 - (onboarding.onboarding_prompts_sent || 0))
      const estimatedFreeAt = new Date(now.getTime() + remaining * MINUTES_PER_PROMPT * 60 * 1000)
      return { id: account.id, email: account.email, state: 'BUSY:onboarding', estimatedFreeAt: estimatedFreeAt.toISOString() }
    }
    if (reserved) {
      const batchStart = new Date(reserved.execution_time)
      const estimatedFreeAt = new Date(batchStart.getTime() + (reserved.batch_size || 3) * MINUTES_PER_PROMPT * 60 * 1000)
      return { id: account.id, email: account.email, state: 'RESERVED', nextBatchAt: reserved.execution_time, estimatedFreeAt: estimatedFreeAt.toISOString() }
    }
    return { id: account.id, email: account.email, state: 'FREE', estimatedFreeAt: null }
  })

  const freeSlots = accountStates.filter((a: any) => a.state === 'FREE').length
  const canAcceptOnboarding = freeSlots > 0

  let estimatedWaitMinutes = 0
  if (!canAcceptOnboarding) {
    const futureTimes = accountStates.filter((a: any) => a.estimatedFreeAt).map((a: any) => new Date(a.estimatedFreeAt).getTime())
    if (futureTimes.length > 0) {
      estimatedWaitMinutes = Math.max(1, Math.ceil((Math.min(...futureTimes) - now.getTime()) / 60000))
    } else {
      estimatedWaitMinutes = 15
    }
  }

  return { freeSlots, totalAccounts: accountStates.length, canAcceptOnboarding, estimatedWaitMinutes, accounts: accountStates }
}

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
    const table = searchParams.get('table') // 'storage_state', 'sessions', 'citations', 'schedule', or 'all'

    // Table A: Storage State Health Monitor
    if (!table || table === 'storage_state' || table === 'all') {
      const { data: accounts, error: accountsError } = await supabase
        .from('chatgpt_accounts')
        .select('email, proxy_host, proxy_port, cookies_created_at, is_eligible, source_pc, status')
        .order('email')

      if (accountsError && table === 'storage_state') {
        return NextResponse.json({
          success: false,
          error: 'Failed to fetch storage state data',
          message: accountsError.message
        }, { status: 500 })
      }

      // For each account, calculate health metrics
      const storageStateHealth = await Promise.all(
        (accounts || []).map(async (account: any) => {
          const now = new Date()
          const cookiesCreated = account.cookies_created_at ? new Date(account.cookies_created_at) : null

          // Calculate age in days
          const ageInDays = cookiesCreated
            ? Math.floor((now.getTime() - cookiesCreated.getTime()) / (1000 * 60 * 60 * 24))
            : null

          // Get last successful connection
          const { data: lastSuccessData } = await supabase
            .from('automation_forensics')
            .select('timestamp')
            .eq('chatgpt_account_email', account.email)
            .eq('connection_status', 'Connected')
            .eq('visual_state', 'Logged_In')
            .order('timestamp', { ascending: false })
            .limit(1)
            .single()

          // Get last 10 visual states for trend
          const { data: recentStates } = await supabase
            .from('automation_forensics')
            .select('visual_state')
            .eq('chatgpt_account_email', account.email)
            .order('timestamp', { ascending: false })
            .limit(10)

          // Calculate visual state trend
          const visualStates = recentStates?.map((s: any) => s.visual_state).filter(Boolean) || []
          const loggedInCount = visualStates.filter((s: string) => s === 'Logged_In').length
          const totalStates = visualStates.length

          let visualStateTrend = 'Unknown'
          if (totalStates > 0) {
            const loggedInPercent = Math.round((loggedInCount / totalStates) * 100)
            const mostCommon = visualStates[0] || 'Unknown'
            visualStateTrend = `${mostCommon} (${loggedInPercent}%)`
          }

          // Determine status: Active or Failed
          let status = 'Active'
          if (totalStates >= 3) {
            const recentFailures = visualStates.slice(0, 3).filter((s: string) => s !== 'Logged_In').length
            if (recentFailures >= 2) {
              status = 'Failed'
            }
          }

          return {
            extractionPc: account.source_pc || '-',
            chatgptAccount: account.email,
            isEligible: account.is_eligible === true && account.status === 'active',
            proxy: `${account.proxy_host}:${account.proxy_port}`,
            age: ageInDays,
            status,
            lastSuccess: lastSuccessData?.timestamp || null,
            visualStateTrend,
          }
        })
      )

      if (table === 'storage_state') {
        return NextResponse.json({
          success: true,
          data: storageStateHealth
        })
      }
    }

    // Table B: Session Matrix - Last 24 hours of session attempts
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

    // Table B: Citation Extraction Tracking - Last 50 prompt runs
    if (!table || table === 'citations' || table === 'all') {
      // Get last 50 prompt executions
      const { data: citationTrace, error: citationsError } = await supabase
        .from('prompt_results')
        .select(`
          id,
          created_at,
          brand_prompt_id,
          prompt_text,
          chatgpt_response,
          chatgpt_citations,
          brand_prompts!inner(
            id,
            brands!inner(
              id,
              name
            )
          )
        `)
        .order('created_at', { ascending: false })
        .limit(50)

      if (citationsError && table === 'citations') {
        return NextResponse.json({
          success: false,
          error: 'Failed to fetch citation data',
          message: citationsError.message
        }, { status: 500 })
      }

      // Get unique prompt IDs to calculate citation rates
      const uniquePromptIds = [...new Set((citationTrace || []).map((r: any) => r.brand_prompt_id))]

      // For each prompt, get last 5 executions to calculate citation rate
      const citationRates: Record<string, number> = {}

      for (const promptId of uniquePromptIds) {
        const { data: last5 } = await supabase
          .from('prompt_results')
          .select('chatgpt_citations')
          .eq('brand_prompt_id', promptId)
          .order('created_at', { ascending: false })
          .limit(5)

        if (last5 && last5.length > 0) {
          const withCitations = last5.filter(r => r.chatgpt_citations && r.chatgpt_citations.length > 0).length
          citationRates[promptId] = Math.round((withCitations / last5.length) * 100)
        } else {
          citationRates[promptId] = 0
        }
      }

      // Transform the data
      const transformedCitations = citationTrace?.map((row: any) => ({
        id: row.id,
        timestamp: row.created_at,
        brandName: row.brand_prompts?.brands?.name || 'Unknown',
        promptText: row.prompt_text || '',
        responseLength: (row.chatgpt_response || '').length,
        citationsExtracted: row.chatgpt_citations?.length || 0,
        citationRate: citationRates[row.brand_prompt_id] || 0
      })) || []

      if (table === 'citations') {
        return NextResponse.json({
          success: true,
          data: transformedCitations
        })
      }
    }

    // Table C: Scheduling Queue - Today's and tomorrow's batches with prompt details
    let enrichedQueue: any[] = []

    if (!table || table === 'schedule' || table === 'all') {
      // First get the schedule queue
      const { data: schedulingQueue, error: scheduleError } = await supabase
        .from('daily_schedules')
        .select(`
          id,
          schedule_date,
          batch_number,
          execution_time,
          status,
          batch_size,
          prompt_ids,
          chatgpt_accounts!inner(
            email,
            proxy_host,
            proxy_port,
            last_visual_state,
            browserless_session_id
          )
        `)
        .gte('schedule_date', new Date(Date.now() - 86400000).toISOString().split('T')[0])
        .lte('schedule_date', new Date().toISOString().split('T')[0])
        .order('execution_time', { ascending: true })

      if (scheduleError && table === 'schedule') {
        return NextResponse.json({
          success: false,
          error: 'Failed to fetch scheduling queue',
          message: scheduleError.message
        }, { status: 500 })
      }

      // Enrich with prompt details
      enrichedQueue = await Promise.all(
        (schedulingQueue || []).map(async (schedule: any) => {
          // Fetch all prompts in this batch with brand info
          const { data: prompts, error: promptError } = await supabase
            .from('brand_prompts')
            .select(`
              id,
              improved_prompt,
              raw_prompt,
              brand_id,
              brands!inner(
                id,
                name,
                owner_user_id
              )
            `)
            .in('id', schedule.prompt_ids || [])

          if (promptError) {
            console.error('Error fetching prompts for batch', schedule.id, promptError)
          }

          // Get unique user IDs from brands
          const userIds = [...new Set((prompts || []).map((p: any) => p.brands?.owner_user_id).filter(Boolean))]

          // Fetch user emails
          let userMap: Record<string, string> = {}
          if (userIds.length > 0) {
            const { data: users } = await supabase
              .from('users')
              .select('id, email')
              .in('id', userIds)

            users?.forEach((u: any) => {
              userMap[u.id] = u.email
            })
          }

          const enrichedPrompts = (prompts || []).map((p: any) => ({
            id: p.id,
            prompt_text: p.improved_prompt || p.raw_prompt || '',
            brand_name: p.brands?.name || 'Unknown',
            brand_id: p.brands?.id || p.brand_id,
            user_email: userMap[p.brands?.owner_user_id] || 'Unknown'
          }))

          return {
            id: schedule.id,
            schedule_date: schedule.schedule_date,
            batch_number: schedule.batch_number,
            execution_time: schedule.execution_time,
            status: schedule.status,
            batch_size: schedule.batch_size,
            prompt_ids: schedule.prompt_ids,
            account_assigned: schedule.chatgpt_accounts?.email,
            proxy_assigned: `${schedule.chatgpt_accounts?.proxy_host}:${schedule.chatgpt_accounts?.proxy_port}`,
            account_last_visual_state: schedule.chatgpt_accounts?.last_visual_state,
            session_id_assigned: schedule.chatgpt_accounts?.browserless_session_id,
            prompts: enrichedPrompts
          }
        })
      )

      if (table === 'schedule') {
        return NextResponse.json({
          success: true,
          data: enrichedQueue
        })
      }
    }

    // Return all tables if 'all' or no specific table requested
    if (!table || table === 'all') {
      // Fetch storage state health, sessions and citations in parallel (schedule already fetched above)
      const [accountsResult, sessionsResult, citationsResult] = await Promise.all([
        supabase
          .from('chatgpt_accounts')
          .select('email, proxy_host, proxy_port, cookies_created_at, is_eligible, source_pc, status')
          .order('email'),

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
            brand_prompts!inner(
              id,
              brands!inner(
                id,
                name
              )
            )
          `)
          .order('created_at', { ascending: false })
          .limit(50)
      ])

      // Calculate storage state health for all accounts
      const storageStateHealthAll = await Promise.all(
        (accountsResult.data || []).map(async (account: any) => {
          const now = new Date()
          const cookiesCreated = account.cookies_created_at ? new Date(account.cookies_created_at) : null

          const ageInDays = cookiesCreated
            ? Math.floor((now.getTime() - cookiesCreated.getTime()) / (1000 * 60 * 60 * 24))
            : null

          const { data: lastSuccessData } = await supabase
            .from('automation_forensics')
            .select('timestamp')
            .eq('chatgpt_account_email', account.email)
            .eq('connection_status', 'Connected')
            .eq('visual_state', 'Logged_In')
            .order('timestamp', { ascending: false })
            .limit(1)
            .single()

          const { data: recentStates } = await supabase
            .from('automation_forensics')
            .select('visual_state')
            .eq('chatgpt_account_email', account.email)
            .order('timestamp', { ascending: false })
            .limit(10)

          const visualStates = recentStates?.map((s: any) => s.visual_state).filter(Boolean) || []
          const loggedInCount = visualStates.filter((s: string) => s === 'Logged_In').length
          const totalStates = visualStates.length

          let visualStateTrend = 'Unknown'
          if (totalStates > 0) {
            const loggedInPercent = Math.round((loggedInCount / totalStates) * 100)
            const mostCommon = visualStates[0] || 'Unknown'
            visualStateTrend = `${mostCommon} (${loggedInPercent}%)`
          }

          let status = 'Active'
          if (totalStates >= 3) {
            const recentFailures = visualStates.slice(0, 3).filter((s: string) => s !== 'Logged_In').length
            if (recentFailures >= 2) {
              status = 'Failed'
            }
          }

          return {
            extractionPc: account.source_pc || '-',
            chatgptAccount: account.email,
            isEligible: account.is_eligible === true && account.status === 'active',
            proxy: `${account.proxy_host}:${account.proxy_port}`,
            age: ageInDays,
            status,
            lastSuccess: lastSuccessData?.timestamp || null,
            visualStateTrend,
          }
        })
      )

      // Calculate citation rates for all table view
      const uniquePromptIds = [...new Set((citationsResult.data || []).map((r: any) => r.brand_prompt_id))]
      const citationRatesAll: Record<string, number> = {}

      for (const promptId of uniquePromptIds) {
        const { data: last5 } = await supabase
          .from('prompt_results')
          .select('chatgpt_citations')
          .eq('brand_prompt_id', promptId)
          .order('created_at', { ascending: false })
          .limit(5)

        if (last5 && last5.length > 0) {
          const withCitations = last5.filter(r => r.chatgpt_citations && r.chatgpt_citations.length > 0).length
          citationRatesAll[promptId] = Math.round((withCitations / last5.length) * 100)
        } else {
          citationRatesAll[promptId] = 0
        }
      }

      // Transform citation data
      const transformedCitations = citationsResult.data?.map((row: any) => ({
        id: row.id,
        timestamp: row.created_at,
        brandName: row.brand_prompts?.brands?.name || 'Unknown',
        promptText: row.prompt_text || '',
        responseLength: (row.chatgpt_response || '').length,
        citationsExtracted: row.chatgpt_citations?.length || 0,
        citationRate: citationRatesAll[row.brand_prompt_id] || 0
      })) || []

      const systemCapacity = await getSystemCapacity(supabase)

      return NextResponse.json({
        success: true,
        data: {
          storageStateHealth: storageStateHealthAll || [],
          sessionMatrix: sessionsResult.data || [],
          citationTrace: transformedCitations,
          schedulingQueue: enrichedQueue || [],
          systemCapacity
        }
      })
    }

    // Table E: System Capacity
    if (table === 'capacity') {
      const capacityData = await getSystemCapacity(supabase)
      return NextResponse.json({ success: true, data: capacityData })
    }

    // Invalid table parameter
    return NextResponse.json({
      success: false,
      error: 'Invalid table parameter',
      message: 'Use ?table=storage_state, ?table=sessions, ?table=citations, ?table=schedule, ?table=capacity, or ?table=all'
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
