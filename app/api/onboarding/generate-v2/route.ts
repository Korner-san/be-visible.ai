import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export const maxDuration = 60 // Vercel Pro: up to 60s for the full pipeline

const OPENAI_KEY = process.env.OPENAI_API_KEY!

// ─── GPT-4o-mini call ─────────────────────────────────────────────────────────
async function gpt(system: string, user: string): Promise<any> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      temperature: 0.85,
      response_format: { type: 'json_object' },
    }),
  })
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return JSON.parse(data.choices[0].message.content)
}

// ─── HTML fetch ───────────────────────────────────────────────────────────────
async function fetchWebsiteText(url: string): Promise<string> {
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BeVisibleBot/1.0)', Accept: 'text/plain' },
      signal: AbortSignal.timeout(20000),
    })
    if (res.ok) {
      const text = await res.text()
      if (text && text.length > 200) return text.slice(0, 8000)
    }
  } catch {}
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36' },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const html = await res.text()
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ').replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim()
  if (!text || text.length < 200) throw new Error('Could not extract content from website')
  return text.slice(0, 8000)
}

// ─── Layer 1: Business profile ────────────────────────────────────────────────
async function generateProfile(rawText: string, region: string, language: string): Promise<any> {
  return gpt(
    `You are a business analyst producing a structured brand profile as a seed for AI prompt generation.

Output JSON with this exact shape:
{
  "businessName": "string",
  "description": "1–2 sentences describing what the business does and its key differentiator, neutral third-party perspective",
  "industry": "one concise industry label",
  "geographicScope": {
    "type": "local | national | global",
    "primaryRegion": "string",
    "secondaryRegions": [],
    "isLocalNiche": false
  },
  "brandIdentity": ["5–6 single adjective words"],
  "productsServices": ["5–8 specific products or services"],
  "audienceDistribution": {
    "simpleSeeker": 60,
    "informedShopper": 30,
    "evaluativeResearcher": 10
  },
  "suggestedCompetitors": ["5–8 well-known competitor brand names in this exact competitive space, ordered by market relevance"],
  "outputLanguage": "${language}",
  "userRegion": "${region}"
}
Rules:
- audienceDistribution must sum to exactly 100
- suggestedCompetitors must be real brands that compete in this space — ordered most to least relevant
- outputLanguage and userRegion MUST be the exact values provided — never infer from website`,
    `Website content:\n${rawText}\n\nUser region: ${region}\nUser language: ${language}`
  )
}

// ─── Layer 2: Topics ──────────────────────────────────────────────────────────
async function generateTopics(profile: any): Promise<string[]> {
  const result = await gpt(
    `You are an AI search behavior analyst. Given a business profile, generate exactly 5 competitive search topics.

A topic is a 2–5 word noun phrase representing a CATEGORY-LEVEL search a potential customer types into an AI assistant to discover this type of business. Not a specific product — a competitive search space.

Rules:
- Never include the brand name
- Written in the language specified in outputLanguage
- Cover 5 distinct commercially important search categories across the brand's main service pillars
- Each topic represents a landscape where multiple brands compete

Output JSON: { "topics": ["topic1", "topic2", "topic3", "topic4", "topic5"] }`,
    `Business profile:\n${JSON.stringify(profile, null, 2)}`
  )
  return result.topics
}

// ─── Tier counts ──────────────────────────────────────────────────────────────
function computeTierCounts(profile: any) {
  const { simpleSeeker, informedShopper, evaluativeResearcher } = profile.audienceDistribution
  let t3 = Math.max(2, Math.round((evaluativeResearcher / 100) * 10))
  let t2 = Math.max(3, Math.round((informedShopper / 100) * 10 + (simpleSeeker / 100) * 5))
  let t1 = 10 - t2 - t3
  if (t1 < 1) { t2 -= (1 - t1); t1 = 1 }
  return { t1, t2, t3 }
}

