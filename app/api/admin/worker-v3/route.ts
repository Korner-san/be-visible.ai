import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function queryTable<T>(
  name: string,
  query: PromiseLike<{ data: T[] | null; error: any }>
) {
  const { data, error } = await query

  if (error?.code === '42P01') {
    return { rows: [], missing: true, error: null }
  }

  if (error) {
    return { rows: [], missing: false, error: error.message || `Failed to query ${name}` }
  }

  return { rows: data || [], missing: false, error: null }
}

export async function GET(request: NextRequest) {
  try {
    const password = request.headers.get('x-worker-v3-password')
    if (password !== 'Korneret') {
      return NextResponse.json({
        success: false,
        message: 'Unauthorized',
      }, { status: 401 })
    }

    const [batches, items, leases, modelExecutions, eodRuns] = await Promise.all([
      queryTable(
        'worker_v3_batches',
        supabase
          .from('worker_v3_batches')
          .select('id, item_kind, schedule_date, execution_time, chatgpt_account_id, batch_number, batch_size, priority, status, is_retry, started_at, completed_at, error_message, created_at')
          .order('execution_time', { ascending: true })
          .limit(50)
      ),
      queryTable(
        'worker_v3_batch_items',
        supabase
          .from('worker_v3_batch_items')
          .select('id, batch_id, item_index, item_kind, schedule_date, user_id, brand_id, prompt_id, daily_report_id, onboarding_wave, is_retry, status, chatgpt_status, google_ai_overview_status, claude_status, error_message, created_at')
          .order('created_at', { ascending: false })
          .limit(250)
      ),
      queryTable(
        'worker_account_leases',
        supabase
          .from('worker_account_leases')
          .select('id, account_id, owner_type, owner_id, pid, hostname, started_at, heartbeat_at, expires_at, expected_done_at, hard_timeout_at, released_at, release_reason')
          .order('started_at', { ascending: false })
          .limit(50)
      ),
      queryTable(
        'worker_v3_model_executions',
        supabase
          .from('worker_v3_model_executions')
          .select('id, batch_id, item_id, provider, status, prompts_attempted, prompts_ok, prompts_failed, started_at, completed_at, error_message, created_at')
          .order('created_at', { ascending: false })
          .limit(250)
      ),
      queryTable(
        'worker_v3_eod_runs',
        supabase
          .from('worker_v3_eod_runs')
          .select('id, eod_kind, schedule_date, brand_id, daily_report_id, status, trigger_reason, started_at, completed_at, error_message, created_at')
          .order('created_at', { ascending: false })
          .limit(100)
      ),
    ])

    const tableState = {
      worker_v3_batches: !batches.missing,
      worker_v3_batch_items: !items.missing,
      worker_account_leases: !leases.missing,
      worker_v3_model_executions: !modelExecutions.missing,
      worker_v3_eod_runs: !eodRuns.missing,
    }

    const errors = [
      batches.error,
      items.error,
      leases.error,
      modelExecutions.error,
      eodRuns.error,
    ].filter(Boolean)

    return NextResponse.json({
      success: errors.length === 0,
      data: {
        tableState,
        batches: batches.rows,
        items: items.rows,
        leases: leases.rows,
        modelExecutions: modelExecutions.rows,
        eodRuns: eodRuns.rows,
        counts: {
          batches: batches.rows.length,
          items: items.rows.length,
          leases: leases.rows.length,
          modelExecutions: modelExecutions.rows.length,
          eodRuns: eodRuns.rows.length,
        },
      },
      errors,
      generatedAt: new Date().toISOString(),
    })
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown worker v3 admin error',
    }, { status: 500 })
  }
}
