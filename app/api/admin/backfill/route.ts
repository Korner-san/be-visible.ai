import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const { dates, testOnly = true } = await request.json()
    
    if (!dates || !Array.isArray(dates)) {
      return NextResponse.json({
        success: false,
        error: 'Please provide an array of dates to backfill (YYYY-MM-DD format)'
      }, { status: 400 })
    }

    console.log('🔄 [BACKFILL] Starting backfill for dates:', dates)

    const supabase = await createClient()

    // Get test user
    const { data: testUser, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('email', 'kk1995current@gmail.com')
      .single()

    if (userError || !testUser) {
      return NextResponse.json({
        success: false,
        error: 'Test user not found'
      }, { status: 404 })
    }

    // Get user's brands
    const { data: brands, error: brandsError } = await supabase
      .from('brands')
      .select('id, name')
      .eq('owner_user_id', testUser.id)
      .eq('onboarding_completed', true)

    if (brandsError || !brands || brands.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No completed brands found for test user'
      }, { status: 404 })
    }

    const results = []

    for (const date of dates) {
      console.log(`📅 [BACKFILL] Processing date: ${date}`)
      
      for (const brand of brands) {
        try {
          // Check if report already exists
          const { data: existingReport } = await supabase
            .from('daily_reports')
            .select('id')
            .eq('brand_id', brand.id)
            .eq('report_date', date)
            .single()

          if (existingReport) {
            console.log(`ℹ️ [BACKFILL] Report already exists for ${brand.name} on ${date}`)
            results.push({
              date,
              brandId: brand.id,
              brandName: brand.name,
              status: 'skipped',
              message: 'Report already exists'
            })
            continue
          }

          if (testOnly) {
            console.log(`🧪 [BACKFILL] TEST MODE - Would create report for ${brand.name} on ${date}`)
            results.push({
              date,
              brandId: brand.id,
              brandName: brand.name,
              status: 'test_mode',
              message: 'Would create report (test mode)'
            })
          } else {
            // Create a manual daily report with the specified date
            const { data: dailyReport, error: reportError } = await supabase
              .from('daily_reports')
              .insert({
                brand_id: brand.id,
                report_date: date,
                status: 'completed',
                total_prompts: 0,
                completed_prompts: 0,
                total_mentions: 0,
                average_position: null,
                sentiment_scores: { positive: 0, neutral: 0, negative: 0 },
                created_at: new Date(`${date}T02:00:00Z`).toISOString(), // 2 AM UTC on that date
                completed_at: new Date(`${date}T02:30:00Z`).toISOString()
              })
              .select()
              .single()

            if (reportError) {
              console.error(`❌ [BACKFILL] Error creating report for ${brand.name} on ${date}:`, reportError)
              results.push({
                date,
                brandId: brand.id,
                brandName: brand.name,
                status: 'error',
                error: reportError.message
              })
            } else {
              console.log(`✅ [BACKFILL] Created placeholder report for ${brand.name} on ${date}`)
              results.push({
                date,
                brandId: brand.id,
                brandName: brand.name,
                status: 'created',
                reportId: dailyReport.id
              })
            }
          }

        } catch (error) {
          console.error(`❌ [BACKFILL] Error processing ${brand.name} on ${date}:`, error)
          results.push({
            date,
            brandId: brand.id,
            brandName: brand.name,
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error'
          })
        }
      }
    }

    console.log('🎉 [BACKFILL] Backfill completed')

    return NextResponse.json({
      success: true,
      message: `Processed ${dates.length} dates for ${brands.length} brands`,
      testMode: testOnly,
      results
    })

  } catch (error) {
    console.error('❌ [BACKFILL] Unexpected error:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Backfill endpoint - Use POST with dates array',
    example: {
      dates: ['2024-09-19', '2024-09-20', '2024-09-21'],
      testOnly: true
    }
  })
}
