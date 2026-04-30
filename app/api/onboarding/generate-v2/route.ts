import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export const maxDuration = 300 // Vercel Pro: full pipeline needs up to 5 min

const OPENAI_KEY = process.env.OPENAI_API_KEY

// ─── GPT-4o-mini call ─────────────────────────────────────────────────────────
async function gpt(system: string, user: string): Promise<any> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY!}` },
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
  // Primary: Jina Reader — renders JS-heavy sites and returns clean text
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BeVisibleBot/1.0)', Accept: 'text/plain' },
      signal: AbortSignal.timeout(10000), // 10s max — don't burn the whole budget on Jina
    })
    if (res.ok) {
      const text = await res.text()
      if (text && text.length > 200) return text.slice(0, 8000)
    }
  } catch {}

  // Fallback: direct HTML fetch + strip
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36' },
    redirect: 'follow',
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`)
  const html = await res.text()
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .trim()
  if (!text || text.length < 200) throw new Error(`Could not extract content from ${url}`)
  return text.slice(0, 8000)
}

// ─── Layer 1: Business profile ────────────────────────────────────────────────
async function generateProfile(rawText: string, region: string, language: string): Promise<any> {
  return gpt(
    `You are a business analyst that reads website content and produces a structured brand profile used as a seed for AI prompt generation.

Output a JSON object with this exact shape:
{
  "businessName": "string",
  "description": "string — 1–2 sentences describing what the business does and its key differentiator, written from a neutral third-party perspective",
  "industry": "string — one concise industry label",
  "geographicScope": {
    "type": "local | national | global",
    "primaryRegion": "string — the main country or region the business operates in",
    "secondaryRegions": ["array of other regions served, or empty array"],
    "isLocalNiche": "boolean — true if the business serves a very specific local community or niche geography (e.g. Arab market in Israel, one city only)"
  },
  "brandIdentity": ["array of 5–6 single adjective words describing the brand's character"],
  "productsServices": ["array of 5–8 specific products or services the business offers"],
  "audienceDistribution": {
    "simpleSeeker": "integer 0–100 — casual users who want a quick recommendation",
    "informedShopper": "integer 0–100 — users who know what they want and compare options",
    "evaluativeResearcher": "integer 0–100 — users who deeply analyze before deciding"
  },
  "suggestedCompetitors": [{"name": "CompetitorName", "domain": "competitor.com"}, ...],
  "typicalCustomer": "string — one sentence describing who typically uses or searches for this business",
  "customerGoals": ["array of exactly 5 strings — the 5 most common things a customer is trying to accomplish when they find this business"],
  "outputLanguage": "string — ALWAYS use the user-chosen language value exactly as provided",
  "userRegion": "string — ALWAYS use the user-chosen region value exactly as provided"
}

Rules:
- audienceDistribution values must sum to exactly 100
- For commodity/mass-market businesses (gyms, basic e-commerce): simpleSeeker ~60, informedShopper ~30, evaluativeResearcher ~10
- For professional services, B2B, or niche consulting: skew toward informedShopper and evaluativeResearcher
- suggestedCompetitors must be real brands that compete directly in this space — ordered most to least relevant. Each entry must include the official domain (e.g. "algolia.com", not a full URL)
- outputLanguage and userRegion MUST come from the user inputs verbatim — never infer them from the website`,
    `Website content:\n${rawText}\n\nUser-chosen region: ${region}\nUser-chosen language: ${language}`
  )
}

