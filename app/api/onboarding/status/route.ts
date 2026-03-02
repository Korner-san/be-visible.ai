import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function GET(_request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 })
    }

    // Find the user's most recent completed non-demo brand
    const { data: brand, error: brandError } = await supabase
      .from('brands')
      .select('id, name, first_report_status, onboarding_daily_report_id, onboarding_phase')
      .eq('owner_user_id', user.id)
      .eq('is_demo', false)
      .eq('onboarding_completed', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (brandError || !brand) {
      return NextResponse.json({ success: false, error: 'No brand found' }, { status: 404 })
    }

    const adminSupabase = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Count completed prompts per wave, and fetch the anchored daily report
    const [wave1Result, wave2Result, reportResult] = await Promise.all([
      adminSupabase
        .from('brand_prompts')
        .select('id', { count: 'exact', head: true })
        .eq('brand_id', brand.id)
        .eq('onboarding_wave', 1)
        .eq('onboarding_status', 'completed'),
      adminSupabase
        .from('brand_prompts')
        .select('id', { count: 'exact', head: true })
        .eq('brand_id', brand.id)
        .eq('onboarding_wave', 2)
        .eq('onboarding_status', 'completed'),
      brand.onboarding_daily_report_id
        ? adminSupabase
            .from('daily_reports')
            .select('is_partial')
            .eq('id', brand.onboarding_daily_report_id)
            .single()
        : Promise.resolve({ data: null, error: null }),
    ])

    return NextResponse.json({
      success: true,
      brandId: brand.id,
      brandName: brand.name,
      firstReportStatus: brand.first_report_status,
      wave1Complete: wave1Result.count ?? 0,
      wave1Total: 6,
      wave2Complete: wave2Result.count ?? 0,
      wave2Total: 24,
      isPartial: reportResult.data?.is_partial ?? false,
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
