/**
 * ChatGPT Scheduler API - Phase 2
 * 
 * Endpoint to generate randomized batch schedules for daily processing
 * Integrates with Phase 1 discovery to create complete execution plan
 * 
 * POST /api/chatgpt/scheduler - Generate schedule for today or specified date
 */

import { NextRequest, NextResponse } from 'next/server'
import { generateDailyPromptInventory } from '@/lib/services/chatgpt-discovery'
import { generateAndPersistAllSchedules } from '@/lib/services/chatgpt-scheduler'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { scheduleDate, regenerate = false } = body
    
    // Parse schedule date or use today
    const date = scheduleDate ? new Date(scheduleDate) : new Date()
    
    console.log(`📅 [SCHEDULER API] Generating schedule for ${date.toDateString()}`)
    
    // Phase 1: Get daily prompt inventory
    console.log('🔍 [SCHEDULER API] Phase 1 - Discovering users and prompts...')
    const inventory = await generateDailyPromptInventory()
    
    if (inventory.totalPrompts === 0) {
      return NextResponse.json({
        success: true,
        message: 'No prompts to schedule',
        inventory
      })
    }
    
    // Phase 2: Generate and persist schedules
    console.log('📅 [SCHEDULER API] Phase 2 - Generating randomized schedules...')
    const results = await generateAndPersistAllSchedules(inventory, date)
    
    // Check if all schedules were created successfully
    const allSuccessful = results.every(r => r.success)
    const totalSchedules = results.reduce((sum, r) => sum + r.schedulesCreated, 0)
    
    return NextResponse.json({
      success: allSuccessful,
      inventory: {
        totalUsers: inventory.totalUsers,
        totalBrands: inventory.totalBrands,
        totalPrompts: inventory.totalPrompts
      },
      schedules: {
        totalCreated: totalSchedules,
        scheduleDate: date.toISOString().split('T')[0]
      },
      results
    })
    
  } catch (error) {
    console.error('❌ [SCHEDULER API] Error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    }, { status: 500 })
  }
}

// GET endpoint to view today's schedule
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const scheduleDate = searchParams.get('date') || new Date().toISOString().split('T')[0]
    
    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    
    let query = supabase
      .from('daily_schedules')
      .select('*')
      .eq('schedule_date', scheduleDate)
      .order('execution_time', { ascending: true })
    
    if (userId) {
      query = query.eq('user_id', userId)
    }
    
    const { data: schedules, error } = await query
    
    if (error) {
      throw error
    }
    
    return NextResponse.json({
      success: true,
      scheduleDate,
      totalBatches: schedules?.length || 0,
      schedules
    })
    
  } catch (error) {
    console.error('❌ [SCHEDULER API] Error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    }, { status: 500 })
  }
}