// ─── Layer 2: Topics ──────────────────────────────────────────────────────────
async function generateTopics(profile: any): Promise<string[]> {
  const result = await gpt(
    `You are an AI search behavior analyst. Given a business profile, generate exactly 5 competitive search topics.

WHAT A TOPIC IS:
A topic is a 2–5 word noun phrase representing a CATEGORY-LEVEL search that a potential customer types into an AI assistant to discover this type of business. Think of it as a competitive search space, not a specific product.

TOPIC QUALITY TEST — ask yourself: "Would a random person type this phrase to find ANY company in this space, or just this one product?" Topics must pass this test.

GOOD examples (category-level):
- "best athletic apparel brands" — not "stylish sports bras" (too product-specific)
- "24-hour fitness centers" — not "Anytime Fitness gyms" (brand name)
- "eco-friendly footwear brands" — not "washable wool shoes" (too specific feature)
- "high performance workout gear" — not "Gymshark leggings" (brand + product)
- "residential real estate agencies" — not "RE/MAX listings" (brand)

BAD examples (too narrow, too product-specific):
- "comfortable leggings for workouts" → should be "performance activewear"
- "stylish sports bras" → should be "athletic apparel brands"
- "Apple Fitness+ integration" → should be "digital fitness platforms"

Rules:
- Never include the brand name
- Must be written in the language specified in outputLanguage
- Cover 5 distinct commercially important search categories — spread across the brand's main service or product pillars
- Each topic should represent a competitive landscape where multiple brands compete
- Topics must be at the CATEGORY level, broad enough that a searcher could find several competitors through them

Output JSON: { "topics": ["topic1", "topic2", "topic3", "topic4", "topic5"] }`,
    `Business profile:\n${JSON.stringify(profile, null, 2)}`
  )
  return result.topics
}

// ─── Tier count calculation ────────────────────────────────────────────────────
function computeTierCounts(profile: any, count = 10) {
  const { simpleSeeker, informedShopper, evaluativeResearcher } = profile.audienceDistribution
  const minT3 = count >= 10 ? 2 : 1
  const minT2 = count >= 10 ? 3 : 2
  let t3 = Math.max(minT3, Math.round((evaluativeResearcher / 100) * count))
  let t2 = Math.max(minT2, Math.round((informedShopper / 100) * count + (simpleSeeker / 100) * (count / 2)))
  let t1 = count - t2 - t3
  if (t1 < 1) { t2 -= (1 - t1); t1 = 1 }
  return { t1, t2, t3 }
}

