import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export const maxDuration = 300 // Vercel Pro: full pipeline needs up to 5 min

const OPENAI_KEY = process.env.OPENAI_API_KEY
const TAVILY_KEY = process.env.TAVILY_API_KEY

// ─── GPT call. General onboarding defaults to GPT-4o-mini. ────────────────────
async function gpt(system: string, user: string, model = 'gpt-4o-mini'): Promise<any> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY!}` },
    body: JSON.stringify({
      model,
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

// ─── Real Estate Israel: Tavily map + extract ─────────────────────────────────
// Maps the full site to discover URLs, filters relevant ones, extracts content.
async function tavilyMapAndExtract(websiteUrl: string): Promise<string> {
  if (!TAVILY_KEY) return ''

  try {
    const urlObj = new URL(websiteUrl.startsWith('http') ? websiteUrl : 'https://' + websiteUrl)
    const origin = urlObj.origin // e.g. https://electra-re.com

    // Step 1: Map the site — discover all URLs
    const mapRes = await fetch('https://api.tavily.com/map', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: TAVILY_KEY, url: origin, limit: 50 }),
      signal: AbortSignal.timeout(15000),
    })

    let discoveredUrls: string[] = []
    if (mapRes.ok) {
      const mapData = await mapRes.json()
      discoveredUrls = mapData.urls || []
    }

    // Step 2: Filter to pages likely to contain project/property info
    const relevantKeywords = [
      'project', 'פרויקט', 'portfolio', 'apartment', 'דירות', 'residential',
      'homes', 'properties', 'development', 'neighborhood', 'שכונה', 'building',
      'our-work', 'estate', 'realty', 'housing',
    ]
    let relevantUrls = discoveredUrls
      .filter(u => relevantKeywords.some(kw => u.toLowerCase().includes(kw.toLowerCase())))
      .slice(0, 8)

    // If map returned nothing relevant, fall back to domain root + provided URL
    if (relevantUrls.length === 0) {
      relevantUrls = [websiteUrl, origin].filter((u, i, arr) => arr.indexOf(u) === i).slice(0, 2)
    }

    // Step 3: Extract content from relevant URLs in one call
    const extractRes = await fetch('https://api.tavily.com/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: TAVILY_KEY, urls: relevantUrls }),
      signal: AbortSignal.timeout(20000),
    })

    if (!extractRes.ok) return ''
    const extractData = await extractRes.json()

    return (extractData.results || [])
      .map((r: any) => r.raw_content || r.content || '')
      .filter((c: string) => c.length > 100)
      .join('\n\n')
      .slice(0, 8000)

  } catch {
    return ''
  }
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
    `Company: ${profile.businessName}\n\nWebsite content:\n${combinedText.slice(0, 8000)}`,
    'gpt-4o'
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

const REAL_ESTATE_TOPIC_COUNTS = [9, 8, 8, 7, 7, 5, 6]

const REAL_ESTATE_TOPIC_STRATEGY = [
  { key: 'city_area_apartment_search', purpose: 'City / area / neighborhood apartment search. Simulate buyers searching by city, neighborhood, district, or area. Heavily use detectedCities when available.' },
  { key: 'family_home_buying_residential_living', purpose: 'Family home buying / residential living. Consider schools, kindergartens, parks, safety, community, parking, mamad, balcony, elevator, daily convenience, commute, and long-term family fit.' },
  { key: 'investment_rental_yield_appreciation', purpose: 'Investment apartment / rental yield / appreciation. Consider rental yield, rental demand, future appreciation, transport access, employment areas, students, development plans, liquidity, taxes, and risk.' },
  { key: 'price_payment_terms_mortgage_affordability', purpose: 'Price / payment terms / mortgage affordability. Consider price per meter, payment terms, 20/80, 10/90, indexation, mortgage, monthly repayment, equity, taxes, legal fees, and hidden costs.' },
  { key: 'developer_credibility_construction_quality_risk', purpose: 'Developer credibility / construction quality / project risk. Consider previous projects, delivery track record, construction quality, bank guarantee, permit status, contract risk, technical specs, complaints, transparency, and handover.' },
  { key: 'apartment_type_physical_features_lifestyle_fit', purpose: 'Apartment type / physical features / lifestyle fit. Consider 3-room, 4-room, 5-room, garden apartment, penthouse, balcony, storage, parking, mamad, elevator, layout, sunlight, air directions, home office, and long-term suitability.' },
  { key: 'comparing_projects_developers_alternatives', purpose: 'Comparing projects / developers / alternatives. Simulate competitive AI searches comparing projects in the same city, developers in the same region, new-build vs second-hand apartments, city vs city, and family vs luxury alternatives.' },
]

function uniqueStrings(values: unknown[], max = 30): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const clean = String(value || '').trim()
    if (!clean) continue
    const key = clean.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(clean)
    if (out.length >= max) break
  }
  return out
}

function realEstatePromptContext(profile: any, cities: string[], projects: Array<{ project_name: string; city: string | null }>, classification: any) {
  return {
    businessName: profile.businessName,
    description: profile.description,
    industry: profile.industry,
    productsServices: profile.productsServices || [],
    geographicScope: profile.geographicScope,
    outputLanguage: profile.outputLanguage,
    userRegion: profile.userRegion,
    detectedCities: cities,
    detectedProjects: projects,
    matchedBusinessKind: classification?.matchedBusinessKind || null,
    classificationConfidence: classification?.confidence || null,
    classificationReason: classification?.reason || null,
  }
}

async function generateRealEstateTopics(
  profile: any,
  detectedCities: string[],
  detectedProjects: Array<{ project_name: string; city: string | null }>,
  classification: any
): Promise<string[]> {
  const result = await gpt(
    `You are an AI search behavior analyst for Israeli residential real estate.

