import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

// Prevent caching to ensure cron jobs run every time
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const timestamp = new Date().toISOString()
    const environment = process.env.NODE_ENV || 'unknown'
    const userAgent = request.headers.get('user-agent') || 'unknown'
    const isGitHubActions = userAgent.includes('GitHub-Actions-Cron')
    const isVercelCron = !userAgent.includes('Mozilla') && !userAgent.includes('Chrome') && !isGitHubActions
    const isManualTrigger = userAgent.includes('Mozilla') || userAgent.includes('Chrome')
    
    if (isGitHubActions) {
      console.log(`🚀 [GITHUB ACTIONS CRON] *** AUTOMATIC TRIGGER VIA GITHUB ACTIONS *** - Timestamp: ${timestamp}, Environment: ${environment}`)
    } else if (isVercelCron) {
      console.log(`🤖 [VERCEL CRON TRIGGER] *** VERCEL CRON SCHEDULER TRIGGERED THIS AUTOMATICALLY *** - Timestamp: ${timestamp}, Environment: ${environment}`)
    } else {
      console.log(`👤 [MANUAL TRIGGER] User visited URL manually - Timestamp: ${timestamp}, Environment: ${environment}, UserAgent: ${userAgent}`)
    }
    console.log(`🕐 [CRON] Daily reports cron job started - Timestamp: ${timestamp}, Environment: ${environment}`)
    
    // Vercel Cron Jobs are automatically authenticated, no need for manual auth
    // The cron job is defined in vercel.json and only Vercel can trigger it
    // Use service client to bypass RLS for cron jobs

    const supabase = createServiceClient()

    // Get all brands that have completed onboarding and have active prompts
    // For now, limit to test user only
    const { data: testUser, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('email', 'kk1995current@gmail.com')
      .single()

    if (userError || !testUser) {
      console.log('ℹ️ [CRON] Test user not found, skipping daily reports')
      return NextResponse.json({ 
        success: true, 
        message: 'Test user not found, no reports generated' 
      })
    }

    console.log(`👤 [CRON] Found test user: ${testUser.id}`)

    // Get brands for test user
    const { data: brands, error: brandsError } = await supabase
      .from('brands')
      .select(`
        id, 
        name, 
        owner_user_id,
        brand_prompts!inner(id)
      `)
      .eq('owner_user_id', testUser.id)
      .eq('onboarding_completed', true)
      .eq('brand_prompts.status', 'active')

    if (brandsError) {
      console.error('❌ [CRON] Error fetching brands:', brandsError)
      return NextResponse.json({ error: 'Failed to fetch brands' }, { status: 500 })
    }

    if (!brands || brands.length === 0) {
      console.log('ℹ️ [CRON] No brands with active prompts found')
      return NextResponse.json({ 
        success: true, 
        message: 'No brands with active prompts found' 
      })
    }

    console.log(`📊 [CRON] Found ${brands.length} brands to process:`, brands.map(b => `${b.name} (${b.id})`))

    const results = []

    // Process each brand
    for (const brand of brands) {
      try {
        console.log(`🔄 [CRON] Processing brand: ${brand.name} (${brand.id})`)

        // Check if report already exists for today and is complete
        const today = new Date().toISOString().split('T')[0]
        const { data: existingReport } = await supabase
          .from('daily_reports')
          .select('id, generated, perplexity_status, google_ai_overview_status')
          .eq('brand_id', brand.id)
          .eq('report_date', today)
          .single()

        if (existingReport) {
          if (existingReport.generated) {
            console.log(`ℹ️ [CRON] Report already complete for ${brand.name} today`)
            results.push({
              brandId: brand.id,
              brandName: brand.name,
              status: 'skipped',
              message: 'Report already complete for today'
            })
            continue
          } else {
            console.log(`🔄 [CRON] Found incomplete report for ${brand.name}, resuming...`)
            console.log(`📊 [CRON] Current status - Perplexity: ${existingReport.perplexity_status}, Google AI Overview: ${existingReport.google_ai_overview_status}`)
          }
        }

        // Get active prompts count for logging
        const { data: activePrompts, error: promptsError } = await supabase
          .from('brand_prompts')
          .select('id')
          .eq('brand_id', brand.id)
          .eq('status', 'active')

        const promptCount = activePrompts?.length || 0
        console.log(`📋 [CRON] Brand ${brand.name} has ${promptCount} active prompts`)

        // Call the daily report generation API
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
        const reportResponse = await fetch(`${baseUrl}/api/reports/generate-daily`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            brandId: brand.id,
            manual: false,
            fromCron: true
          })
        })

        const reportResult = await reportResponse.json()

        if (reportResult.success) {
          console.log(`✅ [CRON] Successfully generated report for ${brand.name}`)
          console.log(`📊 [CRON] Report stats - Prompts: ${reportResult.totalPrompts}, Mentions: ${reportResult.totalMentions}, Avg Position: ${reportResult.averagePosition}`)
          
          results.push({
            brandId: brand.id,
            brandName: brand.name,
            status: 'success',
            reportId: reportResult.reportId,
            totalPrompts: reportResult.totalPrompts,
            totalMentions: reportResult.totalMentions,
            averagePosition: reportResult.averagePosition,
            sentimentScores: reportResult.sentimentScores
          })
        } else {
          console.error(`❌ [CRON] Failed to generate report for ${brand.name}:`, reportResult.error)
          results.push({
            brandId: brand.id,
            brandName: brand.name,
            status: 'failed',
            error: reportResult.error
          })
        }

        // Add delay between brands to avoid overwhelming the API
        if (brands.length > 1) {
          await new Promise(resolve => setTimeout(resolve, 5000))
        }

      } catch (error) {
        console.error(`❌ [CRON] Error processing brand ${brand.name}:`, error)
        results.push({
          brandId: brand.id,
          brandName: brand.name,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }

    console.log('🎉 [CRON] Daily reports cron job completed')
    console.log(`📈 [CRON] Final results:`, results)

    return NextResponse.json({
      success: true,
      message: `Processed ${brands.length} brands`,
      timestamp,
      environment,
      results
    })

  } catch (error) {
    console.error('❌ [CRON] Unexpected error in daily reports cron:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// Also handle POST for manual triggers
export async function POST(request: NextRequest) {
  return GET(request)
}