// ─── Layer 3: Prompts per topic ───────────────────────────────────────────────
async function generatePromptsForTopic(topic: string, profile: any, tierCounts: any, attempt = 1, count = 10): Promise<string[]> {
  const { t1, t2, t3 } = tierCounts
  const isLocal = profile.geographicScope.isLocalNiche
  const globalRegions = profile.geographicScope.type === 'global'
    ? 'US, European markets, Asia Pacific, Latin America, North America'
    : `${profile.geographicScope.primaryRegion} and surrounding regions`

  const geographicRule = isLocal
    ? `ALL prompts must reference the specific locality "${profile.userRegion}". Critically: vary HOW the locality is expressed — use different framings across the ${count} prompts:
  - As expertise: "agencies specializing in [X] in ${profile.userRegion}"
  - As cultural fit: "who understand [local community] in ${profile.userRegion}"
  - As a direct question with urgency: "Is there someone who can handle [X] in ${profile.userRegion} within [timeframe]?"
  - As credential framing: "with proven experience in the ${profile.userRegion} market"
  - As community language: use local phrasing, not just translating "in ${profile.userRegion}"
  Never use the same locality phrasing twice across the ${count} prompts.`
    : `Tier 1 prompts: no geography OR use "near me" / "in my area" — but "near me" may appear AT MOST ONCE across all ${count} prompts
Tier 2 prompts: include the user's region "${profile.userRegion}" specifically (not just "my area")
Tier 3 prompts: reference at least 2 specific regions from [${globalRegions}], draw a cross-region comparison`

  const tier1Examples = `"Best gym membership options." / "Top rated fitness centers." / "Affordable workout gear brands." / "Commercial property brokers." / "Eco-friendly shoe brands." / "Group fitness classes nearby."`
  const tier2Examples = `"I need a gym in the United States that offers affordable personal training packages for beginners." / "Find a brokerage offering homebuyer resources for a first-time buyer with a budget under $500k." / "Looking for breathable activewear under $100 that ships quickly to the US."`
  const tier3Examples = `"Compare the accessibility and equipment density of major 24-hour fitness chains operating across global markets to determine which provides the most consistent member experience." / "Evaluate the residential real estate brokerage landscape in the United States, specifically focusing on agent network depth and educational resources for first-time sellers." / "Analyze the market for sustainable footwear brands in the US, comparing material sustainability credentials and pricing across East Coast and West Coast retailers."`

  const result = await gpt(
    `You are generating realistic AI search prompts for brand visibility research.

Generate EXACTLY ${count} prompts for the given search topic. These simulate what real people type into AI assistants (ChatGPT, Perplexity) when searching the competitive space this topic represents.

YOU MUST OUTPUT EXACTLY ${count} PROMPTS — count them before responding. Not ${count - 1}, not ${count + 1}. Exactly ${count}.

⚠️ LANGUAGE OVERRIDE — THIS IS THE MOST IMPORTANT RULE:
The user has explicitly chosen "${profile.outputLanguage}" as their language BEFORE any website analysis happened. This is a non-negotiable user decision. Every single one of the ${count} prompts MUST be written in ${profile.outputLanguage} — regardless of what language the website is in, regardless of what language the topic name is in, regardless of anything else. If you write even one prompt in a different language, the entire output is invalid. Check every prompt before outputting.

STRICT RULES — all must be followed:

1. BRAND EXCLUSION: Never mention the brand name or domain in any prompt.

2. SEARCHER PERSPECTIVE: Every prompt is written as if typed by a customer searching for this type of business — not by the brand itself.

3. LANGUAGE: ${profile.outputLanguage} only. See the language override above. No exceptions, no mixing, no partial translations.

4. OPENING VERB DIVERSITY: Each of the ${count} prompts must start with a DIFFERENT opener. Never repeat an opener within the same set. Choose from: List, Show me, Find me, Compare, Help me find, Recommend, Search for, Suggest, Where can I, I need, Identify, Locate, Evaluate, Analyze, Can you — use each at most once.

5. LENGTH TIERS — generate EXACTLY this distribution:
   - ${t1} Tier 1 prompts → SHORT (2–7 words): Fragment or keyword-cluster style. No geography unless "near me" (used max once total). No constraints. Must feel like a quick casual search.
     Good examples: ${tier1Examples}
     Bad: "Gyms near me that are open 24/7" (too long), "The best gym for me" (too vague)

   - ${t2} Tier 2 prompts → MEDIUM (10–25 words): Conversational, specific need, includes at least ONE real constraint (realistic budget for this industry, a timeframe, or a quality requirement).
     Good examples: ${tier2Examples}
     Bad: "Help me find a gym" (no constraint), "I need good shoes" (too vague)

   - ${t3} Tier 3 prompts → LONG (35–70 words): Analytical/comparative, cross-geographic, examines specific competitive dimensions. Must follow the structure: [Analyze/Compare/Evaluate] + [aspect/landscape/model] + [entity category] + [geographic anchor] + [specifically comparing/focusing on] + [dimension A] + [and dimension B].
     Good examples: ${tier3Examples}
     Bad: Long but not analytical, or analytical but missing geographic comparison

6. GEOGRAPHIC INJECTION:
${geographicRule}

7. INTENT COVERAGE: Across the ${count} prompts, cover ALL of these intent types (at least once each): discovery, comparison, evaluation, recommendation, local/near-me search, direct need with constraint, deep analytical research, list request.

8. CONSTRAINT CALIBRATION: Budget and price constraints in Tier 2 must be realistic for "${profile.industry}". A gym membership, a commercial property, and a sneaker brand have very different realistic price ranges — calibrate accordingly.

9. NO STRUCTURAL REPETITION: Avoid repeating sentence structures across prompts. Variety in structure is as important as variety in wording.

10. NATURALNESS: Short prompts feel like someone typing fast on their phone. Medium prompts feel like a specific real-world need. Long prompts feel like a researcher crafting a careful, detailed query.

11. GROUND IN CUSTOMER GOALS: Every prompt must reflect something the customer is actually trying to do. Use the customer goals provided in the business context as your anchor — prompts that don't connect to a real customer goal are invalid.

Before outputting: (1) count that you have exactly ${count} prompts, (2) verify every single prompt is in ${profile.outputLanguage} — fix any that are not.

Output JSON: { "prompts": [/* exactly ${count} strings */] }`,
    `REQUIRED OUTPUT LANGUAGE: ${profile.outputLanguage} — every prompt must be in this language, no exceptions.

Topic: "${topic}"

Business context:
- Description: ${profile.description}
- Industry: ${profile.industry}
- Typical customer: ${profile.typicalCustomer || ''}
- Customer goals: ${(profile.customerGoals || []).map((g: string, i: number) => `${i + 1}. ${g}`).join(' | ')}
- Geographic scope: ${profile.geographicScope.type} (primary: ${profile.geographicScope.primaryRegion})
- Brand identity: ${profile.brandIdentity.join(', ')}
- Products/services: ${profile.productsServices.join(', ')}
- User region: ${profile.userRegion}
- Required tier counts: ${t1} short / ${t2} medium / ${t3} long (total = ${count})`
  )

  const prompts = result.prompts
  if (!Array.isArray(prompts) || prompts.length !== count) {
    if (attempt < 2) return generatePromptsForTopic(topic, profile, tierCounts, 2, count)
  }
  return Array.isArray(prompts) ? prompts : []
}

