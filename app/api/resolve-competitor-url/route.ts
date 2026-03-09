import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ url: null }, { status: 401 })
    }

    const { brandId, entityName } = await request.json()
    if (!brandId || !entityName) {
      return NextResponse.json({ url: null }, { status: 400 })
    }

    const adminSupabase = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // ── Fetch a context snippet from a response that mentions this entity ──
    let contextSnippet = ''
    let promptText = ''

    try {
      // Get recent completed report IDs for this brand
      const { data: reports } = await adminSupabase
        .from('daily_reports')
        .select('id')
        .eq('brand_id', brandId)
        .eq('status', 'completed')
        .order('report_date', { ascending: false })
        .limit(10)

      if (reports && reports.length > 0) {
        const reportIds = reports.map((r: any) => r.id)

        // Find a prompt_result whose response contains the entity name
        const { data: result } = await adminSupabase
          .from('prompt_results')
          .select('chatgpt_response, prompt_text')
          .in('daily_report_id', reportIds)
          .ilike('chatgpt_response', `%${entityName}%`)
          .limit(1)
          .single()

        if (result) {
          promptText = result.prompt_text || ''

          // Extract a ~300-char snippet centred around the entity mention
          const responseText: string = result.chatgpt_response || ''
          const idx = responseText.toLowerCase().indexOf(entityName.toLowerCase())
          if (idx >= 0) {
            contextSnippet = responseText
              .substring(Math.max(0, idx - 80), idx + 220)
              .replace(/\s+/g, ' ')
              .trim()
          } else {
            contextSnippet = responseText.substring(0, 300).replace(/\s+/g, ' ').trim()
          }
        }
      }
    } catch {
      // Context fetch failed — still attempt URL resolution without it
    }

    // ── Call Perplexity ────────────────────────────────────────────────────
    const perplexityKey = process.env.PERPLEXITY_API_KEY
    if (!perplexityKey) {
      console.warn('[resolve-competitor-url] PERPLEXITY_API_KEY not set')
      return NextResponse.json({ url: null })
    }

    const userMessage = [
      `Entity name: "${entityName}"`,
      contextSnippet ? `Context from AI response: "${contextSnippet}"` : '',
      promptText ? `Original prompt: "${promptText}"` : '',
      '',
      'Return the single most likely official website domain for this entity.',
      'Respond with JSON only: {"url": "example.com"}',
      'Rules:',
      '- Domain only, no https://, no trailing slash',
      '- Always return a best-effort answer, never null',
    ].filter(Boolean).join('\n')

    const perplexityRes = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${perplexityKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [
          {
            role: 'system',
            content: 'You are a research assistant. Return only valid JSON with no markdown, no explanation.',
          },
          {
            role: 'user',
            content: userMessage,
          },
        ],
        max_tokens: 60,
        temperature: 0.1,
      }),
    })

    if (!perplexityRes.ok) {
      console.error('[resolve-competitor-url] Perplexity error:', perplexityRes.status)
      return NextResponse.json({ url: null })
    }

    const perplexityData = await perplexityRes.json()
    const rawText: string = perplexityData?.choices?.[0]?.message?.content || ''

    // Parse the JSON response — strip markdown fences if present
    let url: string | null = null
    try {
      const cleaned = rawText.replace(/```json|```/g, '').trim()
      const parsed = JSON.parse(cleaned)
      url = parsed?.url || null

      // Sanity-clean: strip protocol/path if model added them
      if (url) {
        url = url
          .replace(/^https?:\/\//i, '')
          .replace(/^www\./i, '')
          .split('/')[0]
          .trim()
          .toLowerCase()
      }
    } catch {
      console.warn('[resolve-competitor-url] Could not parse Perplexity response:', rawText)
    }

    console.log(`[resolve-competitor-url] "${entityName}" → "${url}"`)
    return NextResponse.json({ url })

  } catch (err) {
    console.error('[resolve-competitor-url] Unexpected error:', err)
    return NextResponse.json({ url: null })
  }
}
