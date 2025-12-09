/**
 * ChatGPT Discovery API - Phase 1
 * 
 * Endpoint to generate daily prompt inventory for ChatGPT processing
 * Used by automated systems and admin panel
 * 
 * GET /api/chatgpt/discovery - Generate and return daily inventory
 */

import { NextRequest, NextResponse } from 'next/server'
import { generateDailyPromptInventory, getEligibleUsers, hasPromptsToProcess } from '@/lib/services/chatgpt-discovery'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action') || 'full'
    
    console.log(`🔍 [CHATGPT DISCOVERY API] ${action} request received`)
    
    // Quick check endpoint
    if (action === 'check') {
      const hasPrompts = await hasPromptsToProcess()
      return NextResponse.json({
        success: true,
        hasPrompts,
        message: hasPrompts 
          ? 'Prompts available for processing' 
          : 'No prompts to process today'
      })
    }
    
    // Users only endpoint
    if (action === 'users') {
      const users = await getEligibleUsers()
      return NextResponse.json({
        success: true,
        totalUsers: users.length,
        users: users.map(u => ({
          userId: u.userId,
          email: u.email,
          plan: u.subscriptionPlan
        }))
      })
    }
    
    // Full inventory generation (default)
    const inventory = await generateDailyPromptInventory()
    
    return NextResponse.json({
      success: true,
      inventory
    })
    
  } catch (error) {
    console.error('❌ [CHATGPT DISCOVERY API] Error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    }, { status: 500 })
  }
}