// ─── Layer 3: Prompts per topic ───────────────────────────────────────────────
async function generatePromptsForTopic(topic: string, profile: any, tierCounts: any, attempt = 1): Promise<string[]> {
  const { t1, t2, t3 } = tierCounts
  const isLocal = profile.geographicScope.isLocalNiche
  const globalRegions = profile.geographicScope.type === 'global'
    ? 'US, European markets, Asia Pacific, Latin America, North America'
    : `${profile.geographicScope.primaryRegion} and surrounding regions`

  const geoRule = isLocal
    ? `ALL prompts must reference "${profile.userRegion}". Vary HOW you express the locality across the 10 prompts — never use the same phrasing twice (expertise framing, cultural fit, credential framing, direct question, etc.).`
    : `Tier 1: no geography OR "near me" (max once across all 10). Tier 2: include "${profile.userRegion}" specifically. Tier 3: reference at least 2 regions from [${globalRegions}] with cross-region comparison.`

  const result = await gpt(
    `You are generating realistic AI search prompts for brand visibility research.

Generate EXACTLY 10 prompts for the given search topic. Count before responding. Exactly 10 — not 9, not 11.

⚠️ LANGUAGE OVERRIDE: Every single prompt MUST be in ${profile.outputLanguage}. No exceptions. Verify each prompt before outputting.

STRICT RULES:
1. BRAND EXCLUSION: Never mention the brand name or domain.
2. SEARCHER PERSPECTIVE: Written as typed by a real customer searching for this type of business.
3. LANGUAGE: ${profile.outputLanguage} only — absolutely no mixing.
4. OPENING VERB DIVERSITY: Each prompt starts with a DIFFERENT opener. Use each at most once: List, Show me, Find me, Compare, Help me find, Recommend, Search for, Suggest, Where can I, I need, Identify, Locate, Evaluate, Analyze, Can you
5. LENGTH TIERS — generate EXACTLY:
   - ${t1} SHORT (2–7 words): Fragment/keyword style. No geography, no constraints.
   - ${t2} MEDIUM (10–25 words): Conversational, includes at least 1 real constraint (budget/timeframe/quality requirement). Budget calibrated for "${profile.industry}".
   - ${t3} LONG (35–70 words): Analytical/comparative. Structure: [Analyze/Compare/Evaluate] + [aspect] + [entity category] + [geographic anchor] + [focusing on] + [dimension A] + [and dimension B].
6. GEOGRAPHIC INJECTION: ${geoRule}
7. INTENT COVERAGE: Cover discovery, comparison, evaluation, recommendation, local search, direct need with constraint, deep analysis, and list request.
8. NO STRUCTURAL REPETITION: Vary sentence structures — if one Tier 2 starts "I need a [noun] in the US that...", the next Tier 2 must use a different structure.

Output JSON: { "prompts": ["prompt1", ..., "prompt10"] }`,
    `REQUIRED LANGUAGE: ${profile.outputLanguage}\n\nTopic: "${topic}"\n\nBusiness context:\n- Description: ${profile.description}\n- Industry: ${profile.industry}\n- Scope: ${profile.geographicScope.type} (primary: ${profile.geographicScope.primaryRegion})\n- Products/services: ${profile.productsServices.join(', ')}\n- User region: ${profile.userRegion}\n- Tier counts: ${t1} short / ${t2} medium / ${t3} long`
  )

  const prompts = result.prompts
  if (!Array.isArray(prompts) || prompts.length !== 10) {
    if (attempt < 2) return generatePromptsForTopic(topic, profile, tierCounts, 2)
  }
  return Array.isArray(prompts) ? prompts : []
}

function normalizeDomain(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '').toLowerCase()
}