Generate EXACTLY 7 topic category names in ${profile.outputLanguage}. These are category labels for onboarding UI and database category grouping.

The 7 topics must follow this exact strategy and order:
${REAL_ESTATE_TOPIC_STRATEGY.map((topic, i) => `${i + 1}. ${topic.purpose}`).join('\n')}

Rules:
- Keep each topic name concise: 3-8 words.
- Do not mention the brand name or brand domain.
- Use the selected output language only.
- Make topic 1 naturally reflect the detected city/area search pattern if cities exist.
- Do not invent cities, neighborhoods, projects, or competitors.
- Preserve the exact strategic order above.

Output JSON only: { "topics": ["topic1", "topic2", "topic3", "topic4", "topic5", "topic6", "topic7"] }`,
    `Real estate generation context:\n${JSON.stringify(realEstatePromptContext(profile, detectedCities, detectedProjects, classification), null, 2)}`,
    'gpt-4o'
  )

  const topics = Array.isArray(result.topics) ? uniqueStrings(result.topics, 7) : []
  if (topics.length !== 7) throw new Error(`Real estate topic generation returned ${topics.length} topics instead of 7`)
  return topics
}

function containsBrandReference(prompt: string, brandName: string, brandDomain: string): boolean {
  const lower = prompt.toLowerCase()
  const domain = normalizeDomain(brandDomain || '')
  const brand = String(brandName || '').trim().toLowerCase()
  return Boolean((brand && lower.includes(brand)) || (domain && lower.includes(domain)))
}

function realEstateForbiddenTerms(profile: any, brandDomain: string, projects: string[]): string[] {
  const domain = normalizeDomain(brandDomain || '')
  const domainParts = domain.split(/[.\-_/]+/g)
  const brandParts = String(profile.businessName || '').split(/\s+/g)
  const genericBrandTokens = new Set([
    'מגורים', 'נדלן', 'נדל״ן', 'נדל"ן', 'פרויקטים', 'דירות', 'ישראל',
    'real', 'estate', 'homes', 'home', 'residential', 'properties', 'property',
    'group', 'company', 'development', 'developers', 'developer',
  ])

  return uniqueStrings([
    profile.businessName,
    domain,
    ...domainParts,
    ...brandParts,
    ...projects,
  ].map(term => String(term || '').trim())
    .filter(term => term.length >= 3)
    .filter(term => !genericBrandTokens.has(term.toLowerCase())), 80)
}

function containsForbiddenRealEstateTerm(prompt: string, forbiddenTerms: string[]): boolean {
  const lower = prompt.toLowerCase()
  return forbiddenTerms.some(term => lower.includes(term.toLowerCase()))
}

function hasRealEstatePurchaseIntent(prompt: string): boolean {
  const lower = prompt.toLowerCase()
  const purchaseTerms = [
    'לקנות', 'רכיש', 'קניית', 'קונה', 'רוכש', 'רוכשים',
    'buy', 'buying', 'purchase', 'purchasing', 'buyer', 'homebuyer',
  ]
  return purchaseTerms.some(term => lower.includes(term.toLowerCase()))
}

function validateRealEstatePromptCandidates(prompts: string[], profile: any, brandDomain: string, forbiddenTerms: string[]): string[] {
  return uniqueStrings(prompts.map(p => String(p || '').trim()).filter(Boolean), 80)
    .filter(prompt => !containsBrandReference(prompt, profile.businessName, brandDomain))
    .filter(prompt => !containsForbiddenRealEstateTerm(prompt, forbiddenTerms))
    .filter(prompt => countPromptWords(prompt) >= 6)
    .filter(prompt => countPromptWords(prompt) <= 40)
    .filter(hasRealEstatePurchaseIntent)
}

function countPromptWords(prompt: string): number {
  return prompt.trim().split(/\s+/).filter(Boolean).length
}

function validateRealEstateTierShape(prompts: string[], tierCounts: { t1: number; t2: number; t3: number }): boolean {
  const compactPrompts = prompts.slice(0, tierCounts.t1)
  const mediumPrompts = prompts.slice(tierCounts.t1, tierCounts.t1 + tierCounts.t2)
  const longPrompts = prompts.slice(tierCounts.t1 + tierCounts.t2)

  const compactOk = compactPrompts.every(prompt => {
    const words = countPromptWords(prompt)
    return words >= 6 && words <= 14
  })
  const mediumOk = mediumPrompts.every(prompt => {
    const words = countPromptWords(prompt)
    return words >= 15 && words <= 26
  })
  const longOk = longPrompts.every(prompt => {
    const words = countPromptWords(prompt)
    return words >= 27 && words <= 40
  })

  return compactOk && mediumOk && longOk
}

function realEstateLengthBandForPosition(position: number, tierCounts: { t1: number; t2: number; t3: number }) {
  if (position < tierCounts.t1) return 'compact, 6-14 words'
  if (position < tierCounts.t1 + tierCounts.t2) return 'medium, 15-26 words'
  return 'long, 27-40 words'
}

function realEstateTierShapeReport(prompts: string[], tierCounts: { t1: number; t2: number; t3: number }) {
  return {
    expected: tierCounts,
    words: prompts.map(countPromptWords),
  }
}

function realEstateIntentSlots(topicIndex: number): string[] {
  const slots = [
    ['city discovery', 'neighborhood comparison', 'local recommendation', 'commute/access evaluation', 'direct city-specific need', 'list request', 'family vs investor area fit', 'deep area research'],
    ['family discovery', 'schools/kindergartens evaluation', 'daily convenience', 'commute and parking', 'long-term family fit', 'safety/community', 'specific apartment-size need', 'recommendation'],
    ['investment discovery', 'rental yield evaluation', 'rental demand', 'future appreciation', 'risk/liquidity', 'transport/employment access', 'tax/cost awareness', 'city comparison'],
    ['price evaluation', 'payment terms', 'mortgage affordability', 'indexation risk', 'hidden costs', 'equity/monthly repayment', '20/80 or 10/90 comparison'],
    ['developer trust', 'construction quality', 'delivery track record', 'permit/bank guarantee', 'contract risk', 'technical specs', 'warning signs'],
    ['room count', 'garden/penthouse/balcony', 'mamad/parking/storage/elevator', 'layout/sunlight/air directions', 'lifestyle fit'],
    ['project comparison', 'developer comparison', 'new-build vs second-hand', 'same-city alternatives', 'city-vs-city comparison', 'family vs luxury/investment alternative'],
  ]
  return slots[topicIndex] || ['discovery', 'comparison', 'evaluation', 'recommendation']
}

async function repairRealEstatePromptsForTopic(
  topic: string,
  topicIndex: number,
  profile: any,
  cities: string[],
  detectedProjects: Array<{ project_name: string; city: string | null }>,
  classification: any,
  brandDomain: string,
  forbiddenTerms: string[],
  acceptedPrompts: string[],
  missingCount: number,
  tierCounts: { t1: number; t2: number; t3: number },
  attempt = 1
): Promise<string[]> {
  if (missingCount <= 0) return []

  const firstMissingPosition = acceptedPrompts.length
  const missingBands = Array.from({ length: missingCount }, (_, index) =>
    `${firstMissingPosition + index + 1}: ${realEstateLengthBandForPosition(firstMissingPosition + index, tierCounts)}`
  )

  const result = await gpt(
    `You are repairing missing Israeli residential real-estate prompts for one onboarding topic.