function normalizeDomain(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '').toLowerCase()
}

// ─── Real Estate Israel: classification ───────────────────────────────────────
async function classifyRealEstateIsrael(rawText: string, profile: any): Promise<{ isRealEstate: boolean; confidence: string; reason: string; matchedBusinessKind: string | null }> {
  const result = await gpt(
    `You are a business classifier. Determine if this company is active in the Israeli physical real estate market.

Return true if the company is any of:
- Real estate developer or builder constructing properties in Israel
- Real estate agency or brokerage selling properties in Israel
- Company marketing or selling physical real estate projects in Israel

Return false for:
- Real estate software or technology companies
- Mortgage or finance companies only (no property sales)
- Property management only (no sales or development)
- Global real estate portals with minor Israel presence
- Companies selling overseas properties without Israel activity

Output JSON: { "isRealEstate": boolean, "confidence": "high|medium|low", "reason": "one sentence", "matchedBusinessKind": "developer|builder|agency|brokerage|marketing_company|null" }`,
    `Industry: ${profile.industry}\nDescription: ${profile.description}\nProducts/Services: ${(profile.productsServices || []).join(', ')}\n\nWebsite excerpt:\n${rawText.slice(0, 3000)}`
  )
  return {
    isRealEstate: result.isRealEstate === true,
    confidence: result.confidence || 'low',
    reason: result.reason || '',
    matchedBusinessKind: result.matchedBusinessKind || null,
  }
}

// ─── Real Estate Israel: subpage fetch ────────────────────────────────────────
async function fetchRESubpages(baseUrl: string): Promise<string> {
  const base = baseUrl.replace(/\/$/, '')
  const subpaths = ['/projects', '/פרויקטים', '/portfolio', '/our-projects', '/homes', '/apartments']
  for (const path of subpaths) {
    try {
      const text = await fetchWebsiteText(base + path)
      if (text && text.length > 200) return text.slice(0, 4000)
    } catch {}
  }
  return ''
}

// ─── Real Estate Israel: extract projects + cities ────────────────────────────
async function extractREProjectsAndCities(combinedText: string, profile: any): Promise<{ projects: Array<{project_name: string; city: string | null}>; cities: string[] }> {
  const result = await gpt(
    `You are a real estate data extractor for Israeli real estate companies.

From the website content, extract:
1. "projects" — specific real estate projects the company builds or markets. For each project include:
   - "project_name": the project's proper name (e.g. "מגדל השחר", "פרויקט הפארק", "Aliya Tower")
   - "city": the city or neighborhood where the project is located (null if not mentioned)
   Max 15 projects. Empty array if none clearly found.
2. "cities" — additional cities or neighborhoods where the company operates, beyond those already named in projects. Max 10.

Only include names clearly identifiable from the text. Do not invent or guess.

Output JSON: { "projects": [{"project_name": "...", "city": "..." or null}], "cities": [] }`,
    `Company: ${profile.businessName}\n\nWebsite content:\n${combinedText.slice(0, 8000)}`
  )
  return {
    projects: Array.isArray(result.projects)
      ? result.projects.slice(0, 15).map((p: any) => ({
          project_name: String(p.project_name || '').trim(),
          city: p.city ? String(p.city).trim() : null,
        })).filter((p: any) => p.project_name)
      : [],
    cities: Array.isArray(result.cities) ? result.cities.slice(0, 10) : [],
  }
}

