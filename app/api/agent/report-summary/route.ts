/**
 * GET /api/agent/report-summary?brandId=<uuid>&days=7
 * Authorization: Bearer sk_bv_<key>
 *
 * External agent-facing read endpoint. Returns a compact brand visibility
 * summary suitable for AI agent consumption (Claude, etc.).
 * Read-only. No raw AI responses. No individual citation URLs.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { validateApiKey } from '@/lib/api-key-auth'

const MAX_DAYS = 90
const DEFAULT_DAYS = 7

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    const m = url.match(/https?:\/\/(?:www\.)?([^/]+)/)
    return m ? m[1] : 'unknown'
  }
}

function getProviderCitations(result: any): string[] {
  const p = result.provider
  let arr: any[] = []
  if (p === 'chatgpt') arr = result.chatgpt_citations || []
  else if (p === 'claude') arr = result.claude_citations || []
  else if (p === 'google_ai_overview') arr = result.google_ai_overview_citations || []
  else arr = result.citations || []
  const urls = arr.map((c: any) => (typeof c === 'string' ? c : c?.url)).filter(Boolean)

  // ChatGPT inline citation fallback
  if (urls.length === 0 && p === 'chatgpt' && result.chatgpt_response) {
    const found: string[] = (result.chatgpt_response.match(/https?:\/\/[^\s)"'<>]+/g) || [])
      .map((u: string) => u.replace(/[.,;:!?]+$/, ''))
    return [...new Set(found)]
  }
  return urls
}

function deriveActionItems(params: {
  byModel: Record<string, { mentionRate: number; results: number }>
  weakPrompts: Array<{ text: string; mentionRate: number; demandScore: number | null }>
  competitors: Array<{ name: string; responses: number }>
  brandMentions: number
  totalResults: number
}): string[] {
  const items: string[] = []
  const { byModel, weakPrompts, competitors, brandMentions, totalResults } = params

  // Model-specific gaps
  const modelNames: Record<string, string> = {
    claude: 'Claude',
    chatgpt: 'ChatGPT',
    google_ai_overview: 'Google AI Overview',
  }
  for (const [model, stats] of Object.entries(byModel)) {
    if (stats.results > 5 && stats.mentionRate === 0) {
      items.push(
        `${modelNames[model] ?? model} shows 0% mention rate across ${stats.results} results — brand is invisible on this model; review what content ${modelNames[model] ?? model} cites.`
      )
    } else if (stats.results > 5 && stats.mentionRate < 10) {
      items.push(
        `${modelNames[model] ?? model} mention rate is only ${stats.mentionRate}% — significantly below overall average.`
      )
    }
  }

  // High-demand weak prompts
  const highDemandWeak = weakPrompts.filter(p => (p.demandScore ?? 0) >= 3)
  if (highDemandWeak.length > 0) {
    items.push(
      `${highDemandWeak.length} prompt${highDemandWeak.length > 1 ? 's' : ''} with demand score ≥3 have 0% mention rate — highest-priority content gaps: "${highDemandWeak[0].text.slice(0, 60)}…"`
    )
  }

  // Top competitor threat
  const absentResponses = totalResults - brandMentions
  if (competitors.length > 0 && absentResponses > 0) {
    const topTwo = competitors.slice(0, 2)
    const topTwoTotal = topTwo.reduce((s, c) => s + c.responses, 0)
    const pct = totalResults > 0 ? Math.round((topTwoTotal / totalResults) * 100) : 0
    items.push(
      `${topTwo.map(c => c.name).join(' and ')} appear in ${pct}% of all responses — primary share-of-voice threats.`
    )
  }

  // Overall mention rate signal
  const overallRate = totalResults > 0 ? Math.round((brandMentions / totalResults) * 100) : 0
  if (overallRate < 20) {
    items.push(
      `Overall mention rate is ${overallRate}% — brand is mentioned in fewer than 1 in 5 AI responses. Focus on prompt categories with existing traction.`
    )
  } else if (overallRate >= 50) {
    items.push(
      `Overall mention rate is ${overallRate}% — strong baseline. Focus on converting citation appearances into brand-first mentions.`
    )
  }

  return items.slice(0, 5)
}

export async function GET(request: NextRequest) {
  // ── Auth ───────────────────────────────────────────────────────────────────
  const identity = await validateApiKey(request)
  if (!identity) {
    return NextResponse.json(
      { ok: false, error: 'invalid_api_key', hint: 'Provide a valid Bearer token in the Authorization header.' },
      { status: 401 }
    )
  }

  // ── Params ─────────────────────────────────────────────────────────────────
  const { searchParams } = new URL(request.url)
  const brandId = searchParams.get('brandId')
  if (!brandId) {
    return NextResponse.json({ ok: false, error: 'brandId_required' }, { status: 400 })
  }

  const daysRaw = parseInt(searchParams.get('days') || String(DEFAULT_DAYS))
  const days = Math.min(Math.max(daysRaw, 1), MAX_DAYS)

  const modelsRaw = searchParams.get('models')
  const selectedModels = modelsRaw
    ? modelsRaw.split(',').map(m => m.trim()).filter(Boolean)
    : ['chatgpt', 'claude', 'google_ai_overview']

  // ── Brand ownership check ──────────────────────────────────────────────────
  const svc = createServiceClient()
  const { data: brand, error: brandError } = await svc
    .from('brands')
    .select('id, name, domain, owner_user_id')
    .eq('id', brandId)
    .single()

  if (brandError || !brand) {
    return NextResponse.json({ ok: false, error: 'brand_not_found' }, { status: 404 })
  }
  if (brand.owner_user_id !== identity.userId) {
    return NextResponse.json({ ok: false, error: 'brand_not_found' }, { status: 404 })
  }

  // ── Date range ─────────────────────────────────────────────────────────────
  const toDate = new Date().toISOString().split('T')[0]
  const fromDate = new Date(Date.now() - days * 86400000).toISOString().split('T')[0]

  // ── Active prompt count ────────────────────────────────────────────────────
  const { count: activePrompts } = await svc
    .from('brand_prompts')
    .select('id', { count: 'exact', head: true })
    .eq('brand_id', brandId)
    .eq('is_active', true)
    .is('deleted_at', null)

  // ── Latest report ──────────────────────────────────────────────────────────
  const { data: latestReports } = await svc
    .from('daily_reports')
    .select('report_date, status')
    .eq('brand_id', brandId)
    .eq('status', 'completed')
    .order('report_date', { ascending: false })
    .limit(1)

  const latestReport = latestReports?.[0] ?? null

  // ── Per-prompt data: prompts + results in one pass ─────────────────────────
  const { data: brandPrompts } = await svc
    .from('brand_prompts')
    .select('id, improved_prompt, raw_prompt, category, demand_score')
    .eq('brand_id', brandId)
    .eq('is_active', true)
    .is('deleted_at', null)

  if (!brandPrompts || brandPrompts.length === 0) {
    return NextResponse.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      brand: { id: brand.id, name: brand.name, domain: brand.domain, activePrompts: 0 },
      period: { from: fromDate, to: toDate, days },
      latestReport,
      visibility: { mentionRate: 0, totalResults: 0, totalMentions: 0, byModel: {} },
      topPrompts: [],
      weakPrompts: [],
      competitors: [],
      citationDomains: [],
      actionItems: [],
    })
  }

  const promptIds = brandPrompts.map(p => p.id)

  // Fetch prompt_results for the period — select only what we need
  const { data: results } = await svc
    .from('prompt_results')
    .select(`
      id,
      brand_prompt_id,
      provider,
      brand_mentioned,
      competitor_mention_details,
      chatgpt_citations,
      claude_citations,
      google_ai_overview_citations,
      citations,
      daily_reports!inner(report_date, status)
    `)
    .in('brand_prompt_id', promptIds)
    .in('provider', selectedModels)
    .eq('daily_reports.status', 'completed')
    .gte('daily_reports.report_date', fromDate)
    .lte('daily_reports.report_date', toDate)

  const allResults = results || []

  // ── Overall visibility ─────────────────────────────────────────────────────
  const totalResults = allResults.length
  const totalMentions = allResults.filter(r => r.brand_mentioned).length
  const overallMentionRate = totalResults > 0 ? Math.round((totalMentions / totalResults) * 100) : 0

  // ── By-model breakdown ─────────────────────────────────────────────────────
  const byModel: Record<string, { results: number; mentions: number; mentionRate: number }> = {}
  for (const model of selectedModels) {
    const modelResults = allResults.filter(r => r.provider === model)
    const modelMentions = modelResults.filter(r => r.brand_mentioned).length
    byModel[model] = {
      results: modelResults.length,
      mentions: modelMentions,
      mentionRate: modelResults.length > 0 ? Math.round((modelMentions / modelResults.length) * 100) : 0,
    }
  }

  // ── Per-prompt mention rates ───────────────────────────────────────────────
  const promptMap = new Map<string, { text: string; category: string; demandScore: number | null }>()
  for (const p of brandPrompts) {
    promptMap.set(p.id, {
      text: p.improved_prompt || p.raw_prompt || '',
      category: p.category || 'General',
      demandScore: p.demand_score ?? null,
    })
  }

  const promptStats = new Map<string, { total: number; mentions: number }>()
  for (const r of allResults) {
    const s = promptStats.get(r.brand_prompt_id) ?? { total: 0, mentions: 0 }
    s.total++
    if (r.brand_mentioned) s.mentions++
    promptStats.set(r.brand_prompt_id, s)
  }

  const rankedPrompts = brandPrompts
    .filter(p => promptStats.has(p.id))
    .map(p => {
      const s = promptStats.get(p.id)!
      return {
        text: (p.improved_prompt || p.raw_prompt || '').replace(/^"|"$/g, ''),
        category: p.category || 'General',
        demandScore: p.demand_score ?? null,
        mentionRate: s.total > 0 ? Math.round((s.mentions / s.total) * 100) : 0,
        totalResults: s.total,
      }
    })

  const sorted = [...rankedPrompts].sort((a, b) => b.mentionRate - a.mentionRate)
  const topPrompts = sorted.slice(0, 5)
  // Weak: 0% mention rate only, sorted by demand score desc (highest demand, most visible gap)
  const weakPrompts = rankedPrompts
    .filter(p => p.mentionRate === 0 && p.totalResults >= 3)
    .sort((a, b) => (b.demandScore ?? 0) - (a.demandScore ?? 0))
    .slice(0, 5)

  // ── Competitor SOV ─────────────────────────────────────────────────────────
  const competitorCounts = new Map<string, number>()
  for (const r of allResults) {
    const details = Array.isArray(r.competitor_mention_details) ? r.competitor_mention_details : []
    for (const comp of details) {
      if (comp?.name) {
        competitorCounts.set(comp.name, (competitorCounts.get(comp.name) ?? 0) + 1)
      }
    }
  }

  // SOV denom = brand responses + all competitor responses
  const brandResponses = totalMentions
  const totalEntityResponses = brandResponses + Array.from(competitorCounts.values()).reduce((s, v) => s + v, 0)

  const competitors = Array.from(competitorCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, responses]) => ({
      name,
      responses,
      sovPct: totalEntityResponses > 0 ? Math.round((responses / totalEntityResponses) * 100) : 0,
    }))

  // ── Citation domains ───────────────────────────────────────────────────────
  const domainMap = new Map<string, number>()
  let totalCitations = 0
  for (const r of allResults) {
    for (const url of getProviderCitations(r)) {
      const domain = extractDomain(url)
      if (domain && domain !== 'unknown') {
        domainMap.set(domain, (domainMap.get(domain) ?? 0) + 1)
        totalCitations++
      }
    }
  }

  const citationDomains = Array.from(domainMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([domain, mentions]) => ({
      domain,
      mentions,
      pctTotal: totalCitations > 0 ? Math.round((mentions / totalCitations) * 100) : 0,
    }))

  // ── Action items ───────────────────────────────────────────────────────────
  const actionItems = deriveActionItems({
    byModel,
    weakPrompts,
    competitors,
    brandMentions: totalMentions,
    totalResults,
  })

  // ── Response ───────────────────────────────────────────────────────────────
  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    brand: {
      id: brand.id,
      name: brand.name,
      domain: brand.domain,
      activePrompts: activePrompts ?? 0,
    },
    period: { from: fromDate, to: toDate, days },
    latestReport: latestReport
      ? { date: latestReport.report_date, status: latestReport.status }
      : null,
    visibility: {
      mentionRate: overallMentionRate,
      totalResults,
      totalMentions,
      byModel,
    },
    topPrompts,
    weakPrompts,
    competitors,
    citationDomains,
    actionItems,
  })
}
