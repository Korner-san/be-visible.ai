import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    // Verify caller is authenticated
    const authHeader = request.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '')
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: { user: callerUser }, error: authError } =
      await supabaseAdmin.auth.getUser(token)
    if (authError || !callerUser) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const { userId } = await request.json()
    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
    }

    // Only allow users to delete their own account
    if (callerUser.id !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // 1. Get all brand IDs for this user
    const { data: brands } = await supabaseAdmin
      .from('brands')
      .select('id')
      .eq('owner_user_id', userId)

    const brandIds = (brands || []).map(b => b.id)

    if (brandIds.length > 0) {
      // 2. Collect prompt IDs (needed for schedule cleanup before deletion)
      const { data: prompts } = await supabaseAdmin
        .from('brand_prompts')
        .select('id')
        .in('brand_id', brandIds)

      const promptIds = (prompts || []).map(p => p.id)
      const deletedPromptSet = new Set(promptIds)
      const today = new Date().toISOString().split('T')[0]

      // 3. Surgical batch cleanup — must run BEFORE brand_prompts is deleted
      //    (needs brand_prompts to look up the surviving brand for reassignment)
      if (promptIds.length > 0) {
        // Direction A: rows OWNED by deleted brand (brand_id IN brandIds) that also
        // contain prompts from OTHER brands. Reassign those rows to the surviving brand
        // so the other brands' prompts are not lost when we delete owned rows below.
        const { data: ownedSchedules } = await supabaseAdmin
          .from('daily_schedules')
          .select('id, prompt_ids, brand_id')
          .in('brand_id', brandIds)
          .eq('status', 'pending')
          .gte('schedule_date', today)

        for (const schedule of (ownedSchedules || [])) {
          const originalIds: string[] = schedule.prompt_ids || []
          const survivingIds = originalIds.filter((pid: string) => !deletedPromptSet.has(pid))
          if (survivingIds.length > 0) {
            // Row has other brands' prompts — reassign brand_id to the surviving first prompt's brand
            const { data: firstPromptRow } = await supabaseAdmin
              .from('brand_prompts')
              .select('brand_id')
              .eq('id', survivingIds[0])
              .single()
            await supabaseAdmin
              .from('daily_schedules')
              .update({
                prompt_ids: survivingIds,
                batch_size: survivingIds.length,
                brand_id: firstPromptRow?.brand_id ?? null,
              })
              .eq('id', schedule.id)
          }
          // survivingIds === 0: row is entirely this brand's prompts → step 5 will delete it
        }

        // Direction B: rows owned by OTHER brands (brand_id NOT IN brandIds) that
        // contain some of the deleted brand's prompts mixed in. Remove those prompts.
        const { data: crossBrandSchedules } = await supabaseAdmin
          .from('daily_schedules')
          .select('id, prompt_ids')
          .not('brand_id', 'in', `(${brandIds.join(',')})`)
          .eq('status', 'pending')
          .gte('schedule_date', today)

        for (const schedule of (crossBrandSchedules || [])) {
          const originalIds: string[] = schedule.prompt_ids || []
          const cleanedIds = originalIds.filter((pid: string) => !deletedPromptSet.has(pid))
          if (cleanedIds.length === 0) {
            // Batch became empty — delete it and its BME rows
            await supabaseAdmin.from('batch_model_executions').delete().eq('schedule_id', schedule.id)
            await supabaseAdmin.from('daily_schedules').delete().eq('id', schedule.id)
          } else if (cleanedIds.length !== originalIds.length) {
            await supabaseAdmin
              .from('daily_schedules')
              .update({ prompt_ids: cleanedIds, batch_size: cleanedIds.length })
              .eq('id', schedule.id)
          }
        }
      }

      // 4. Delete prompt_results
      if (promptIds.length > 0) {
        await supabaseAdmin
          .from('prompt_results')
          .delete()
          .in('brand_prompt_id', promptIds)
      }

      // 5. Delete brand_prompts
      await supabaseAdmin
        .from('brand_prompts')
        .delete()
        .in('brand_id', brandIds)

      // 6. Delete daily_reports
      await supabaseAdmin
        .from('daily_reports')
        .delete()
        .in('brand_id', brandIds)

      // 7. Delete remaining daily_schedules owned by this brand
      //    (safe now — Direction A above already reassigned cross-brand rows)
      await supabaseAdmin
        .from('daily_schedules')
        .delete()
        .in('brand_id', brandIds)

      // 8. Delete brand_competitors
      await supabaseAdmin
        .from('brand_competitors')
        .delete()
        .in('brand_id', brandIds)

      // 9. Delete prompt_execution_log
      await supabaseAdmin
        .from('prompt_execution_log')
        .delete()
        .in('brand_id', brandIds)

      // 10. Delete brands
      await supabaseAdmin
        .from('brands')
        .delete()
        .in('id', brandIds)
    }

    // 8. Delete from users table
    await supabaseAdmin
      .from('users')
      .delete()
      .eq('id', userId)

    // 9. Delete the auth user (final step — invalidates all tokens)
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId)
    if (deleteError) {
      console.error('[delete-account] Auth deletion failed:', deleteError.message)
      return NextResponse.json({ error: 'Auth deletion failed: ' + deleteError.message }, { status: 500 })
    }

    console.log('[delete-account] Account deleted:', userId)
    return NextResponse.json({ success: true })

  } catch (err) {
    console.error('[delete-account] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