// ─── Real Estate Israel: topic generation (7 topics) ─────────────────────────
async function generateRETopics(profile: any): Promise<string[]> {
  const result = await gpt(
    `You are an AI search behavior analyst for the Israeli real estate market.
Given a real estate company profile, generate exactly 7 competitive search topics.

STRUCTURE — follow this EXACTLY:
- Topics 1–5: 5 distinct competitive search categories for Israeli real estate (comparing developers, apartment pricing, investment returns, home buying process, new construction quality, etc.)
- Topic 6: MUST be specifically about finding or comparing named new real estate projects, developments, towers, or new-build apartments for sale in Israel
- Topic 7: MUST be specifically about cities, neighborhoods, districts, or areas where to buy or invest in Israeli real estate

Rules:
- All 7 topics must be written in ${profile.outputLanguage}
- Never include the brand name
- Category-level topics — broad enough that multiple companies compete
- Topics 6 and 7 must match their described purpose exactly

Output JSON: { "topics": ["t1", "t2", "t3", "t4", "t5", "t_projects", "t_localities"] }`,
    `Business profile:\n${JSON.stringify({ businessName: profile.businessName, description: profile.description, industry: profile.industry, productsServices: profile.productsServices, geographicScope: profile.geographicScope, outputLanguage: profile.outputLanguage, userRegion: profile.userRegion }, null, 2)}`
  )
  if (!Array.isArray(result.topics) || result.topics.length < 7) {
    throw new Error('RE topics generation returned insufficient topics')
  }
  return result.topics.slice(0, 7)
}

