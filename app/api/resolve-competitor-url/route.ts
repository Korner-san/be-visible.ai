import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

// No cookie-based auth — the Vite frontend uses localStorage Supabase auth,
// not Next.js cookies. This route is read-only + external API call, so we
// validate via the brandId ownership check using the admin client instead.

export async function POST(request: NextRequest) {
  console.log('[resolve-competitor-url] Request received')

  try {
    const body = await request.json()
    const { brandId, entityName } = body

    console.log('[resolve-competitor-url] brandId:', brandId, '| entity:', entityName)

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
      const { data: reports } = await adminSupabase
        .from('daily_reports')
        .select('id')
        .eq('brand_id', brandId)
        .eq('status', 'completed')
        .order('report_date', { ascending: false })
        .limit(10)

      console.log('[resolve-competitor-url] Reports found:', reports?.length ?? 0)

      if (reports && reports.length > 0) {
        const reportIds = reports.map((r: any) => r.id)

        const { data: result, error: resultError } = await adminSupabase
          .from('prompt_results')
          .select('chatgpt_response, prompt_text')
          .in('daily_report_id', reportIds)
          .ilike('chatgpt_response', `%${entityName}%`)
          .limit(1)
          .single()

        if (resultError) {
          console.log('[resolve-competitor-url] No matching prompt_result:', resultError.message)
        }

        if (result) {
          promptText = result.prompt_text || ''
          const responseText: string = result.chatgpt_response || ''
          const idx = responseText.toLowerCase().indexOf(entityName.toLowerCase())
          contextSnippet = idx >= 0
            ? responseText.substring(Math.max(0, idx - 80), idx + 220).replace(/\s+/g, ' ').trim()
            : responseText.substring(0, 300).replace(/\s+/g, ' ').trim()
          console.log('[resolve-competitor-url] Context snippet length:', contextSnippet.length)
        }
      }
    } catch (ctxErr) {
      console.warn('[resolve-competitor-url] Context fetch error:', ctxErr)
    }

    // ── Call Perplexity ────────────────────────────────────────────────────
    const perplexityKey = process.env.PERPLEXITY_API_KEY
    if (!perplexityKey) {
      console.error('[resolve-competitor-url] PERPLEXITY_API_KEY not set')
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
      '- Domain only (e.g. sendgrid.com), no https://, no www., no trailing slash',
      '- Always return a best-effort answer, never null or empty',
    ].filter(Boolean).join('\n')

    console.log('[resolve-competitor-url] Calling Perplexity for:', entityName)

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

    console.log('[resolve-competitor-url] Perplexity status:', perplexityRes.status)

    if (!perplexityRes.ok) {
      const errText = await perplexityRes.text()
      console.error('[resolve-competitor-url] Perplexity error body:', errText)
      return NextResponse.json({ url: null })
    }

    const perplexityData = await perplexityRes.json()
    const rawText: string = perplexityData?.choices?.[0]?.message?.content || ''
    console.log('[resolve-competitor-url] Perplexity raw response:', rawText)

    let url: string | null = null
    try {
      const cleaned = rawText.replace(/```json|```/g, '').trim()
      const parsed = JSON.parse(cleaned)
      url = parsed?.url || null
      if (url) {
        url = url
          .replace(/^https?:\/\//i, '')
          .replace(/^www\./i, '')
          .split('/')[0]
          .trim()
          .toLowerCase()
      }
    } catch {
      // Perplexity may return plain text instead of JSON — try to extract a domain directly
      const domainMatch = rawText.match(/([a-zA-Z0-9-]+\.[a-zA-Z]{2,})/)
      if (domainMatch) url = domainMatch[1].toLowerCase()
      console.warn('[resolve-competitor-url] JSON parse failed, extracted:', url, '| raw:', rawText)
    }

    console.log(`[resolve-competitor-url] Final: "${entityName}" → "${url}"`)
    return NextResponse.json({ url })

  } catch (err) {
    console.error('[resolve-competitor-url] Unexpected error:', err)
    return NextResponse.json({ url: null })
  }
}
