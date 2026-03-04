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
      // 2. Delete prompt_results (via brand_prompts join)
      const { data: prompts } = await supabaseAdmin
        .from('brand_prompts')
        .select('id')
        .in('brand_id', brandIds)

      const promptIds = (prompts || []).map(p => p.id)
      if (promptIds.length > 0) {
        await supabaseAdmin
          .from('prompt_results')
          .delete()
          .in('brand_prompt_id', promptIds)
      }

      // 3. Delete brand_prompts
      await supabaseAdmin
        .from('brand_prompts')
        .delete()
        .in('brand_id', brandIds)

      // 4. Delete daily_reports
      await supabaseAdmin
        .from('daily_reports')
        .delete()
        .in('brand_id', brandIds)

      // 5. Delete daily_schedules
      await supabaseAdmin
        .from('daily_schedules')
        .delete()
        .in('brand_id', brandIds)

      // 6. Delete brand_competitors
      await supabaseAdmin
        .from('brand_competitors')
        .delete()
        .in('brand_id', brandIds)

      // 7. Delete brands
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
