import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

function getProviderCitations(result: any): string[] {
  const p = result.provider
  let arr: any[] = []
  if (p === 'chatgpt') arr = result.chatgpt_citations || []
  else if (p === 'claude') arr = result.claude_citations || []
  else if (p === 'google_ai_overview') arr = result.google_ai_overview_citations || []
  else arr = result.citations || []
  return arr.map((c: any) => (typeof c === 'string' ? c : c?.url)).filter(Boolean)
}

function getProviderResponse(result: any): string {
  const p = result.provider
  if (p === 'chatgpt') return result.chatgpt_response || ''
  if (p === 'claude') return result.claude_response || ''
  if (p === 'google_ai_overview') return result.google_ai_overview_response || ''
  return ''
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    const m = url.match(/https?:\/\/(?:www\.)?([^/]+)/)
    return m ? m[1] : 'unknown'
  }
}

function computeMetrics(results: any[], brandDomain: string | null) {
  if (!results.length) {
    return { visibilityScore: 0, mentionRate: 0, avgPosition: 0, citationShare: 0, citations: 0 }
  }
  const total = results.length
  const mentionedCount = results.filter(r => r.brand_mentioned).length
  const mentionRate = Math.round((mentionedCount / total) * 100)

  const positions = results
    .filter(r => r.brand_mentioned && r.brand_position != null)
    .map(r => r.brand_position as number)
  const avgPosition = positions.length
    ? parseFloat((positions.reduce((s, p) => s + p, 0) / positions.length).toFixed(1))
    : 0

  // Position score: rank 1 = 100pts, rank 10 = 0pts
  const positionScore = avgPosition > 0
    ? Math.max(0, Math.min(100, Math.round(100 - (avgPosition - 1) * 12)))
    : 0
  const visibilityScore = Math.round(mentionRate * 0.65 + positionScore * 0.35)

  let totalCits = 0
  let brandCits = 0
  results.forEach(r => {
    const urls = getProviderCitations(r)
    totalCits += urls.length
    if (brandDomain) {
      brandCits += urls.filter(u => {
        const d = extractDomain(u)
        return d === brandDomain || d.endsWith('.' + brandDomain) || brandDomain.endsWith('.' + d)
      }).length
    }
  })
  const citationShare = totalCits > 0 ? Math.round((brandCits / totalCits) * 100) : 0

  return { visibilityScore, mentionRate, avgPosition, citationShare, citations: totalCits }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const brandId = searchParams.get('brandId')
    const fromDate = searchParams.get('from')
    const toDate = searchParams.get('to')
    const daysParam = searchParams.get('days')
    const promptId = searchParams.get('promptId')
    const modelsParam = searchParams.get('models')

    if (!brandId) {
      return NextResponse.json({ success: false, error: 'brandId required' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { data: brand } = await supabase
      .from('brands')
      .select('id, name, domain, owner_user_id')
      .eq('id', brandId)
      .single()
    if (!brand || brand.owner_user_id !== user.id) {
      return NextResponse.json({ success: false, error: 'Brand not found' }, { status: 404 })
    }

    const brandDomain = brand.domain
      ? brand.domain.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]
      : null

    const selectedModels = modelsParam?.split(',').filter(Boolean).length
      ? modelsParam!.split(',').filter(Boolean)
      : ['chatgpt']

    // Resolve date range
    let from = fromDate
    let to = toDate
    if (!from && daysParam) {
      const days = parseInt(daysParam) || 30
      const d = new Date()
      d.setDate(d.getDate() - days)
      from = d.toISOString().split('T')[0]
    }
    if (!to) to = new Date().toISOString().split('T')[0]

    // Previous period for trend calculation
    const periodMs = from
      ? new Date(to!).getTime() - new Date(from).getTime() + 86400000
      : 30 * 86400000
    const prevToDate = new Date(new Date(from || to!).getTime() - 86400000).toISOString().split('T')[0]
    const prevFromDate = new Date(new Date(prevToDate).getTime() - periodMs + 86400000).toISOString().split('T')[0]

    // Fetch active brand prompts
    let bpQuery = supabase
      .from('brand_prompts')
      .select('id, raw_prompt, improved_prompt, category, status')
      .eq('brand_id', brandId)
    if (promptId) bpQuery = bpQuery.eq('id', promptId)
    const { data: brandPrompts } = await bpQuery

    if (!brandPrompts || brandPrompts.length === 0) {
      return NextResponse.json({ success: true, stats: {} })
    }

    const promptIds = brandPrompts.map(p => p.id)

    // Fetch current period results
    let rq = supabase
      .from('prompt_results')
      .select(`
        id,
        brand_prompt_id,
        prompt_text,
        provider,
        brand_mentioned,
        brand_position,
        chatgpt_response,
        chatgpt_citations,
        claude_response,
        claude_citations,
        google_ai_overview_response,
        google_ai_overview_citations,
        citations,
        created_at,
        daily_reports!inner(report_date, status)
      `)
      .in('brand_prompt_id', promptIds)
      .in('provider', selectedModels)
      .eq('daily_reports.status', 'completed')
      .order('created_at', { ascending: false })
    if (from) rq = rq.gte('daily_reports.report_date', from)
    if (to) rq = rq.lte('daily_reports.report_date', to)
    const { data: results } = await rq

    // Fetch previous period results for trend
    const { data: prevResults } = await supabase
      .from('prompt_results')
      .select(`
        id,
        brand_prompt_id,
        provider,
        brand_mentioned,
        brand_position,
        chatgpt_citations,
        claude_citations,
        google_ai_overview_citations,
        citations,
        daily_reports!inner(report_date, status)
      `)
      .in('brand_prompt_id', promptIds)
      .in('provider', selectedModels)
      .eq('daily_reports.status', 'completed')
      .gte('daily_reports.report_date', prevFromDate)
      .lte('daily_reports.report_date', prevToDate)

    // Group results by prompt_id
    const byPrompt = new Map<string, any[]>()
    const byPromptPrev = new Map<string, any[]>()
    for (const id of promptIds) {
      byPrompt.set(id, [])
      byPromptPrev.set(id, [])
    }
    ;(results || []).forEach(r => byPrompt.get(r.brand_prompt_id)?.push(r))
    ;(prevResults || []).forEach(r => byPromptPrev.get(r.brand_prompt_id)?.push(r))

    // Batch-compute content type breakdowns from url_citations → url_content_facts
    const byPromptBreakdown = new Map<string, any[]>()
    for (const id of promptIds) byPromptBreakdown.set(id, [])

    const allResultIds = (results || []).map((r: any) => r.id)
    if (allResultIds.length > 0) {
      const serviceClient = createServiceClient()
      const { data: urlCitations } = await serviceClient
        .from('url_citations')
        .select('url_id, prompt_result_id')
        .in('prompt_result_id', allResultIds)

      if (urlCitations && urlCitations.length > 0) {
        const allUrlIds = [...new Set(urlCitations.map((uc: any) => uc.url_id as string))]

        const { data: contentFacts } = await serviceClient
          .from('url_content_facts')
          .select('url_id, content_structure_category')
          .in('url_id', allUrlIds)
          .not('content_structure_category', 'is', null)

        const urlCategoryMap = new Map<string, string>()
        ;(contentFacts || []).forEach((f: any) => {
          if (f.content_structure_category) urlCategoryMap.set(f.url_id, f.content_structure_category)
        })

        // result_id → brand_prompt_id lookup
        const resultPromptMap = new Map<string, string>()
        ;(results || []).forEach((r: any) => resultPromptMap.set(r.id, r.brand_prompt_id))

        // Collect unique url_ids per brand_prompt_id
        const promptUrlIds = new Map<string, Set<string>>()
        for (const id of promptIds) promptUrlIds.set(id, new Set())
        urlCitations.forEach((uc: any) => {
          const pId = resultPromptMap.get(uc.prompt_result_id)
          if (pId) promptUrlIds.get(pId)?.add(uc.url_id)
        })

        // Aggregate content categories per prompt
        for (const [pId, urlIds] of promptUrlIds) {
          const typeCounts: Record<string, number> = {}
          for (const urlId of urlIds) {
            const cat = urlCategoryMap.get(urlId)
            if (cat) typeCounts[cat] = (typeCounts[cat] || 0) + 1
          }
          const total = Object.values(typeCounts).reduce((s, v) => s + v, 0)
          if (total > 0) {
            byPromptBreakdown.set(pId, Object.entries(typeCounts)
              .sort(([, a], [, b]) => b - a)
              .map(([category, count]) => ({
                category,
                urls: count,
                percentage: Math.round((count / total) * 100),
              })))
          }
        }
      }
    }

    const stats: Record<string, any> = {}

    for (const prompt of brandPrompts) {
      const pResults = byPrompt.get(prompt.id) || []
      const pPrev = byPromptPrev.get(prompt.id) || []

      const curr = computeMetrics(pResults, brandDomain)
      const prev = computeMetrics(pPrev, brandDomain)
      const visibilityTrend = curr.visibilityScore - prev.visibilityScore

      // Daily history for chart
      const dayMap = new Map<string, any[]>()
      pResults.forEach(r => {
        const date: string = (r.daily_reports as any).report_date
        if (!dayMap.has(date)) dayMap.set(date, [])
        dayMap.get(date)!.push(r)
      })
      const history = Array.from(dayMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, dayResults]) => {
          const s = computeMetrics(dayResults, brandDomain)
          return {
            date,
            visibility: s.visibilityScore,
            avgPosition: s.avgPosition,
            citationShare: s.citationShare,
            mentionRate: s.mentionRate,
          }
        })

      // Last 5 results for Sample history tab
      const recentResults = pResults.slice(0, 5).map(r => ({
        id: r.id,
        date: (r.daily_reports as any).report_date,
        provider: r.provider,
        mentioned: r.brand_mentioned,
        position: r.brand_position,
        promptText: r.prompt_text,
        response: getProviderResponse(r),
        citations: getProviderCitations(r),
      }))

      // Citation domains for Citation sources tab
      const domainMap = new Map<string, { urls: Set<string>; mentions: number }>()
      let totalDomainCits = 0
      pResults.forEach(r => {
        getProviderCitations(r).forEach(url => {
          totalDomainCits++
          const domain = extractDomain(url)
          if (!domainMap.has(domain)) domainMap.set(domain, { urls: new Set(), mentions: 0 })
          domainMap.get(domain)!.urls.add(url)
          domainMap.get(domain)!.mentions++
        })
      })
      const citationDomains = Array.from(domainMap.entries())
        .sort(([, a], [, b]) => b.mentions - a.mentions)
        .map(([domain, data]) => ({
          domain,
          uniqueUrls: data.urls.size,
          mentions: data.mentions,
          pctTotal: totalDomainCits > 0 ? Math.round((data.mentions / totalDomainCits) * 100) : 0,
          coverage: pResults.length > 0 ? Math.round((data.mentions / pResults.length) * 100) : 0,
          urls: Array.from(data.urls),
        }))

      const lastRun = pResults.length > 0
        ? (pResults[0].daily_reports as any).report_date
        : null

      stats[prompt.id] = {
        ...curr,
        visibilityTrend,
        lastRun,
        history,
        recentResults,
        citationDomains,
        contentTypeBreakdown: byPromptBreakdown.get(prompt.id) || [],
      }
    }

    return NextResponse.json({ success: true, stats })
  } catch (err: any) {
    console.error('[prompts/stats] Error:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
