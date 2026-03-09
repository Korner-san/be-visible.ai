import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClaudeMemoryTool } from '@supermemory/tools/claude-memory'

export async function POST(request: NextRequest) {
  try {
    const { message, userId } = await request.json()

    if (!message) {
      return NextResponse.json({ error: 'Missing message' }, { status: 400 })
    }

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    })

    const memoryTool = createClaudeMemoryTool(
      process.env.SUPERMEMORY_API_KEY!,
      { containerTags: [userId || 'user-123'] },
    )

    const response = await anthropic.beta.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 2048,
      messages: [{ role: 'user', content: message }],
      tools: [{ type: 'memory_20250818', name: 'memory' }],
      betas: ['context-management-2025-06-27'],
    })

    return NextResponse.json({ success: true, response })
  } catch (error) {
    console.error('[test-supermemory] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