// ─── POST handler (SSE stream) ────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  if (!OPENAI_KEY) {
    return new Response(JSON.stringify({ error: 'OpenAI API key not configured on this server.' }), { status: 500 })
  }

  const adminSupabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
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
        // ── Rate limit: user account (25 total scans) ─────────────────────────
        const { data: userRow } = await adminSupabase
          .from('users').select('onboarding_generation_count').eq('id', user.id).single()
        const userCount = userRow?.onboarding_generation_count ?? 0
        if (userCount >= 25) {
          send({ type: 'error', data: { message: 'Account generation limit reached (25). Contact support to increase.' } })
          controller.close(); return
        }

        // ── Find or create brand ──────────────────────────────────────────────
        const { data: existingBrands } = await adminSupabase
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
            send({ type: 'error', data: { message: `Failed to create brand record: ${createError?.message}` } })
            controller.close(); return
          }
          brandId = newBrand.id
        }

        // Increment user generation count
        await adminSupabase.from('users').upsert(
          { id: user.id, email: user.email, onboarding_generation_count: userCount + 1 },
          { onConflict: 'id' }
        )

        // ── Fetch website ─────────────────────────────────────────────────────
        let rawText: string
        try {
          rawText = await fetchWebsiteText(websiteUrl)
        } catch (e: any) {
          send({ type: 'error', data: { message: `Could not fetch website: ${e.message}` } })
          controller.close(); return
        }

        // ── Layer 1: Profile ──────────────────────────────────────────────────
        let profile: any
        try {
          profile = await generateProfile(rawText, region, language)
        } catch (e: any) {
          send({ type: 'error', data: { message: `Failed to analyze business profile: ${e.message}` } })
          controller.close(); return
        }
        send({ type: 'profile', data: profile })

        // ── RE Classification ─────────────────────────────────────────────────
        let isRealEstateIsrael = false
        let reProjectData: { projects: Array<{project_name: string; city: string | null}>; cities: string[] } = { projects: [], cities: [] }
        let reClassification: { confidence: string; reason: string } = { confidence: 'low', reason: '' }

        try {
          const reClass = await classifyRealEstateIsrael(rawText, profile)
          isRealEstateIsrael = reClass.isRealEstate
          reClassification = { confidence: reClass.confidence, reason: reClass.reason }
        } catch (e: any) {
          console.error('[generate-v2] RE classification failed (non-blocking):', e.message)
        }

        if (isRealEstateIsrael) {
          const subpageText = await fetchRESubpages(websiteUrl).catch(() => '')
          const combinedText = (rawText + (subpageText ? '\n\n' + subpageText : '')).slice(0, 12000)

          try {
            reProjectData = await extractREProjectsAndCities(combinedText, profile)
          } catch (e: any) {
            console.error('[generate-v2] RE project extraction failed (non-blocking):', e.message)
          }

          // Mark brand as real estate
          await adminSupabase.from('brands').update({ user_business_type: 'real_estate_israel' }).eq('id', brandId)

          // Stream RE data so the frontend can show State D
          send({ type: 'real_estate_data', data: {
            projects: reProjectData.projects,
            cities: reProjectData.cities,
            classification: reClassification,
          } })
        }

        // ── Layer 2: Topics (RE-branched) ─────────────────────────────────────
        let topics: string[]
        try {
          topics = isRealEstateIsrael
            ? await generateRETopics(profile)
            : await generateTopics(profile)
          if (!Array.isArray(topics) || topics.length < 3) throw new Error('Not enough topics generated')
        } catch (e: any) {
          send({ type: 'error', data: { message: `Failed to generate search topics: ${e.message}` } })
          controller.close(); return
        }
        send({ type: 'topics', data: topics })

        // ── Layer 3: Prompts per topic (parallel GPT, sequential DB write) ───────
        // RE brands: 7 topics × [7,7,7,7,7,8,7] prompts = 50 total
        // General brands: 5 topics × 10 prompts = 50 total
        const RE_TOPIC_COUNTS = [7, 7, 7, 7, 7, 8, 7]

        // Clear any prompts from previous scan attempts before streaming new ones
        await adminSupabase.from('brand_prompts').delete().eq('brand_id', brandId)

        // Run all GPT calls in parallel for speed, collect results
        const topicResults: { topic: string; prompts: string[] }[] = await Promise.all(
          topics.map(async (topic, topicIndex) => {
            const count = isRealEstateIsrael ? (RE_TOPIC_COUNTS[topicIndex] ?? 10) : 10
            const topicTierCounts = computeTierCounts(profile, count)
            let prompts: string[]
            try { prompts = await generatePromptsForTopic(topic, profile, topicTierCounts, 1, count) }
            catch { prompts = [] }
            send({ type: 'prompts_topic', data: { topic, prompts } })
            return { topic, prompts }
          })
        )

        // Write to DB sequentially to avoid UNIQUE(brand_id, raw_prompt) race collisions
        // Set improved_prompt = raw_prompt so dashboard reads correctly (V1 parity)
        let totalPrompts = 0
        for (const { topic, prompts } of topicResults) {
          if (prompts.length === 0) continue
          const { error: insertError } = await adminSupabase.from('brand_prompts').upsert(
            prompts.map(p => ({
              brand_id: brandId,
              raw_prompt: p,
              improved_prompt: p,
              status: 'inactive',
              category: topic,
            })),
            { onConflict: 'brand_id,raw_prompt', ignoreDuplicates: true }
          )
          if (insertError) {
            console.error(`[generate-v2] brand_prompts upsert failed for topic "${topic}":`, insertError.message, insertError.code)
            send({ type: 'error', data: { message: `Failed to save prompts for "${topic}": ${insertError.message}` } })
            controller.close(); return
          }
          totalPrompts += prompts.length
        }

        send({ type: 'done', data: { brandId, totalPrompts } })
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
