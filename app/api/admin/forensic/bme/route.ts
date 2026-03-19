import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const today = new Date().toISOString().split('T')[0]
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]

    // Get all schedule IDs for yesterday + today
    const { data: schedules, error: schedErr } = await supabase
      .from('daily_schedules')
      .select('id')
      .gte('schedule_date', yesterday)
      .lte('schedule_date', today)

    if (schedErr) {
      return NextResponse.json({ error: schedErr.message, data: {} }, { headers: { 'Cache-Control': 'no-store' } })
    }

    const scheduleIds = (schedules || []).map((s: any) => s.id)
    if (scheduleIds.length === 0) {
      return NextResponse.json({ data: {}, scheduleCount: 0 }, { headers: { 'Cache-Control': 'no-store' } })
    }

    const { data: rows, error: bmeErr } = await supabase
      .from('batch_model_executions')
      .select('schedule_id, model, status, prompts_attempted, prompts_ok, prompts_no_result, prompts_failed, started_at, completed_at, error_message')
      .in('schedule_id', scheduleIds)

    if (bmeErr) {
      return NextResponse.json({ error: bmeErr.message, data: {} }, { headers: { 'Cache-Control': 'no-store' } })
    }

    // Build map: { [scheduleId]: { chatgpt: row, google_ai_overview: row, claude: row } }
    const bmeMap: Record<string, Record<string, any>> = {}
    for (const row of (rows || []) as any[]) {
      if (!bmeMap[row.schedule_id]) bmeMap[row.schedule_id] = {}
      bmeMap[row.schedule_id][row.model] = row
    }

    return NextResponse.json(
      { data: bmeMap, scheduleCount: scheduleIds.length, bmeRowCount: (rows || []).length },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (err: any) {
    return NextResponse.json({ error: err.message, data: {} }, { headers: { 'Cache-Control': 'no-store' } })
  }
}
