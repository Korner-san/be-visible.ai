/**
 * POST /api/onboarding/analyze-website
 *
 * Phase A: GPT-4o-mini extracts brand info including businessType classification
 * Phase B: Business-type-aware competitor discovery pipeline
 *   Step 1 — GPT-4o-mini generates type-specific search queries (6–10 depending on type)
 *   Step 2 — Tavily runs queries in parallel, extracts candidate domains
 *   Step 2b — Detect SaaS vs agency from candidate homepage CTAs
 *   Step 2c — DataForSEO traffic estimation
 *   Step 2d — Tavily pricing page extraction
 *   Step 3 — GPT-4o-mini scores each candidate (incl. businessModelFit + pricingModelFit)
 *   Step 4 — Weighted ranking, return top 6
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import OpenAI from 'openai'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const normalizeUrl = (url: string): string => {
  if (!url) return ''
  url = url.trim().replace(/^@+/, '').replace(/\/+$/, '')
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url
  }
  return url
}

const extractDomain = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

const fetchWebsiteContent = async (url: string): Promise<string> => {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BeVisibleBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: controller.signal,
    })
    clearTimeout(timeout)
    const html = await response.text()
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 8000)
  } catch (err: any) {
    console.error('[analyze-website] Fetch error:', err.message)
    return ''
  }
}

// ─── Phase B: Step 1 — Generate search queries (type-aware) ───────────────────

const generateSearchQueries = async (openai: OpenAI, params: {
  businessSummary: string; businessLabel: string; businessType: string
  coreFunction: string; industryKeywords: string[]; marketScope: string
  marketCountry: string | null; language: string; keyFeatures: string[]
  useCases: string[]; tasksHelped: string[]; uniqueSellingProps: string[]; problemSolved: string
}): Promise<string[]> => {
  const {
    businessSummary, businessLabel, businessType, coreFunction, industryKeywords,
    marketScope, marketCountry, language, keyFeatures, useCases, tasksHelped,
    uniqueSellingProps, problemSolved,
  } = params
  const isLocal = marketScope === 'local' && marketCountry

  let languageRule: string
  if (language !== 'English' && isLocal) {
    languageRule = `Generate ALL queries in ${language}. Do not use English.`
  } else if (language !== 'English' && !isLocal) {
    languageRule = `Generate all queries in English (global search landscape is English-dominant). You may add 1 query in ${language} if highly relevant.`
  } else {
    languageRule = `Generate all queries in English.`
  }

  const featuresLine = keyFeatures?.filter(Boolean).length ? `Key features: ${keyFeatures.filter(Boolean).join(', ')}` : ''
  const useCasesLine = useCases?.filter(Boolean).length ? `Use cases: ${useCases.filter(Boolean).join(', ')}` : ''
  const tasksLine = tasksHelped?.filter(Boolean).length ? `Tasks helped: ${tasksHelped.filter(Boolean).join(', ')}` : ''
  const uspLine = uniqueSellingProps?.filter(Boolean).length ? `Unique selling props: ${uniqueSellingProps.filter(Boolean).join(', ')}` : ''
  const problemLine = problemSolved ? `Problem solved: ${problemSolved}` : ''
  const keywordList = (industryKeywords || []).filter(Boolean)
  const keywordsLine = keywordList.length ? `Industry keywords: ${keywordList.join(', ')}` : ''
  const coreFunctionLine = coreFunction ? `Core function: ${coreFunction}` : ''

  let strategyPrompt: string
  if (businessType === 'saas_platform') {
    strategyPrompt = `This is a SaaS/platform/tool business. Generate EXACTLY 10 queries covering these mandatory angles (one query per angle):
1. Industry keyword #1: a query built around "${keywordList[0] || keyFeatures?.[0] || businessLabel}" as the core search term
2. Industry keyword #2: a query built around "${keywordList[1] || keyFeatures?.[1] || businessLabel}" as the core search term
3. Industry keyword #3: a query built around "${keywordList[2] || keyFeatures?.[2] || businessLabel}" as the core search term
4. Core function: a query derived directly from the exact mechanism: "${coreFunction || businessSummary}"
5. Use-case: a query around "${useCases?.[0] || businessLabel}"
6. Use-case: a query around "${useCases?.[1] || businessLabel}"
7. Problem-solving: a query around "${problemSolved || businessLabel} tool"
8. Best-in-class: "best [industry keyword or product category] tools/platforms/software" style query using the most specific keyword
9. Task-based: a query around how to accomplish "${tasksHelped?.[0] || 'the main task'}" with a tool
10. Audience + goal: a query for the target audience trying to achieve the main goal

Do NOT include geography in any query — this is a global product.
Do NOT use "[businessLabel] alternatives" or "[businessLabel] competitors" — focus on what the product does mechanically.`
  } else if (businessType === 'agency_service') {
    strategyPrompt = `This is an agency or service business. Generate EXACTLY 8 queries covering these angles:
1. businessLabel direct: a clean query built around "${businessLabel}"
2. businessLabel + geography: "${businessLabel} in ${marketCountry || 'relevant market'}"${isLocal ? ' (include geography)' : ' (skip geography if global)'}
3. Specific service #1: a query around the first key service or feature
4. Specific service #2: a query around another key service or feature
5. Service + target audience: "${businessLabel} for [target industry/audience]"
6. Problem-solving: "who provides [the main problem this business solves]"
7. USP-based: a query combining a unique selling point with the business type
8. Task-based: a query around a specific task this business helps clients with

${isLocal ? `Include geography (${marketCountry}) in queries 2 and 5.` : 'Do not include geography — this is a global business.'}`
  } else if (businessType === 'local_service') {
    strategyPrompt = `This is a local service business. Generate EXACTLY 6 queries:
- Include "${marketCountry}" geography in most queries
- Focus on what specific service they provide and who they serve
- Vary angles: service type, target audience, problem solved, specific niche`
  } else {
    strategyPrompt = `Generate EXACTLY 6 queries focusing on product/service category, target audience, and use cases.
${isLocal ? `Include "${marketCountry}" geography in 2–3 queries.` : 'Do not include geography.'}`
  }

  const userPrompt = `Business type: ${businessLabel} (${businessType})
Description: ${businessSummary}
${coreFunctionLine}
${keywordsLine}
${featuresLine}
${useCasesLine}
${tasksLine}
${uspLine}
${problemLine}
Market: ${isLocal ? `${marketCountry} (local)` : 'Global'}

${strategyPrompt}

${languageRule}
Do NOT generate broad generic industry queries — keep every query niche-specific.

Return ONLY valid JSON:
{"queries": ["query 1", "query 2", ...]}`

  try {
    const maxTokens = businessType === 'saas_platform' ? 600 : 500
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a competitive intelligence expert. Generate Google search queries to find direct competitors of a specific business. Return only valid JSON.' },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.4,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
    })
    const raw = completion.choices[0]?.message?.content?.trim()
    if (!raw) return []
    const parsed = JSON.parse(raw)
    const queries: string[] = Array.isArray(parsed.queries)
      ? parsed.queries.filter((q: any) => typeof q === 'string' && q.trim())
      : []
    console.log(`[analyze-website] Step 1 (${businessType}) — generated ${queries.length} queries:`, queries)
    return queries
  } catch (err: any) {
    console.error('[analyze-website] Query generation failed:', err.message)
    return []
  }
}

// ─── Phase B: Step 2 — Search candidates via Tavily ───────────────────────────

interface Candidate {
  domain: string
  title: string
  snippet: string
  detectedModel?: string
}

const searchCandidates = async (queries: string[], originalDomain: string, businessType: string): Promise<Candidate[]> => {
  const tavilyKey = process.env.TAVILY_API_KEY
  if (!tavilyKey) {
    console.error('[analyze-website] TAVILY_API_KEY not set')
    return []
  }

  const results = await Promise.all(
    queries.map(async (query) => {
      try {
        const res = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ api_key: tavilyKey, query, search_depth: 'basic', max_results: 5, include_answer: false }),
        })
        if (!res.ok) return []
        const data = await res.json()
        return data.results || []
      } catch {
        return []
      }
    })
  )

  const domainScore: Record<string, number> = {}
  const domainMeta: Record<string, Candidate> = {}

  for (const queryResults of results) {
    for (const item of queryResults) {
      const domain = extractDomain(item.url)
      if (!domain || domain === originalDomain) continue
      domainScore[domain] = (domainScore[domain] || 0) + 1
      if (!domainMeta[domain]) {
        domainMeta[domain] = { domain, title: item.title || domain, snippet: (item.content || item.snippet || '').slice(0, 300) }
      }
    }
  }

  const poolSize = businessType === 'saas_platform' ? 20 : 15
  const candidates = Object.entries(domainScore)
    .sort((a, b) => b[1] - a[1])
    .slice(0, poolSize)
    .map(([domain]) => domainMeta[domain])

  console.log(`[analyze-website] Step 2 — ${candidates.length} unique candidates found`)
  return candidates
}

// ─── Phase B: Step 2b — Detect business model from candidate homepage ─────────

const SAAS_SIGNALS = [
  'log in', 'login', 'sign up', 'signup', 'sign-up',
  'try for free', 'start free', 'free trial', 'start trial',
  'get started free', 'start for free', 'try free', 'start your free',
  'get a demo', 'book a demo', 'request a demo', 'watch a demo',
  'dashboard', '/pricing', 'pricing plans', 'see pricing',
]

const AGENCY_SIGNALS = [
  'contact us', 'get in touch', 'request a quote', 'get a quote',
  'schedule a call', 'book a consultation', 'book a call',
  'talk to us', 'speak to us', 'get a proposal', 'request proposal',
  'our work', 'our clients', 'case studies', 'our portfolio',
  'meet the team', 'our team', 'about our agency',
]

const detectBusinessModel = async (domain: string): Promise<string> => {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 4000)
    const response = await fetch(`https://${domain}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BeVisibleBot/1.0)' },
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (!response.ok) return 'unknown'
    const html = await response.text()
    const text = html.toLowerCase().slice(0, 60000)
    const saasScore = SAAS_SIGNALS.filter(s => text.includes(s)).length
    const agencyScore = AGENCY_SIGNALS.filter(s => text.includes(s)).length
    if (saasScore >= 2 && saasScore >= agencyScore) return 'saas'
    if (agencyScore >= 2 && agencyScore > saasScore) return 'agency'
    if (saasScore >= 1) return 'saas'
    return 'unknown'
  } catch {
    return 'unknown'
  }
}

// ─── Phase B: Step 2c — Fetch traffic estimates via DataForSEO ────────────────

const fetchTrafficEstimates = async (domains: string[]): Promise<Record<string, number>> => {
  const apiKey = process.env.DATAFORSEO_API_KEY
  if (!apiKey || !domains.length) return {}
  try {
    const response = await fetch(
      'https://api.dataforseo.com/v3/dataforseo_labs/google/bulk_traffic_estimation/live',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${apiKey}` },
        body: JSON.stringify([{ targets: domains, location_code: 2840, language_code: 'en', item_types: ['organic'] }]),
      }
    )
    if (!response.ok) { console.error('[analyze-website] DataForSEO error:', response.status); return {} }
    const data = await response.json()
    const items = data?.tasks?.[0]?.result?.[0]?.items || []
    const trafficMap: Record<string, number> = {}
    for (const item of items) trafficMap[item.target] = item.metrics?.organic?.etv || 0
    console.log(`[analyze-website] Step 2c — traffic fetched for ${Object.keys(trafficMap).length} domains`)
    return trafficMap
  } catch (err: any) {
    console.error('[analyze-website] DataForSEO call failed:', err.message)
    return {}
  }
}

// etv 0→0, 1k→~4.3, 10k→~5.7, 100k→~7.1, 1M→~8.6, 10M+→10
const trafficToScore = (etv: number): number => {
  if (!etv || etv <= 0) return 0
  return Math.min(10, (Math.log10(etv + 1) / 7) * 10)
}

// ─── Phase B: Step 2d — Fetch pricing pages via Tavily extract ────────────────

const fetchPricingPages = async (candidates: Candidate[]): Promise<Record<string, string>> => {
  const tavilyKey = process.env.TAVILY_API_KEY
  if (!tavilyKey || !candidates.length) return {}
  const urls = candidates.map(c => `https://${c.domain}/pricing`)
  try {
    const res = await fetch('https://api.tavily.com/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: tavilyKey, urls }),
    })
    if (!res.ok) { console.error('[analyze-website] Tavily extract error:', res.status); return {} }
    const data = await res.json()
    const pricingMap: Record<string, string> = {}
    for (const result of (data.results || [])) {
      const domain = extractDomain(result.url)
      if (domain && result.raw_content) {
        pricingMap[domain] = result.raw_content.replace(/\s+/g, ' ').trim().slice(0, 1000)
      }
    }
    console.log(`[analyze-website] Step 2d — pricing pages fetched for ${Object.keys(pricingMap).length}/${candidates.length} domains`)
    return pricingMap
  } catch (err: any) {
    console.error('[analyze-website] Pricing page fetch failed:', err.message)
    return {}
  }
}

// ─── Phase B: Step 3 — Score candidates with GPT ──────────────────────────────

const scoreCandidates = async (openai: OpenAI, candidates: Candidate[], params: {
  businessSummary: string; businessLabel: string; businessType: string
  marketScope: string; keyFeatures: string[]; coreFunction: string
  trafficMap: Record<string, number>; pricingMap: Record<string, string>
}): Promise<{ name: string; domain: string }[]> => {
  const { businessSummary, businessLabel, businessType, marketScope, keyFeatures, coreFunction, trafficMap, pricingMap } = params
  if (!candidates.length) return []

  const topFeatures = (keyFeatures || []).filter(Boolean).slice(0, 4).join(', ')
  const systemPrompt = `You are a competitive intelligence analyst. Score how similar a candidate business is to a reference business. Return only valid JSON, no explanation outside the JSON.`

  const scores = await Promise.all(
    candidates.map(async (candidate) => {
      const pricingContent = pricingMap?.[candidate.domain] || ''
      const userPrompt = `Reference business:
Type: ${businessLabel} (${businessType})
Description: ${businessSummary}
${coreFunction ? `Core function: ${coreFunction}` : ''}
${topFeatures ? `Key features: ${topFeatures}` : ''}

Candidate:
Domain: ${candidate.domain}
Title: ${candidate.title}
Description: ${candidate.snippet}
Business model signal: ${
  candidate.detectedModel === 'saas'
    ? 'Website shows SaaS indicators (login, signup, pricing, free trial buttons)'
    : candidate.detectedModel === 'agency'
    ? 'Website shows agency/service indicators (contact forms, consultation booking, case studies, portfolio)'
    : 'No clear business model signals detected'
}
Pricing page content: ${pricingContent || 'Not available — could not fetch pricing page'}

Score the candidate as a direct competitor (0–10 each):
- nicheSimilarity: same specific niche? Use pricing page features/plan names as strong evidence
- serviceSimilarity: same or very similar services/features? Pricing page is the best signal
- audienceSimilarity: same target audience/customer segment?
- geographyFit: same geography?
- businessModelFit: same type of business? (SaaS vs agency vs local — score 0 if completely different)
- pricingModelFit: same pricing structure AND similar customer segment? Score 10 if identical model+tier, 0 if pricing reveals a completely different product, 5 if unavailable
- overallFit: how strong a direct competitor overall? Pricing page evidence should heavily influence this score.

Return ONLY valid JSON:
{"nicheSimilarity":0,"serviceSimilarity":0,"audienceSimilarity":0,"geographyFit":0,"businessModelFit":0,"pricingModelFit":0,"overallFit":0,"name":"inferred company name","reasoning":"one sentence"}`

      try {
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.2,
          max_tokens: 260,
          response_format: { type: 'json_object' },
        })
        const raw = completion.choices[0]?.message?.content?.trim()
        if (!raw) return null
        const s = JSON.parse(raw)
        return { ...candidate, ...s }
      } catch {
        return null
      }
    })
  )

  const geographyWeight = marketScope === 'local' ? 1.5 : 0.3
  const trafficWeight = 1
  const pricingWeight = 1.5
  const normalizer = 2 + 2 + 1.5 + geographyWeight + 2 + pricingWeight + 2 + trafficWeight

  return scores
    .filter(Boolean)
    .map((s: any) => {
      const etv = trafficMap?.[s.domain] || 0
      const tScore = trafficToScore(etv)
      return {
        ...s,
        estimatedTraffic: Math.round(etv),
        trafficScore: tScore,
        weightedScore: (
          (s.nicheSimilarity || 0) * 2 +
          (s.serviceSimilarity || 0) * 2 +
          (s.audienceSimilarity || 0) * 1.5 +
          (s.geographyFit || 0) * geographyWeight +
          (s.businessModelFit || 0) * 2 +
          (s.pricingModelFit || 0) * pricingWeight +
          (s.overallFit || 0) * 2 +
          tScore * trafficWeight
        ) / normalizer,
      }
    })
    .sort((a: any, b: any) => b.weightedScore - a.weightedScore)
    .slice(0, 6)
    .map((s: any) => ({ name: s.name || s.title || s.domain, domain: s.domain }))
}

// ─── Phase B: Orchestrator ────────────────────────────────────────────────────

const discoverCompetitors = async (openai: OpenAI, params: {
  businessSummary: string; businessLabel: string; businessType: string
  coreFunction: string; industryKeywords: string[]; marketScope: string
  marketCountry: string | null; language: string; originalDomain: string
  keyFeatures: string[]; useCases: string[]; tasksHelped: string[]
  uniqueSellingProps: string[]; problemSolved: string
}): Promise<{ name: string; domain: string }[]> => {
  if (!params.businessSummary) return []

  const queries = await generateSearchQueries(openai, params)
  if (!queries.length) return []

  const candidates = await searchCandidates(queries, params.originalDomain, params.businessType)
  if (!candidates.length) return []

  const [enrichedCandidates, trafficMap, pricingMap] = await Promise.all([
    Promise.all(candidates.map(async (c) => ({ ...c, detectedModel: await detectBusinessModel(c.domain) }))),
    fetchTrafficEstimates(candidates.map(c => c.domain)),
    fetchPricingPages(candidates),
  ])

  console.log(`[analyze-website] Step 2b — model detection:`, enrichedCandidates.map(c => `${c.domain}:${c.detectedModel}`))
  console.log(`[analyze-website] Step 2c — traffic (etv):`, Object.entries(trafficMap).map(([d, v]) => `${d}:${Math.round(v as number)}`))
  console.log(`[analyze-website] Step 2d — pricing pages available:`, Object.keys(pricingMap))

  const competitors = await scoreCandidates(openai, enrichedCandidates, {
    businessSummary: params.businessSummary,
    businessLabel: params.businessLabel,
    businessType: params.businessType,
    marketScope: params.marketScope,
    keyFeatures: params.keyFeatures,
    coreFunction: params.coreFunction,
    trafficMap,
    pricingMap,
  })
  console.log(`[analyze-website] Phase B complete — ${competitors.length} competitors ranked`)
  return competitors
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const { url, language = 'English', timezone = 'UTC' } = await request.json()

    if (!url) {
      return NextResponse.json({ success: false, error: 'URL is required' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const normalizedUrl = normalizeUrl(url)
    const originalDomain = extractDomain(normalizedUrl)

    // Duplicate brand check
    const { data: existingBrands } = await supabase
      .from('brands')
      .select('id, domain')
      .eq('owner_user_id', user.id)
      .eq('is_demo', false)
      .neq('domain', null)

    if (existingBrands) {
      const duplicate = existingBrands.find(brand => {
        if (!brand.domain) return false
        const existing = brand.domain.replace(/^https?:\/\//, '').replace(/^www\./, '')
        return existing === originalDomain
      })
      if (duplicate) {
        return NextResponse.json({
          success: false,
          error: `A brand with domain "${originalDomain}" already exists.`
        }, { status: 409 })
      }
    }

    const websiteContent = await fetchWebsiteContent(normalizedUrl)
    if (!websiteContent) {
      return NextResponse.json({
        success: false,
        error: 'Could not fetch website content. Please fill in the fields manually.',
      })
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ success: false, error: 'AI analysis service not configured' }, { status: 500 })
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

    // Phase A — GPT-4o-mini brand extraction
    const systemPrompt = `You are a brand analyst. Extract brand information from the provided website content.
The user selected these regional settings:
- Language: ${language}
- Timezone: ${timezone}

Use these as strong hints about where this business operates and who it serves.
Return ALL extracted information in ${language}. If ${language} is not English, translate everything to ${language}.

Return a valid JSON object with EXACTLY these fields:
{
  "brandName": "company name",
  "industry": "the industry sector",
  "productCategory": "type of product or service",
  "problemSolved": "the main problem the product addresses",
  "tasksHelped": ["task 1", "task 2", "task 3", "task 4", "task 5"],
  "goalFacilitated": "the main goal users achieve",
  "keyFeatures": ["feature 1", "feature 2", "feature 3", "feature 4"],
  "useCases": ["use case 1", "use case 2", "use case 3", "use case 4"],
  "uniqueSellingProps": ["usp 1", "usp 2", "usp 3", "usp 4"],
  "businessSummary": "2-3 sentence paragraph in English: who this company is, exactly what they do, what problem they solve, and where they operate",
  "coreFunction": "one precise sentence in English describing exactly what the product or service mechanically does — the technical action, not the business outcome. E.g. 'Monitors how a brand is mentioned inside AI-generated answers from ChatGPT, Perplexity, and Gemini' or 'Manufactures custom injection-molded plastic components for industrial clients'",
  "industryKeywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "businessLabel": "a short 2-5 word categorical label in English for what this business is — e.g. Marketing agency, B2B HR SaaS, Plastic parts manufacturer",
  "businessType": "saas_platform or agency_service or local_service or ecommerce or other",
  "marketScope": "local or global",
  "marketCountry": "the country name in English where this business primarily operates if local, or null if global"
}

Guidelines:
1. businessSummary, coreFunction, industryKeywords, businessLabel, businessType, marketScope and marketCountry must ALWAYS be in English
2. All other fields should be in ${language}
3. coreFunction must describe the exact technical mechanism — "what does this product literally do?" not "what does it achieve for the customer?"
4. industryKeywords: 3-5 specific technical terms, acronyms, or professional vocabulary that experts would Google to find this type of product/service. Not marketing language.
5. businessLabel must be short and categorical — strip all marketing language, 2-5 words max
6. businessType rules:
   - "saas_platform": has a dashboard, subscription model, users self-serve
   - "agency_service": humans deliver the service to clients
   - "local_service": requires physical presence or exclusively serves one local area
   - "ecommerce": primarily sells products online
   - "other": anything that doesn't clearly fit
   - IMPORTANT: saas_platform defaults to "global" marketScope unless language-locked or legally restricted
7. marketScope is "local" only if the business clearly targets one country exclusively
8. Do NOT include a competitors field`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Website URL: ${normalizedUrl}\n\nWebsite content:\n${websiteContent}` },
      ],
      temperature: 0.3,
      max_tokens: 1500,
      response_format: { type: 'json_object' },
    })

    const raw = completion.choices[0]?.message?.content?.trim()
    if (!raw) throw new Error('No response from OpenAI')
    const gptData = JSON.parse(raw)

    console.log(`[analyze-website] Phase A complete — businessLabel: "${gptData.businessLabel}", businessType: ${gptData.businessType}, marketScope: ${gptData.marketScope}`)

    // Phase B — Competitor discovery pipeline
    const competitors = await discoverCompetitors(openai, {
      businessSummary: gptData.businessSummary,
      businessLabel: gptData.businessLabel,
      businessType: gptData.businessType || 'other',
      coreFunction: gptData.coreFunction || '',
      industryKeywords: gptData.industryKeywords || [],
      marketScope: gptData.marketScope,
      marketCountry: gptData.marketCountry,
      language,
      originalDomain,
      keyFeatures: gptData.keyFeatures,
      useCases: gptData.useCases,
      tasksHelped: gptData.tasksHelped,
      uniqueSellingProps: gptData.uniqueSellingProps,
      problemSolved: gptData.problemSolved,
    })

    const brandData = {
      brandName: gptData.brandName,
      industry: gptData.industry,
      productCategory: gptData.productCategory,
      problemSolved: gptData.problemSolved,
      tasksHelped: gptData.tasksHelped,
      goalFacilitated: gptData.goalFacilitated,
      keyFeatures: gptData.keyFeatures,
      useCases: gptData.useCases,
      uniqueSellingProps: gptData.uniqueSellingProps,
      businessSummary: gptData.businessSummary || '',
      coreFunction: gptData.coreFunction || '',
      industryKeywords: gptData.industryKeywords || [],
      businessLabel: gptData.businessLabel || '',
      businessType: gptData.businessType || 'other',
      marketScope: gptData.marketScope || 'global',
      marketCountry: gptData.marketCountry || null,
      competitors,
      websiteUrl: normalizedUrl,
    }

    // Save to pending brand
    const { data: pendingBrands } = await supabase
      .from('brands')
      .select('id, onboarding_answers')
      .eq('owner_user_id', user.id)
      .eq('is_demo', false)
      .eq('onboarding_completed', false)
      .order('created_at', { ascending: false })
      .limit(1)

    if (pendingBrands && pendingBrands.length > 0) {
      const existingAnswers = pendingBrands[0].onboarding_answers || {}
      await supabase
        .from('brands')
        .update({
          onboarding_answers: { ...existingAnswers, ...brandData },
          domain: normalizedUrl,
          name: brandData.brandName,
        })
        .eq('id', pendingBrands[0].id)
    }

    return NextResponse.json({ success: true, brandData })

  } catch (err: any) {
    console.error('[analyze-website] Error:', err.message)
    return NextResponse.json({ success: false, error: err.message || 'Internal server error' }, { status: 500 })
  }
}