Generate EXACTLY ${missingCount} additional prompts for topic "${topic}".

Hard rules:
- Every prompt must be in ${profile.outputLanguage}.
- Every prompt must be about buying or purchasing a home/apartment. Make the purchase intent explicit.
- Every prompt must be 6-40 words.
- Match these missing slot length bands: ${missingBands.join('; ')}.
- Each prompt needs a real user situation plus a decision, recommendation, comparison, affordability, risk-check, or evaluation need.
- Never output bare keyword phrases.
- Never mention the brand, domain, sub-brand, or project names.
- Never repeat an accepted prompt or reuse the same opening phrasing.
- Use detected cities when natural, but do not invent cities/neighborhoods/competitors.
- Avoid rental-only phrasing. Investment prompts are allowed only if the user is buying an apartment for investment.

Forbidden terms: ${forbiddenTerms.join(', ')}

Output JSON only: { "prompts": ["prompt1", "..."] }`,
    `Context:\n${JSON.stringify({
      ...realEstatePromptContext(profile, cities, detectedProjects, classification),
      topic,
      topicIndex: topicIndex + 1,
      missingCount,
      missingBands,
      acceptedPrompts,
      forbiddenTerms,
    }, null, 2)}`,
    'gpt-4o'
  )

  const repaired = validateRealEstatePromptCandidates(Array.isArray(result.prompts) ? result.prompts : [], profile, brandDomain, forbiddenTerms)
    .filter(prompt => !acceptedPrompts.some(existing => existing.toLowerCase() === prompt.toLowerCase()))
    .slice(0, missingCount)

  if (repaired.length < missingCount && attempt < 2) {
    const more = await repairRealEstatePromptsForTopic(
      topic,
      topicIndex,
      profile,
      cities,
      detectedProjects,
      classification,
      brandDomain,
      forbiddenTerms,
      [...acceptedPrompts, ...repaired],
      missingCount - repaired.length,
      tierCounts,
      attempt + 1
    )
    return [...repaired, ...more]
  }

  return repaired
}

async function generateRealEstatePromptsForTopic(
  topic: string,
  topicIndex: number,
  profile: any,
  detectedCities: string[],
  detectedProjects: Array<{ project_name: string; city: string | null }>,
  classification: any,
  brandDomain: string,
  attempt = 1
): Promise<string[]> {
  const count = REAL_ESTATE_TOPIC_COUNTS[topicIndex]
  const strategy = REAL_ESTATE_TOPIC_STRATEGY[topicIndex]
  const tierCounts = computeTierCounts(profile, count)
  const { t1, t2, t3 } = tierCounts
  const cities = uniqueStrings([...detectedCities, ...detectedProjects.map(p => p.city).filter(Boolean)], 25)
  const projects = uniqueStrings(detectedProjects.map(p => p.project_name), 15)
  const minCityMentions = cities.length > 0 ? Math.ceil(count * 0.6) : 0
  const forbiddenTerms = realEstateForbiddenTerms(profile, brandDomain, projects)
  const intentSlots = realEstateIntentSlots(topicIndex)

  const result = await gpt(
    `You generate realistic ChatGPT/AI-assistant prompts for Israeli residential real estate brand visibility research.

