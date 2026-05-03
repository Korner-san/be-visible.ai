import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

type PromptUpdate = {
  id: string
  text: string
  category: string
  isActive: boolean
}

type PromptAdd = {
  tempId: string
  text: string
  category: string
  isActive: boolean
}

const MAX_BATCH_SIZE = 6

function normalizeText(value: unknown) {
  return String(value || '').trim()
}

function normalizeCategory(value: unknown) {
  return normalizeText(value) || 'General'
}

async function getPromptLimit(supabase: ReturnType<typeof createServiceClient>, ownerUserId: string) {
  const { data, error } = await supabase.rpc('get_active_prompt_limit', { p_user_id: ownerUserId })
  if (error) {
    console.warn('[prompts/save-all] get_active_prompt_limit failed, falling back to 50:', error.message)
    return 50
  }
  return Number(data) || 50
}

async function resyncPendingSchedules(
  supabase: ReturnType<typeof createServiceClient>,
  brandId: string,
  changedPromptIds: string[],
) {
  if (changedPromptIds.length === 0) return

  const today = new Date().toISOString().split('T')[0]
  const { data: activePrompts, error: activeErr } = await supabase
    .from('brand_prompts')
    .select('id, created_at')
    .eq('brand_id', brandId)
    .eq('status', 'active')
    .is('deleted_at', null)
    .order('created_at', { ascending: true })

  if (activeErr) {
    console.warn('[prompts/save-all] Could not load active prompts for schedule sync:', activeErr.message)
    return
  }

  const activeIds = new Set((activePrompts || []).map(p => p.id))

  const { data: schedules, error: schedulesErr } = await supabase
    .from('daily_schedules')
    .select('id, prompt_ids, batch_size, schedule_date, execution_time, status')
    .eq('brand_id', brandId)
    .eq('status', 'pending')
    .gte('schedule_date', today)
    .order('execution_time', { ascending: true })

  if (schedulesErr) {
    console.warn('[prompts/save-all] Could not load pending schedules for sync:', schedulesErr.message)
    return
  }

  const scheduledIds = new Set<string>()

  for (const schedule of schedules || []) {
    const currentIds = Array.isArray(schedule.prompt_ids) ? schedule.prompt_ids : []
    const filteredIds = currentIds.filter((id: string) => activeIds.has(id))
    filteredIds.forEach((id: string) => scheduledIds.add(id))

    if (filteredIds.length !== currentIds.length) {
      await supabase
        .from('daily_schedules')
        .update({
          prompt_ids: filteredIds,
          batch_size: filteredIds.length,
          error_message: filteredIds.length === 0 ? 'Skipped after Manage Prompts sync: no active prompts remain in this batch' : null,
        })
        .eq('id', schedule.id)
    }
  }

  const newlyActiveIds = changedPromptIds.filter(id => activeIds.has(id) && !scheduledIds.has(id))
  if (newlyActiveIds.length === 0 || !schedules || schedules.length === 0) return

  let pendingToAdd = [...newlyActiveIds]
  for (const schedule of schedules) {
    if (pendingToAdd.length === 0) break
    const currentIds = (Array.isArray(schedule.prompt_ids) ? schedule.prompt_ids : [])
      .filter((id: string) => activeIds.has(id))
    const availableSlots = Math.max(0, MAX_BATCH_SIZE - currentIds.length)
    if (availableSlots === 0) continue

    const toAppend = pendingToAdd.splice(0, availableSlots)
    const nextIds = [...currentIds, ...toAppend]
    toAppend.forEach(id => scheduledIds.add(id))

    await supabase
      .from('daily_schedules')
      .update({
        prompt_ids: nextIds,
        batch_size: nextIds.length,
        error_message: null,
      })
      .eq('id', schedule.id)
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const brandId = normalizeText(body.brandId)
    const toDelete: string[] = Array.isArray(body.toDelete) ? body.toDelete : []
    const toAdd: PromptAdd[] = Array.isArray(body.toAdd) ? body.toAdd : []
    const toUpdate: PromptUpdate[] = Array.isArray(body.toUpdate) ? body.toUpdate : []

    if (!brandId) {
      return NextResponse.json({ success: false, error: 'brandId is required' }, { status: 400 })
    }

    const authSupabase = await createClient()
    const { data: { user }, error: authError } = await authSupabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const adminSupabase = createServiceClient()
    const { data: brand, error: brandError } = await adminSupabase
      .from('brands')
      .select('id, name, owner_user_id, is_demo')
      .eq('id', brandId)
      .single()

    if (brandError || !brand || brand.owner_user_id !== user.id || brand.is_demo) {
      return NextResponse.json({ success: false, error: 'Brand not found or access denied' }, { status: 404 })
    }

    const promptLimit = await getPromptLimit(adminSupabase, user.id)

    const { data: existingPrompts, error: existingError } = await adminSupabase
      .from('brand_prompts')
      .select('id, raw_prompt, improved_prompt, category, status, is_active, created_at, deleted_at')
      .eq('brand_id', brandId)

    if (existingError) {
      return NextResponse.json({ success: false, error: existingError.message }, { status: 500 })
    }

    const existingById = new Map((existingPrompts || []).map(prompt => [prompt.id, prompt]))
    const activeCountBeforeChanges = (existingPrompts || []).filter(prompt =>
      prompt.status === 'active' &&
      !prompt.deleted_at &&
      !toDelete.includes(prompt.id) &&
      !toUpdate.some(update => update.id === prompt.id && update.isActive === false)
    ).length

    let activeSlots = Math.max(0, promptLimit - activeCountBeforeChanges)
    const changedPromptIds = new Set<string>()
    const skippedDuplicates: string[] = []
    const insertedAsInactive: string[] = []
    const added: Array<{ tempId: string; id: string; isActive: boolean }> = []

    const validDeleteIds = toDelete.filter(id => existingById.has(id))
    if (validDeleteIds.length > 0) {
      const { error } = await adminSupabase
        .from('brand_prompts')
        .update({
          status: 'inactive',
          is_active: false,
          deleted_at: new Date().toISOString(),
          deleted_by: user.id,
          updated_at: new Date().toISOString(),
        })
        .eq('brand_id', brandId)
        .in('id', validDeleteIds)

      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
      validDeleteIds.forEach(id => changedPromptIds.add(id))
    }

    for (const update of toUpdate) {
      const existing = existingById.get(update.id)
      if (!existing || existing.deleted_at) continue

      const wantsActive = Boolean(update.isActive)
      const wasActive = existing.status === 'active'
      const canBeActive = wantsActive && (wasActive || activeSlots > 0)
      const finalStatus = canBeActive ? 'active' : 'inactive'
      if (wantsActive && !wasActive && canBeActive) activeSlots -= 1

      const { error } = await adminSupabase
        .from('brand_prompts')
        .update({
          improved_prompt: normalizeText(update.text),
          category: normalizeCategory(update.category),
          status: finalStatus,
          is_active: finalStatus === 'active',
          updated_at: new Date().toISOString(),
        })
        .eq('brand_id', brandId)
        .eq('id', update.id)
        .is('deleted_at', null)

      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
      changedPromptIds.add(update.id)
    }

    const activeTexts = new Set(
      (existingPrompts || [])
        .filter(prompt => !prompt.deleted_at)
        .map(prompt => normalizeText(prompt.improved_prompt || prompt.raw_prompt).toLowerCase())
    )

    for (const prompt of toAdd) {
      const text = normalizeText(prompt.text)
      if (!text) continue
      const normalized = text.toLowerCase()
      if (activeTexts.has(normalized)) {
        skippedDuplicates.push(prompt.tempId)
        continue
      }
      activeTexts.add(normalized)

      const wantsActive = Boolean(prompt.isActive)
      const canBeActive = wantsActive && activeSlots > 0
      const finalStatus = canBeActive ? 'active' : 'inactive'
      if (canBeActive) activeSlots -= 1
      if (wantsActive && !canBeActive) insertedAsInactive.push(prompt.tempId)

      const sourceCode = `user_custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const { data, error } = await adminSupabase
        .from('brand_prompts')
        .insert({
          brand_id: brandId,
          source_template_code: sourceCode,
          raw_prompt: text,
          improved_prompt: text,
          category: normalizeCategory(prompt.category),
          status: finalStatus,
          is_active: finalStatus === 'active',
          source: 'user_added',
          generation_metadata: {
            created_via: 'manage_prompts_page',
            created_at: new Date().toISOString(),
          },
        })
        .select('id, status, is_active')
        .single()

      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
      added.push({ tempId: prompt.tempId, id: data.id, isActive: data.status === 'active' })
      changedPromptIds.add(data.id)
    }

    await resyncPendingSchedules(adminSupabase, brandId, Array.from(changedPromptIds))

    return NextResponse.json({
      success: true,
      added,
      skippedDuplicates,
      insertedAsInactive,
      promptLimit,
    })
  } catch (error) {
    console.error('[prompts/save-all] Unexpected error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    }, { status: 500 })
  }
}
