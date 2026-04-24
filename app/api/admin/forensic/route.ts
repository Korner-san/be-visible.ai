import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

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

      // Batch query: new conversations and prompts sent per account in last 24h
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const { data: activityRows } = await supabase
        .from('automation_forensics')
        .select('chatgpt_account_email, operation_type')
        .in('operation_type', ['new_conversation', 'prompt_sent'])
        .gte('timestamp', since24h)

      const activityMap: Record<string, { convs24h: number; prompts24h: number }> = {}
      for (const row of (activityRows || [])) {
        const email = row.chatgpt_account_email
        if (!activityMap[email]) activityMap[email] = { convs24h: 0, prompts24h: 0 }
        if (row.operation_type === 'new_conversation') activityMap[email].convs24h++
        if (row.operation_type === 'prompt_sent') activityMap[email].prompts24h++
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
            convs24h: activityMap[account.email]?.convs24h ?? 0,
            prompts24h: activityMap[account.email]?.prompts24h ?? 0,
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
          brand_id,
          batch_type,
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

      // Fetch all BME rows for these schedules in one query
      const scheduleIds = (schedulingQueue || []).map((s: any) => s.id)
      const bmeBySchedule: Record<string, Record<string, any>> = {}
      if (scheduleIds.length > 0) {
        const { data: bmeRows, error: bmeError } = await supabase
          .from('batch_model_executions')
          .select('schedule_id, model, status, prompts_attempted, prompts_ok, prompts_no_result, prompts_failed, started_at, completed_at, error_message')
          .in('schedule_id', scheduleIds)
        if (bmeError) {
          console.error('[FORENSIC] BME query failed:', bmeError.message, bmeError.code)
        } else {
          console.log('[FORENSIC] BME rows fetched:', (bmeRows || []).length, 'for', scheduleIds.length, 'schedules')
        }
        for (const row of (bmeRows || []) as any[]) {
          if (!bmeBySchedule[row.schedule_id]) bmeBySchedule[row.schedule_id] = {}
          bmeBySchedule[row.schedule_id][row.model] = row
        }
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

          // Fetch AIO and Claude status per prompt for completed/failed batches
          const promptStatusMap: Record<string, { aio: string; claude: string }> = {}
          const batchPromptIds = (prompts || []).map((p: any) => p.id)
          if ((schedule.status === 'completed' || schedule.status === 'failed') && batchPromptIds.length > 0) {
            // Find the daily_report for this brand+date
            const brandId = (prompts || [])[0]?.brands?.id || (prompts || [])[0]?.brand_id
            if (brandId) {
              const { data: dailyRep } = await supabase
                .from('daily_reports')
                .select('id')
                .eq('brand_id', brandId)
                .eq('report_date', schedule.schedule_date)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle()

              if (dailyRep?.id) {
                const { data: providerResults } = await supabase
                  .from('prompt_results')
                  .select('brand_prompt_id, provider, provider_status')
                  .eq('daily_report_id', dailyRep.id)
                  .in('brand_prompt_id', batchPromptIds)
                  .in('provider', ['google_ai_overview', 'claude'])

                for (const r of (providerResults || []) as any[]) {
                  if (!promptStatusMap[r.brand_prompt_id]) {
                    promptStatusMap[r.brand_prompt_id] = { aio: 'not_run', claude: 'not_run' }
                  }
                  if (r.provider === 'google_ai_overview') {
                    promptStatusMap[r.brand_prompt_id].aio = r.provider_status
                  } else if (r.provider === 'claude') {
                    promptStatusMap[r.brand_prompt_id].claude = r.provider_status
                  }
                }
              }
            }
          }

          const enrichedPrompts = (prompts || []).map((p: any) => ({
            id: p.id,
            prompt_text: p.improved_prompt || p.raw_prompt || '',
            brand_name: p.brands?.name || 'Unknown',
            brand_id: p.brands?.id || p.brand_id,
            user_email: userMap[p.brands?.owner_user_id] || 'Unknown',
            aio_status: promptStatusMap[p.id]?.aio ?? 'not_run',
            claude_status: promptStatusMap[p.id]?.claude ?? 'not_run',
          }))

          // For onboarding batches, fetch brand/user directly (prompt_ids is empty)
          let onboardingBrandName: string | null = null
          let onboardingUserEmail: string | null = null
          if (schedule.batch_type === 'onboarding' && schedule.brand_id) {
            const { data: brd } = await supabase.from('brands').select('name, owner_user_id').eq('id', schedule.brand_id).single()
            onboardingBrandName = brd?.name || null
            if (brd?.owner_user_id) {
              const { data: u } = await supabase.from('users').select('email').eq('id', brd.owner_user_id).single()
              onboardingUserEmail = u?.email || null
            }
          }

          // Only fetch actual execution visual state for batches that have run.
          // Pending/running batches have no real login result yet — show nothing.
          let batchVisualState: string | null = null
          if (schedule.status === 'completed' || schedule.status === 'failed') {
            const { data: forensicRow } = await supabase
              .from('automation_forensics')
              .select('visual_state')
              .eq('batch_id', schedule.id)
              .eq('operation_type', 'batch_execution')
              .order('timestamp', { ascending: false })
              .limit(1)
              .maybeSingle()
            batchVisualState = forensicRow?.visual_state ?? null
          }

          // Compute stalled status: running for >30 min = stalled (display only)
          const stalledCutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString()
          const bme = bmeBySchedule[schedule.id] || {}
          const normalizeBME = (row: any) => {
            if (!row) return null
            let status = row.status
            if (status === 'running' && row.started_at && row.started_at < stalledCutoff) status = 'stalled'
            return { ...row, status }
          }

          return {
            id: schedule.id,
            schedule_date: schedule.schedule_date,
            batch_number: schedule.batch_number,
            execution_time: schedule.execution_time,
            status: schedule.status,
            batch_size: schedule.batch_size,
            prompt_ids: schedule.prompt_ids,
            batch_type: schedule.batch_type || 'regular',
            onboarding_brand_name: onboardingBrandName,
            onboarding_user_email: onboardingUserEmail,
            account_assigned: schedule.chatgpt_accounts?.email,
            proxy_assigned: `${schedule.chatgpt_accounts?.proxy_host}:${schedule.chatgpt_accounts?.proxy_port}`,
            account_last_visual_state: batchVisualState,
            session_id_assigned: schedule.chatgpt_accounts?.browserless_session_id,
            prompts: enrichedPrompts,
            modelExecutions: {
              chatgpt:            normalizeBME(bme['chatgpt'] || null),
              google_ai_overview: normalizeBME(bme['google_ai_overview'] || null),
              claude:             normalizeBME(bme['claude'] || null),
            },
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

      // Re-compute BME and forcibly patch modelExecutions onto schedule items.
      // This runs in the 'all' block which is confirmed to execute latest code.
      const freshScheduleIds = (enrichedQueue || []).map((s: any) => s.id).filter(Boolean)
      if (freshScheduleIds.length > 0) {
        const { data: bmeRowsFresh } = await supabase
          .from('batch_model_executions')
          .select('schedule_id, model, status, prompts_attempted, prompts_ok, prompts_no_result, prompts_failed, started_at, completed_at, error_message')
          .in('schedule_id', freshScheduleIds)
        const bmeFresh: Record<string, Record<string, any>> = {}
        for (const row of (bmeRowsFresh || []) as any[]) {
          if (!bmeFresh[row.schedule_id]) bmeFresh[row.schedule_id] = {}
          bmeFresh[row.schedule_id][row.model] = row
        }
        const stalledCutoffFresh = new Date(Date.now() - 30 * 60 * 1000).toISOString()
        const normBME = (row: any) => {
          if (!row) return null
          let st = row.status
          if (st === 'running' && row.started_at && row.started_at < stalledCutoffFresh) st = 'stalled'
          return { ...row, status: st }
        }
        for (const item of (enrichedQueue || [])) {
          const bme = bmeFresh[item.id] || {}
          item.modelExecutions = {
            chatgpt:            normBME(bme['chatgpt'] || null),
            google_ai_overview: normBME(bme['google_ai_overview'] || null),
            claude:             normBME(bme['claude'] || null),
          }
        }
      }

      return NextResponse.json({
        success: true,
        _debug: {
          scheduleCount: (enrichedQueue || []).length,
          firstItemKeys: enrichedQueue?.[0] ? Object.keys(enrichedQueue[0]) : [],
          firstModelExec: enrichedQueue?.[0]?.modelExecutions ?? 'MISSING',
        },
        data: {
          storageStateHealth: storageStateHealthAll || [],
          sessionMatrix: sessionsResult.data || [],
          citationTrace: transformedCitations,
          schedulingQueue: enrichedQueue || [],
          systemCapacity
        }
      }, { headers: { 'Cache-Control': 'no-store' } })
    }

    // Table E: System Capacity
    if (table === 'capacity') {
      const capacityData = await getSystemCapacity(supabase)
      return NextResponse.json({ success: true, data: capacityData })
    }

    // Table F: Onboarding Forensic
    if (table === 'onboarding') {
      const brandId = searchParams.get('brand_id')

      // Always return the brand list
      const { data: rawBrands, error: brandsError } = await supabase
        .from('brands')
        .select('id, name, domain, first_report_status, onboarding_phase, onboarding_completed, created_at, onboarding_daily_report_id, owner_user_id')
        .not('first_report_status', 'is', null)
        .neq('first_report_status', 'idle')
        .order('created_at', { ascending: false })
        .limit(50)

      if (brandsError) {
        return NextResponse.json({ success: false, error: 'brands query failed: ' + brandsError.message, brands: [], detail: null })
      }

      const ownerIds = [...new Set((rawBrands || []).map((b: any) => b.owner_user_id))]
      const usersResult = ownerIds.length > 0
        ? await supabase.from('users').select('id, email').in('id', ownerIds)
        : { data: [] as any[], error: null }
      const userRows = usersResult.data

      const userMap: Record<string, string> = {}
      for (const u of (userRows || []) as any[]) userMap[u.id] = u.email

      const brands = (rawBrands || []).map((b: any) => ({
        id: b.id,
        name: b.name,
        domain: b.domain,
        firstReportStatus: b.first_report_status,
        onboardingPhase: b.onboarding_phase,
        onboardingCompleted: b.onboarding_completed,
        createdAt: b.created_at,
        onboardingDailyReportId: b.onboarding_daily_report_id,
        userEmail: userMap[b.owner_user_id] || b.owner_user_id,
      }))

      if (!brandId) {
        return NextResponse.json({ success: true, brands, detail: null })
      }

      const brand = brands.find((b: any) => b.id === brandId)
      if (!brand) {
        return NextResponse.json({ success: true, brands, detail: null })
      }

      const [{ data: prompts }, { data: accounts }] = await Promise.all([
        supabase
          .from('brand_prompts')
          .select('id, raw_prompt, improved_prompt, onboarding_wave, onboarding_status, onboarding_claimed_account_id, onboarding_claimed_at')
          .eq('brand_id', brandId)
          .order('onboarding_wave')
          .order('onboarding_claimed_at', { ascending: true }),
        supabase.from('chatgpt_accounts').select('id, email'),
      ])

      const accountMap: Record<string, string> = {}
      for (const a of (accounts || []) as any[]) accountMap[a.id] = a.email

      let report: any = null
      if (brand.onboardingDailyReportId) {
        const { data: dr } = await supabase
          .from('daily_reports')
          .select('id, status, is_partial, total_prompts, completed_prompts, visibility_score, share_of_voice_data, chatgpt_ok, chatgpt_attempted, google_ai_overview_ok, google_ai_overview_attempted, claude_ok, claude_attempted, chatgpt_status, google_ai_overview_status, claude_status, created_at, completed_at')
          .eq('id', brand.onboardingDailyReportId)
          .single()
        report = dr
      }

      let promptResults: any[] = []
      if (brand.onboardingDailyReportId) {
        const { data: prs } = await supabase
          .from('prompt_results')
          .select('id, brand_prompt_id, provider, chatgpt_response, google_ai_overview_response, claude_response, brand_mentioned, error_message, created_at')
          .eq('daily_report_id', brand.onboardingDailyReportId)
          .order('created_at')
        promptResults = prs || []
      }

      // Build per-prompt result map
      const resultMap: Record<string, any> = {}
      for (const pr of promptResults) {
        const key = pr.brand_prompt_id
        if (!resultMap[key]) resultMap[key] = { hasChat: false, hasGoogle: false, hasClaude: false, brandMentioned: false, chatCreatedAt: null, googleCreatedAt: null }
        if (pr.chatgpt_response) { resultMap[key].hasChat = true; resultMap[key].chatCreatedAt = pr.created_at }
        if (pr.google_ai_overview_response) { resultMap[key].hasGoogle = true; resultMap[key].googleCreatedAt = pr.created_at }
        if (pr.claude_response) resultMap[key].hasClaude = true
        if (pr.brand_mentioned) resultMap[key].brandMentioned = true
      }

      const enrichedPrompts = (prompts || []).map((p: any) => ({
        ...p,
        claimedAccountEmail: p.onboarding_claimed_account_id ? (accountMap[p.onboarding_claimed_account_id] || p.onboarding_claimed_account_id) : null,
        results: resultMap[p.id] || { hasChat: false, hasGoogle: false, hasClaude: false, brandMentioned: false, chatCreatedAt: null, googleCreatedAt: null },
      }))

      // Build chunks by grouping on same (account_id + claimed_at)
      const chunkMap: Record<string, any> = {}
      for (const p of enrichedPrompts) {
        if (!p.onboarding_claimed_account_id || !p.onboarding_claimed_at) continue
        const key = `${p.onboarding_claimed_account_id}::${p.onboarding_claimed_at}`
        if (!chunkMap[key]) {
          chunkMap[key] = { key, wave: p.onboarding_wave, accountEmail: p.claimedAccountEmail, claimedAt: p.onboarding_claimed_at, prompts: [] }
        }
        chunkMap[key].prompts.push(p)
      }

      const chunks = Object.values(chunkMap).map((chunk: any) => {
        const total = chunk.prompts.length
        const completed = chunk.prompts.filter((p: any) => p.onboarding_status === 'completed').length
        const failed = chunk.prompts.filter((p: any) => p.onboarding_status === 'failed').length
        const claimed = chunk.prompts.filter((p: any) => p.onboarding_status === 'claimed').length
        const chatDone = chunk.prompts.filter((p: any) => p.results.hasChat).length
        const googleDone = chunk.prompts.filter((p: any) => p.results.hasGoogle).length
        const claudeDone = chunk.prompts.filter((p: any) => p.results.hasClaude).length
        const mentionCount = chunk.prompts.filter((p: any) => p.results.brandMentioned).length
        const chatTimes = chunk.prompts.map((p: any) => p.results.chatCreatedAt).filter(Boolean)
        const completedAt = chatTimes.length > 0 ? [...chatTimes].sort().at(-1) : null
        const durationMs = completedAt ? new Date(completedAt).getTime() - new Date(chunk.claimedAt).getTime() : null
        let status = claimed > 0 ? 'running' : (failed === total ? 'failed' : (failed > 0 ? 'partial' : 'completed'))
        const ageMin = (Date.now() - new Date(chunk.claimedAt).getTime()) / 60000
        if (status === 'running' && ageMin > 14 && chatDone === 0) status = 'timed_out'
        return { ...chunk, total, completed, failed, claimed, chatDone, googleDone, claudeDone, mentionCount, completedAt, durationMs, status }
      }).sort((a: any, b: any) => new Date(a.claimedAt).getTime() - new Date(b.claimedAt).getTime())

      // Schedule injection check (tomorrow's date)
      const tomorrow = new Date()
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
      const tomorrowStr = tomorrow.toISOString().split('T')[0]
      const { data: injectedSchedules } = await supabase
        .from('daily_schedules')
        .select('id, execution_time, batch_size, status')
        .eq('brand_id', brandId)
        .gte('execution_time', `${tomorrowStr}T00:00:00Z`)
        .order('execution_time')

      let bmeCount = 0
      if (injectedSchedules && injectedSchedules.length > 0) {
        const { count } = await supabase
          .from('batch_model_executions')
          .select('id', { count: 'exact', head: true })
          .in('schedule_id', injectedSchedules.map((s: any) => s.id))
        bmeCount = count || 0
      }

      // Build incident log
      const incidents: { time: string; event: string; detail: string }[] = []
      if (report?.created_at) incidents.push({ time: report.created_at, event: 'Report created', detail: `${brand.onboardingDailyReportId?.substring(0, 8)}, is_partial=true` })
      const wave2Prompts = enrichedPrompts.filter((p: any) => p.onboarding_wave === 2 && p.onboarding_claimed_at)
      if (wave2Prompts.length > 0) {
        const wave2Start = wave2Prompts.map((p: any) => p.onboarding_claimed_at).sort()[0]
        incidents.push({ time: wave2Start, event: 'Wave 1 complete', detail: 'finalizePhase(1) → Phase 1 EOD triggered' })
      }
      const sovCalcAt = report?.share_of_voice_data?.calculated_at
      if (sovCalcAt) incidents.push({ time: sovCalcAt, event: 'Phase 1 EOD complete', detail: `visibility_score=${report.visibility_score || '?'}, entities=${report.share_of_voice_data?.entities?.length || 0}` })
      for (const chunk of chunks) {
        if (chunk.status === 'timed_out') incidents.push({ time: chunk.claimedAt, event: 'Chunk timeout', detail: `${chunk.total} prompts stuck as claimed (${chunk.accountEmail?.split('@')[0]})` })
      }
      if (brand.firstReportStatus === 'succeeded' && report?.completed_at) incidents.push({ time: report.completed_at, event: 'Onboarding complete', detail: 'Phase 2 EOD done → first_report_status=succeeded' })
      incidents.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())

      return NextResponse.json({
        success: true,
        brands,
        detail: { brand, report, prompts: enrichedPrompts, chunks, scheduleInjection: { schedules: injectedSchedules || [], bmeCount }, incidents }
      })
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