Generate EXACTLY ${count} prompts for this one strategic topic:
Topic name: ${topic}
Topic strategy: ${strategy.purpose}

You must preserve the same control discipline as the general onboarding generator, but all content must be Israeli-real-estate-specific.

Non-negotiable rules:
- Every prompt must be in ${profile.outputLanguage}.
- Never mention the brand name or brand domain.
- Every prompt is written from the searcher's perspective, not from the brand's perspective.
- Every prompt must be about buying or purchasing a home/apartment. Make the purchase intent explicit in every prompt.
- Do not generate rental-only prompts, market-trend-only prompts, or general neighborhood research unless the user is deciding whether/where/how to buy.
- Do not invent city names, project names, neighborhoods, or competitors.
- Prefer city/neighborhood-based buyer behavior over generic country-level wording.
- If detected cities exist, at least ${minCityMentions} of these ${count} prompts must mention one of the detected cities or a directly supported area.
- Do not mention specific project names in this version. Users usually search by city, apartment need, financing, risk, lifestyle, or comparison context, not project names.
- If no cities are provided, use broader Israeli real estate phrasing supported by the profile/user region only.
- If no projects are provided, do not create project-name prompts.
- Separate family/residential intent from investor intent unless this topic is explicitly comparative.
- Opening diversity: each prompt must start differently. Do not repeat the same first 2-3 words.
- Intent coverage: across these ${count} prompts, cover these intent slots at least once where possible: ${intentSlots.join(', ')}.
- Constraint calibration: include realistic real-estate constraints where appropriate: budget, equity, mortgage, monthly payment, room count, school/commute need, delivery timeline, rental demand, permit status, parking, mamad, balcony, elevator, indexation, taxes, or hidden costs.
- Customer-goal grounding: every prompt must reflect a plausible buyer, family, investor, or apartment researcher goal.
- Context and intent are mandatory: every prompt must include a real user situation plus a decision, evaluation, recommendation, risk-check, or comparison need. Never output a bare keyword phrase or title.
- Every prompt must be 6-40 words.
- Forbidden terms: never include these exact brand/domain/project terms or close variants: ${forbiddenTerms.join(', ')}.

