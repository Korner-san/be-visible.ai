import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const PASSWORD = 'Korneret'

export async function GET(request: NextRequest) {
  const pw = request.headers.get('x-forensic-password')
  if (pw !== PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const brandId = request.nextUrl.searchParams.get('brand_id')

  // ── Brand list (always returned) ─────────────────────────────────────────
  const { data: rawBrands } = await supabase
    .from('brands')
    .select('id, name, domain, first_report_status, onboarding_phase, onboarding_completed, created_at, onboarding_daily_report_id, owner_user_id')
    .not('first_report_status', 'is', null)
    .neq('first_report_status', 'idle')
    .order('created_at', { ascending: false })
    .limit(50)

  // Fetch user emails for the brand list
  const ownerIds = [...new Set((rawBrands || []).map((b: any) => b.owner_user_id))]
  const { data: users } = ownerIds.length > 0
    ? await supabase.from('users').select('id, email').in('id', ownerIds)
    : { data: [] }

  const userMap: Record<string, string> = {}
  for (const u of (users || []) as any[]) userMap[u.id] = u.email

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
    return NextResponse.json({ brands, detail: null })
  }

  // ── Detail for selected brand ─────────────────────────────────────────────
  const brand = brands.find((b: any) => b.id === brandId)
  if (!brand) {
    return NextResponse.json({ brands, detail: null })
  }

  const [
    { data: prompts },
    { data: accounts },
  ] = await Promise.all([
    supabase
      .from('brand_prompts')
      .select('id, raw_prompt, improved_prompt, onboarding_wave, onboarding_status, onboarding_claimed_account_id, onboarding_claimed_at')
      .eq('brand_id', brandId)
      .order('onboarding_wave')
      .order('onboarding_claimed_at', { ascending: true }),
    supabase
      .from('chatgpt_accounts')
      .select('id, email'),
  ])

  const accountMap: Record<string, string> = {}
  for (const a of (accounts || []) as any[]) accountMap[a.id] = a.email

  // Fetch the daily report
  let report: any = null
  if (brand.onboardingDailyReportId) {
    const { data: dr } = await supabase
      .from('daily_reports')
      .select('id, status, is_partial, total_prompts, completed_prompts, visibility_score, share_of_voice_data, chatgpt_ok, chatgpt_attempted, google_ai_overview_ok, google_ai_overview_attempted, claude_ok, claude_attempted, chatgpt_status, google_ai_overview_status, claude_status, created_at, completed_at')
      .eq('id', brand.onboardingDailyReportId)
      .single()
    report = dr
  }

  // Fetch prompt_results for the daily report
  let promptResults: any[] = []
  if (brand.onboardingDailyReportId) {
    const { data: prs } = await supabase
      .from('prompt_results')
      .select('id, brand_prompt_id, provider, chatgpt_response, google_ai_overview_response, claude_response, brand_mentioned, error_message, created_at')
      .eq('daily_report_id', brand.onboardingDailyReportId)
      .order('created_at')
    promptResults = prs || []
  }

  // Build per-prompt result map: promptId → { hasChat, hasGoogle, hasClaude, brandMentioned }
  const resultMap: Record<string, { hasChat: boolean; hasGoogle: boolean; hasClaude: boolean; brandMentioned: boolean; chatCreatedAt: string | null; googleCreatedAt: string | null }> = {}
  for (const pr of promptResults) {
    const key = pr.brand_prompt_id
    if (!resultMap[key]) resultMap[key] = { hasChat: false, hasGoogle: false, hasClaude: false, brandMentioned: false, chatCreatedAt: null, googleCreatedAt: null }
    if (pr.chatgpt_response) { resultMap[key].hasChat = true; resultMap[key].chatCreatedAt = pr.created_at }
    if (pr.google_ai_overview_response) { resultMap[key].hasGoogle = true; resultMap[key].googleCreatedAt = pr.created_at }
    if (pr.claude_response) resultMap[key].hasClaude = true
    if (pr.brand_mentioned) resultMap[key].brandMentioned = true
  }

  // Enrich prompts
  const enrichedPrompts = (prompts || []).map((p: any) => ({
    ...p,
    claimedAccountEmail: p.onboarding_claimed_account_id ? (accountMap[p.onboarding_claimed_account_id] || p.onboarding_claimed_account_id) : null,
    results: resultMap[p.id] || { hasChat: false, hasGoogle: false, hasClaude: false, brandMentioned: false, chatCreatedAt: null, googleCreatedAt: null },
  }))

  // Build chunks: group by (account_id + claimed_at), only for claimed/completed prompts
  const chunkMap: Record<string, any> = {}
  for (const p of enrichedPrompts) {
    if (!p.onboarding_claimed_account_id || !p.onboarding_claimed_at) continue
    const key = `${p.onboarding_claimed_account_id}::${p.onboarding_claimed_at}`
    if (!chunkMap[key]) {
      chunkMap[key] = {
        key,
        wave: p.onboarding_wave,
        accountEmail: p.claimedAccountEmail,
        claimedAt: p.onboarding_claimed_at,
        prompts: [],
      }
    }
    chunkMap[key].prompts.push(p)
  }

  // Compute chunk stats
  const chunks = Object.values(chunkMap).map((chunk: any) => {
    const total = chunk.prompts.length
    const completed = chunk.prompts.filter((p: any) => p.onboarding_status === 'completed').length
    const failed = chunk.prompts.filter((p: any) => p.onboarding_status === 'failed').length
    const claimed = chunk.prompts.filter((p: any) => p.onboarding_status === 'claimed').length
    const chatDone = chunk.prompts.filter((p: any) => p.results.hasChat).length
    const googleDone = chunk.prompts.filter((p: any) => p.results.hasGoogle).length
    const claudeDone = chunk.prompts.filter((p: any) => p.results.hasClaude).length
    const mentionCount = chunk.prompts.filter((p: any) => p.results.brandMentioned).length

    // Estimate chunk end time from latest prompt result
    const chatTimes = chunk.prompts.map((p: any) => p.results.chatCreatedAt).filter(Boolean)
    const completedAt = chatTimes.length > 0 ? chatTimes.sort().at(-1) : null
    const durationMs = completedAt ? new Date(completedAt).getTime() - new Date(chunk.claimedAt).getTime() : null

    let status: string
    if (claimed > 0) status = 'running'
    else if (failed === total) status = 'failed'
    else if (failed > 0) status = 'partial'
    else status = 'completed'

    // Detect timeout: all claimed and no completedAt and claimed > 14 min ago
    const ageMin = (Date.now() - new Date(chunk.claimedAt).getTime()) / 60000
    if (status === 'running' && ageMin > 14 && chatDone === 0) status = 'timed_out'

    return {
      ...chunk,
      total,
      completed,
      failed,
      claimed,
      chatDone,
      googleDone,
      claudeDone,
      mentionCount,
      completedAt,
      durationMs,
      status,
    }
  }).sort((a: any, b: any) => new Date(a.claimedAt).getTime() - new Date(b.claimedAt).getTime())

  // Schedule injection check
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
    const schedIds = injectedSchedules.map((s: any) => s.id)
    const { count } = await supabase
      .from('batch_model_executions')
      .select('id', { count: 'exact', head: true })
      .in('schedule_id', schedIds)
    bmeCount = count || 0
  }

  // Build incident log from timestamps
  const incidents: { time: string; event: string; detail: string }[] = []

  if (report?.created_at) {
    incidents.push({ time: report.created_at, event: 'Report created', detail: `${brand.onboardingDailyReportId?.substring(0, 8)}, is_partial=true` })
  }

  // Wave 1 completion: earliest claimed_at of wave-2 prompts (implies wave-1 EOD just ran)
  const wave2Prompts = enrichedPrompts.filter((p: any) => p.onboarding_wave === 2 && p.onboarding_claimed_at)
  if (wave2Prompts.length > 0) {
    const wave2Start = wave2Prompts.map((p: any) => p.onboarding_claimed_at).sort()[0]
    incidents.push({ time: wave2Start, event: 'Wave 1 complete', detail: 'finalizePhase(1) → Phase 1 EOD triggered' })
  }

  // Phase 1 EOD: infer from share_of_voice_data.calculated_at
  const sovCalcAt = report?.share_of_voice_data?.calculated_at
  if (sovCalcAt) {
    incidents.push({ time: sovCalcAt, event: 'Phase 1 EOD complete', detail: `visibility_score=${report.visibility_score || '?'}, entities=${report.share_of_voice_data?.entities?.length || 0}` })
  }

  // Timed-out chunks
  for (const chunk of chunks) {
    if (chunk.status === 'timed_out') {
      incidents.push({ time: chunk.claimedAt, event: 'Chunk timeout', detail: `${chunk.total} prompts stuck as 'claimed' (${chunk.accountEmail?.split('@')[0]})` })
    }
  }

  // Final completion
  if (brand.firstReportStatus === 'succeeded' && report?.completed_at) {
    incidents.push({ time: report.completed_at, event: 'Onboarding complete', detail: 'Phase 2 EOD done → first_report_status=succeeded' })
  }

  incidents.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())

  return NextResponse.json({
    brands,
    detail: {
      brand,
      report,
      prompts: enrichedPrompts,
      chunks,
      scheduleInjection: {
        schedules: injectedSchedules || [],
        bmeCount,
      },
      incidents,
    },
  })
}