// ─── POST handler (SSE stream) ────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const adminSupabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const { brandName, websiteUrl, language = 'English', region = 'United States' } = body

  if (!brandName || !websiteUrl) {
    return new Response(JSON.stringify({ error: 'brandName and websiteUrl are required' }), { status: 400 })
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: object) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)) } catch {}
      }

      try {
        // ── Rate limit: user account (25 total scans) ─────────────────────
        const { data: userRow } = await adminSupabase
          .from('users').select('onboarding_generation_count').eq('id', user.id).single()
        const userCount = userRow?.onboarding_generation_count ?? 0
        if (userCount >= 25) {
          send({ type: 'error', data: { message: 'Account generation limit reached (25). Contact support to increase.' } })
          controller.close(); return
        }

        // ── Find or create brand ──────────────────────────────────────────
        const { data: existingBrands } = await supabase
          .from('brands').select('id, generation_attempts').eq('owner_user_id', user.id)
          .eq('is_demo', false).eq('onboarding_completed', false)
          .order('created_at', { ascending: false }).limit(1)

        let brandId: string
        const existing = existingBrands?.[0]

        if (existing) {
          const attempts = existing.generation_attempts ?? 0
          if (attempts >= 5) {
            send({ type: 'error', data: { message: 'Brand scan limit reached (5 attempts). Start fresh or contact support.' } })
            controller.close(); return
          }
          brandId = existing.id
          await adminSupabase.from('brands').update({
            generation_attempts: attempts + 1,
            name: brandName,
            domain: normalizeDomain(websiteUrl),
            onboarding_answers: { brandName, websiteUrl, onboardingVersion: 'v2' },
          }).eq('id', brandId)
        } else {
          const { data: newBrand, error: createError } = await adminSupabase
            .from('brands').insert({
              name: brandName,
              domain: normalizeDomain(websiteUrl),
              owner_user_id: user.id,
              is_demo: false,
              onboarding_completed: false,
              generation_attempts: 1,
              onboarding_answers: { brandName, websiteUrl, onboardingVersion: 'v2' },
            }).select('id').single()
          if (createError || !newBrand) {
            send({ type: 'error', data: { message: 'Failed to create brand record.' } })
            controller.close(); return
          }
          brandId = newBrand.id
        }

        // Increment user generation count (upsert handles new users)
        await adminSupabase.from('users').upsert(
          { id: user.id, email: user.email, onboarding_generation_count: userCount + 1 },
          { onConflict: 'id' }
        )

        // ── Fetch website ────────────────────────────────────────────────
        let rawText: string
        try {
          rawText = await fetchWebsiteText(websiteUrl)
        } catch (e: any) {
          send({ type: 'error', data: { message: `Could not fetch website: ${e.message}` } })
          controller.close(); return
        }

        // ── Layer 1: Profile ─────────────────────────────────────────────
        let profile: any
        try {
          profile = await generateProfile(rawText, region, language)
        } catch {
          send({ type: 'error', data: { message: 'Failed to analyze business profile.' } })
          controller.close(); return
        }
        send({ type: 'profile', data: profile })

        // ── Layer 2: Topics ──────────────────────────────────────────────
        let topics: string[]
        try {
          topics = await generateTopics(profile)
          if (!Array.isArray(topics) || topics.length < 3) throw new Error('Not enough topics generated')
        } catch {
          send({ type: 'error', data: { message: 'Failed to generate search topics.' } })
          controller.close(); return
        }
        send({ type: 'topics', data: topics })

        // ── Layer 3: Prompts per topic (parallel) ────────────────────────
        const tierCounts = computeTierCounts(profile)
        const promptResults: { topic: string; prompts: string[] }[] = []

        await Promise.all(topics.map(async (topic) => {
          let prompts: string[]
          try { prompts = await generatePromptsForTopic(topic, profile, tierCounts) }
          catch { prompts = [] }
          send({ type: 'prompts_topic', data: { topic, prompts } })
          promptResults.push({ topic, prompts })
        }))

        // ── Save prompts to DB (delete existing first for retry safety) ──
        await adminSupabase.from('brand_prompts').delete().eq('brand_id', brandId)

        const rows: any[] = []
        for (const { topic, prompts } of promptResults) {
          for (const prompt of prompts) {
            rows.push({ brand_id: brandId, raw_prompt: prompt, status: 'active', category: topic })
          }
        }
        if (rows.length > 0) await adminSupabase.from('brand_prompts').insert(rows)

        send({ type: 'done', data: { brandId, tierCounts, totalPrompts: rows.length } })
        controller.close()

      } catch (err: any) {
        send({ type: 'error', data: { message: err?.message || 'Unexpected error during generation.' } })
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