Length tiers and order:
- Output the prompts in this exact order:
  1. First ${t1} prompts: COMPACT Tier 1 prompts, 6-14 words. These are still full user intents, not keyword fragments.
  2. Next ${t2} prompts: MEDIUM Tier 2 prompts, 15-26 words, conversational, with at least one realistic purchase constraint.
  3. Last ${t3} prompts: LONG Tier 3 prompts, 27-40 words, analytical/comparative. They must evaluate purchase tradeoffs such as location, price, quality, risk, commute, family fit, investment purchase logic, or alternatives.
- Do not place all city prompts in one tier; spread detected cities across short, medium, and long prompts when cities exist.
- Long prompts must not be long filler. They should compare or evaluate concrete tradeoffs.

Israeli real estate terms to use when appropriate, especially in Hebrew:
דירות חדשות, דירה מקבלן, דירת 4 חדרים, דירת 5 חדרים, דירת גן, פנטהאוז, ממ״ד, חניה, מרפסת, מחסן, מעלית, תנאי תשלום, 20/80, 10/90, משכנתא, הצמדה למדד, מס רכישה, תשואה, שכירות, פינוי בינוי, התחדשות עירונית, רכבת, גני ילדים, בתי ספר.

Quality examples to match in intent and specificity, adapted only to detected data:
- איפה כדאי למשפחה עם ילדים לקנות דירה חדשה בנתניה?
- האם משתלם לקנות דירה להשקעה בנתניה בשנים הקרובות?
- מה חשוב לבדוק בתנאי תשלום של דירה חדשה מקבלן?
- איך בודקים אם יזם נדל״ן בישראל אמין?
- מה עדיף למשפחה צעירה: דירת גן או דירת 4 חדרים עם מרפסת?
- תעזור לי להשוות בין פרויקטים חדשים בנתניה.

Bad patterns to avoid:
- Bare keyword phrases like "new apartments in Netanya", "neighborhood comparison in Hod Hasharon", or "4-room apartment in Givat Shmuel".
- Generic country-only wording when detected cities exist.
- Repeating "מה חשוב לבדוק" or "אילו פרויקטים" across many prompts.
- Mixing family school needs with rental yield unless the prompt is explicitly comparing buyer profiles.
- Rental-only questions that do not include buying an apartment.
- Keyword-only SEO phrases that do not sound like AI-assistant questions.
- Mentioning a project name in most prompts.
- Mentioning the brand name, brand sub-brand, domain, or project names.
- Asking vague comparisons without a reason, such as "what is better, city A or city B?" without buyer profile, budget, apartment type, or decision context.

Before outputting, verify:
1. Exactly ${count} prompts.
2. Exactly ${t1}/${t2}/${t3} compact/medium/long tier order.
3. Every prompt is in ${profile.outputLanguage}.
4. No brand/domain/project-name mention.
5. No duplicate prompts.
6. Every prompt has 6-40 words, explicit home/apartment purchase intent, and a clear user intent.
7. City usage follows the limits above.

Output JSON only: { "prompts": ["prompt1", "..."] }`,
    `Real estate generation context:\n${JSON.stringify({
      ...realEstatePromptContext(profile, cities, detectedProjects, classification),
      topic,
      topicIndex: topicIndex + 1,
      expectedPromptCount: count,
      detectedCities: cities,
      detectedProjectNamesForExclusionOnly: projects,
      minPromptsMentioningDetectedCities: minCityMentions,
      forbiddenBrandDomainAndProjectTerms: forbiddenTerms,
      requiredTierCounts: { compact: t1, medium: t2, long: t3 },
      requiredIntentSlots: intentSlots,
      customerGoals: profile.customerGoals || [],
      typicalCustomer: profile.typicalCustomer || '',
    }, null, 2)}`,
    'gpt-4o'
  )

  try {
    let prompts = validateRealEstatePromptCandidates(Array.isArray(result.prompts) ? result.prompts : [], profile, brandDomain, forbiddenTerms)
      .slice(0, count)

    if (prompts.length < count) {
      const repaired = await repairRealEstatePromptsForTopic(
        topic,
        topicIndex,
        profile,
        cities,
        detectedProjects,
        classification,
        brandDomain,
        forbiddenTerms,
        prompts,
        count - prompts.length,
        tierCounts
      )
      prompts = [...prompts, ...repaired].slice(0, count)
    }

    if (prompts.length !== count) {
      throw new Error(`Real estate prompt generation returned ${prompts.length} valid prompts instead of ${count}`)
    }

    if (!validateRealEstateTierShape(prompts, tierCounts)) {
      console.warn('[generate-v2] RE prompt tier shape warning:', {
        topic,
        attempt,
        report: realEstateTierShapeReport(prompts, tierCounts),
      })
    }
    return prompts
  } catch (error) {
    if (attempt < 2) return generateRealEstatePromptsForTopic(topic, topicIndex, profile, detectedCities, detectedProjects, classification, brandDomain, attempt + 1)
    throw error
  }
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
        let reClassification: { confidence: string; reason: string; matchedBusinessKind: string | null } = { confidence: 'low', reason: '', matchedBusinessKind: null }

        // Auto-detect: Hebrew URL path (/he/) or significant Hebrew characters in content + real estate industry
        const hasHebrewUrlPath = /\/(he)(\/|$)/i.test(websiteUrl)
        const hebrewCharCount = (rawText.match(/[֐-׿]/g) || []).length
        const hasHebrewContent = hebrewCharCount > 30
        const profileText = `${profile.industry || ''} ${profile.description || ''} ${(profile.productsServices || []).join(' ')}`
        const isREIndustry = /real.?estate|property|properties|residential|housing|apartment|נדל.?ן|דיור|דירות|פרויקט/i.test(profileText)

        if ((hasHebrewUrlPath || hasHebrewContent) && isREIndustry) {
          isRealEstateIsrael = true
          reClassification = { confidence: 'high', reason: 'Auto-detected: Hebrew site with real estate industry profile', matchedBusinessKind: null }
        } else {
          try {
            const reClass = await classifyRealEstateIsrael(rawText, profile)
            isRealEstateIsrael = reClass.isRealEstate
            reClassification = { confidence: reClass.confidence, reason: reClass.reason, matchedBusinessKind: reClass.matchedBusinessKind }
          } catch (e: any) {
            console.error('[generate-v2] RE classification failed (non-blocking):', e.message)
          }
        }

        if (isRealEstateIsrael) {
          const subpageText = await tavilyMapAndExtract(websiteUrl).catch(() => '')
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
            ? await generateRealEstateTopics(profile, reProjectData.cities, reProjectData.projects, reClassification)
            : await generateTopics(profile)
          if (isRealEstateIsrael && topics.length !== 7) throw new Error('Real estate topic generation must return exactly 7 topics')
          if (!isRealEstateIsrael && (!Array.isArray(topics) || topics.length < 3)) throw new Error('Not enough topics generated')
        } catch (e: any) {
          send({ type: 'error', data: { message: `Failed to generate search topics: ${e.message}` } })
          controller.close(); return
        }
        send({ type: 'topics', data: topics })

        // ── Layer 3: Prompts per topic (parallel GPT, sequential DB write) ───────
        // RE brands: 7 topics × [9,8,8,7,7,5,6] prompts = 50 total
        // General brands: 5 topics × 10 prompts = 50 total
        // Clear any prompts from previous scan attempts before streaming new ones
        await adminSupabase.from('brand_prompts').delete().eq('brand_id', brandId)

        // Run all GPT calls in parallel for speed, collect results
        const topicResults: { topic: string; prompts: string[] }[] = await Promise.all(
          topics.map(async (topic, topicIndex) => {
            let prompts: string[]
            try {
              if (isRealEstateIsrael) {
                prompts = await generateRealEstatePromptsForTopic(topic, topicIndex, profile, reProjectData.cities, reProjectData.projects, reClassification, websiteUrl)
              } else {
                const count = 10
                const topicTierCounts = computeTierCounts(profile, count)
                prompts = await generatePromptsForTopic(topic, profile, topicTierCounts, 1, count)
              }
            }
            catch (error: any) {
              console.error('[generate-v2] prompt generation failed for topic:', {
                topic,
                topicIndex,
                isRealEstateIsrael,
                message: error?.message || String(error),
              })
              prompts = []
            }
            send({ type: 'prompts_topic', data: { topic, prompts } })
            return { topic, prompts }
          })
        )

        if (isRealEstateIsrael) {
          const generatedTotalPrompts = topicResults.reduce((sum, row) => sum + row.prompts.length, 0)
          const hasExpectedDistribution = topicResults.every((row, index) => row.prompts.length === REAL_ESTATE_TOPIC_COUNTS[index])
          const uniquePromptCount = new Set(topicResults.flatMap(row => row.prompts).map(prompt => prompt.trim().toLowerCase())).size
          if (generatedTotalPrompts !== 50 || !hasExpectedDistribution || uniquePromptCount !== 50) {
            console.error('[generate-v2] RE prompt distribution invalid:', {
              generatedTotalPrompts,
              uniquePromptCount,
              expectedCounts: REAL_ESTATE_TOPIC_COUNTS,
              actualCounts: topicResults.map(row => ({ topic: row.topic, count: row.prompts.length })),
            })
            send({ type: 'error', data: { message: `Generated ${generatedTotalPrompts} real estate prompts instead of the required 50. Please try scanning again.` } })
            controller.close(); return
          }
        }

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
