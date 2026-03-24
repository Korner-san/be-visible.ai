import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import OpenAI from 'openai'

interface AnalyzeWebsiteRequest {
  url: string
}

interface OnboardingFormData {
  brandName: string
  industry: string
  productCategory: string
  problemSolved: string
  tasksHelped: string[]
  goalFacilitated: string
  keyFeatures: string[]
  useCases: string[]
  competitors: string[]
  competitorDomains: string[]
  uniqueSellingProps: string[]
  businessSummary: string
  businessLabel: string
  marketScope: string
  marketCountry: string | null
}

interface AnalyzeWebsiteResponse {
  success: boolean
  brandData?: OnboardingFormData
  error?: string
}

// Normalize URL function
const normalizeUrl = (url: string): string => {
  if (!url) return ''
  url = url.trim().replace(/^@+/, '')
  url = url.replace(/\/+$/, '')
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url
  }
  return url
}

// Extract domain from URL for fallbacks
const extractDomain = (url: string): string => {
  try {
    const urlObj = new URL(url)
    return urlObj.hostname.replace('www.', '')
  } catch {
    return ''
  }
}

// Fetch website content
const fetchWebsiteContent = async (url: string): Promise<string> => {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BeVisible.ai Bot)'
      },
      timeout: 10000
    })

    if (!response.ok) {
      if (response.status === 403 || response.status === 400 || response.status === 429) {
        throw new Error('BLOCKED_ACCESS')
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const html = await response.text()

    const textContent = html
      .replace(/<script[^>]*>.*?<\/script>/gis, '')
      .replace(/<style[^>]*>.*?<\/style>/gis, '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 8000)

    return textContent
  } catch (error) {
    if (error instanceof Error && error.message === 'BLOCKED_ACCESS') {
      throw new Error('BLOCKED_ACCESS')
    }
    if (error instanceof Error && (
      error.message.includes('timeout') ||
      error.message.includes('ECONNREFUSED') ||
      error.message.includes('ENOTFOUND')
    )) {
      throw new Error('BLOCKED_ACCESS')
    }
    throw new Error(`Failed to fetch website: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

// Find competitors using Perplexity's live web search
const findCompetitorsWithPerplexity = async (
  businessSummary: string,
  marketScope: string,
  marketCountry: string | null,
  brandName: string,
  businessLabel: string,
  industry: string
): Promise<{ competitors: { name: string; domain: string }[]; debug: any }> => {
  const perplexityDebug: any = {
    apiKeyPresent: !!process.env.PERPLEXITY_API_KEY,
    query: null,
    httpStatus: null,
    rawResponse: null,
    jsonExtracted: null,
    parsedArray: null,
    finalResult: null,
    error: null
  }

  if (!process.env.PERPLEXITY_API_KEY) {
    perplexityDebug.error = 'PERPLEXITY_API_KEY not set — skipped'
    return { competitors: [], debug: perplexityDebug }
  }

  const isLocal = marketScope === 'local' && marketCountry
  const marketContext = isLocal ? `in ${marketCountry}` : 'globally'

  const query = `Find the top 6 real competitor companies for this business:

Business name: ${brandName}
Industry: ${industry}
What they do: ${businessLabel}
Description: ${businessSummary}
Market: ${marketContext}

Search for specific named companies that compete directly with ${brandName} ${marketContext}.

STRICT RULES:
- Return ONLY real, individually named companies — each must be a specific business entity (e.g. "Grey Israel", "McCann Tel Aviv", "Leo Burnett Israel")
- Do NOT return category names, industry types, or generic descriptions like "advertising agencies" or "marketing companies" — these are invalid
- Include the website domain for each company if available

Return ONLY a JSON array of objects, no other text:
[
  {"name": "Grey Israel", "domain": "grey.com"},
  {"name": "McCann Tel Aviv", "domain": "mccann.co.il"},
  {"name": "Leo Burnett Israel", "domain": "leoburnett.com"}
]`

  perplexityDebug.query = query

  try {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.1-sonar-large-128k-online',
        messages: [
          {
            role: 'system',
            content: 'You are a competitive intelligence tool. Find real, named competitor companies for businesses. Always return only specific company names with their domains — never industry categories or generic descriptions. Respond in JSON format only.'
          },
          { role: 'user', content: query }
        ],
        temperature: 0.2,
        max_tokens: 800
      })
    })

    perplexityDebug.httpStatus = response.status

    if (!response.ok) {
      const errText = await response.text()
      perplexityDebug.error = `HTTP ${response.status}: ${errText}`
      return { competitors: [], debug: perplexityDebug }
    }

    const result = await response.json()
    const content = result.choices?.[0]?.message?.content?.trim()
    perplexityDebug.rawResponse = content || null

    if (!content) {
      perplexityDebug.error = 'Empty content from Perplexity'
      return { competitors: [], debug: perplexityDebug }
    }

    const jsonMatch = content.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      perplexityDebug.error = 'No JSON array found in response'
      return { competitors: [], debug: perplexityDebug }
    }

    perplexityDebug.jsonExtracted = jsonMatch[0]

    const parsed = JSON.parse(jsonMatch[0])
    perplexityDebug.parsedArray = parsed

    if (!Array.isArray(parsed)) {
      perplexityDebug.error = 'Parsed value is not an array'
      return { competitors: [], debug: perplexityDebug }
    }

    const filtered = parsed
      .filter((c: any) => c && typeof c.name === 'string' && c.name.trim())
      .slice(0, 6)
      .map((c: any) => ({
        name: c.name.trim(),
        domain: (typeof c.domain === 'string' ? c.domain.trim().replace(/^https?:\/\//, '').replace(/\/$/, '') : '')
      }))

    perplexityDebug.finalResult = filtered
    return { competitors: filtered, debug: perplexityDebug }
  } catch (err) {
    perplexityDebug.error = err instanceof Error ? err.message : String(err)
    return { competitors: [], debug: perplexityDebug }
  }
}

export async function POST(request: NextRequest) {
  try {
    const { url }: AnalyzeWebsiteRequest = await request.json()

    if (!url) {
      return NextResponse.json({ success: false, error: 'URL is required' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const normalizedUrl = normalizeUrl(url)
    const domain = extractDomain(normalizedUrl)

    const _debug: any = {
      timestamp: new Date().toISOString(),
      url: normalizedUrl,
      domain,
      step1_websiteFetch: null,
      step2_gptExtraction: null,
      step3_computed: null,
      step4_perplexity: null,
      step5_finalAnswers: null
    }

    // Check for duplicate brand
    const { data: existingBrands } = await supabase
      .from('brands')
      .select('id, domain')
      .eq('owner_user_id', user.id)
      .eq('is_demo', false)
      .neq('domain', null)

    if (existingBrands) {
      const duplicateBrand = existingBrands.find(brand => {
        if (!brand.domain) return false
        const existingDomain = brand.domain.replace(/^https?:\/\//, '').replace(/^www\./, '')
        const newDomain = domain.replace(/^www\./, '')
        return existingDomain === newDomain
      })

      if (duplicateBrand) {
        return NextResponse.json({
          success: false,
          error: `A brand with domain "${domain}" already exists. Please use a different website or manage your existing brand.`
        }, { status: 409 })
      }
    }

    // Fetch website content
    let content: string
    try {
      content = await fetchWebsiteContent(normalizedUrl)
      _debug.step1_websiteFetch = { success: true, contentLength: content.length, contentPreview: content.substring(0, 300) }
    } catch (error) {
      _debug.step1_websiteFetch = { success: false, error: error instanceof Error ? error.message : String(error) }
      if (error instanceof Error && error.message === 'BLOCKED_ACCESS') {
        return NextResponse.json({
          success: false,
          error: "We can't scan this website because it doesn't allow automated access. Please answer the questions manually."
        }, { status: 403 })
      }
      return NextResponse.json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch website content'
      }, { status: 500 })
    }

    if (!process.env.OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY missing from environment variables')
      return NextResponse.json({ success: false, error: 'AI analysis service not configured' }, { status: 500 })
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

    // Extract TLD for market hint
    const tld = domain.split('.').pop()?.toLowerCase() || ''
    const tldCountryHints: Record<string, string> = {
      il: 'Israel', de: 'Germany', fr: 'France', uk: 'United Kingdom',
      au: 'Australia', ca: 'Canada', es: 'Spain', it: 'Italy',
      nl: 'Netherlands', br: 'Brazil', mx: 'Mexico', in: 'India',
    }
    const tldCountryHint = tldCountryHints[tld] || null

    const extractionPrompt = `
Analyze the following website content and extract brand information. Read carefully and infer everything you can from the full text.

Website URL: ${normalizedUrl}
Website Content: ${content}
${tldCountryHint ? `TLD country hint: ${tldCountryHint}` : ''}

Respond ONLY with a valid JSON object in exactly this format:

{
  "businessSummary": "A 2-3 sentence paragraph synthesizing who this company is, what they actually do (even if their branding is vague — infer the real activity), what problem they solve, and where they operate (local market or global). This should be clear enough that someone reading it immediately understands the type of business.",
  "businessLabel": "A concise categorical label that accurately describes what type of business this is, even if the website uses vague branding. Examples: 'build acceleration software for enterprise C++ development teams', 'plastic manufacturing factory serving the German industrial market', 'B2B SaaS HR platform for Israeli mid-size companies'. Be specific and accurate.",
  "marketScope": "local or global — local if the business primarily serves one country, global if it serves multiple countries or has no geographic restriction",
  "marketCountry": "country name if marketScope is local (e.g. 'Israel', 'Germany'), null if global",
  "brandName": "exact brand name found on the website",
  "industry": "the industry/sector this brand operates in",
  "problemSolved": "what main problem does this brand solve for customers",
  "actionsHelped": ["action 1", "action 2", "action 3", "action 4", "action 5"],
  "goalFacilitated": "what main goal does this brand help users achieve",
  "keyFeatures": ["feature 1", "feature 2", "feature 3", "feature 4"],
  "useCases": ["use case 1", "use case 2", "use case 3", "use case 4"],
  "productCategory": "what product or service category this brand belongs to",
  "uniqueSellingProps": ["unique point 1", "unique point 2", "unique point 3", "unique point 4"]
}

Guidelines:
1. For businessLabel: cut through marketing language. A company calling itself a 'material innovation solutions provider' that makes plastic parts is a 'plastic parts manufacturer'. Be direct.
2. For marketScope: use the TLD hint, website language, and content mentions of geography to determine this.
3. For actionsHelped: list the main actions/tasks users can accomplish using this product.
4. For arrays, provide relevant items (at least 2, up to the specified count).
5. Make sure all strings are properly escaped for JSON.

Respond ONLY with the JSON object, no additional text.
`

    let gptResult: any
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are a brand analysis expert. Analyze website content and extract key brand information in JSON format. Cut through vague marketing language to identify what the business actually is and does. Always respond with valid JSON only."
          },
          { role: "user", content: extractionPrompt }
        ],
        temperature: 0.3,
      })

      const responseContent = completion.choices[0]?.message?.content
      if (!responseContent) throw new Error('No response from OpenAI')

      _debug.step2_gptExtraction = {
        model: 'gpt-4o-mini',
        finishReason: completion.choices[0]?.finish_reason,
        completionTokens: completion.usage?.completion_tokens,
        rawResponse: responseContent
      }

      const cleanedResponse = responseContent.trim()
      const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('No JSON found in response')

      gptResult = JSON.parse(jsonMatch[0])

      _debug.step2_gptExtraction.parsedFields = {
        brandName: gptResult.brandName,
        businessSummary: gptResult.businessSummary,
        businessLabel: gptResult.businessLabel,
        marketScope: gptResult.marketScope,
        marketCountry: gptResult.marketCountry,
        industry: gptResult.industry,
        problemSolved: gptResult.problemSolved
      }
    } catch (parseError) {
      _debug.step2_gptExtraction = { error: parseError instanceof Error ? parseError.message : String(parseError) }
      throw new Error('Failed to parse AI response as JSON')
    }

    // Run Perplexity competitor search in parallel with validation
    const businessSummary = (typeof gptResult.businessSummary === 'string' && gptResult.businessSummary.trim())
      ? gptResult.businessSummary.trim()
      : `${gptResult.brandName || domain} is a company that ${gptResult.problemSolved || 'provides solutions'}.`

    const businessLabel = (typeof gptResult.businessLabel === 'string' && gptResult.businessLabel.trim())
      ? gptResult.businessLabel.trim()
      : gptResult.productCategory || 'business solutions provider'

    const marketScope = gptResult.marketScope === 'local' ? 'local' : 'global'
    const marketCountry = marketScope === 'local' && typeof gptResult.marketCountry === 'string'
      ? gptResult.marketCountry
      : (tldCountryHint && marketScope === 'local' ? tldCountryHint : null)

    _debug.step3_computed = {
      businessSummary,
      businessSummarySource: (typeof gptResult.businessSummary === 'string' && gptResult.businessSummary.trim()) ? 'gpt' : 'fallback',
      businessLabel,
      marketScope,
      marketCountry,
      brandNameForPerplexity: gptResult.brandName || domain,
      industryForPerplexity: gptResult.industry || ''
    }

    // Search for real competitors via Perplexity
    const { competitors: perplexityCompetitors, debug: perplexityDebug } = await findCompetitorsWithPerplexity(
      businessSummary,
      marketScope,
      marketCountry,
      gptResult.brandName || domain,
      businessLabel,
      gptResult.industry || ''
    )
    _debug.step4_perplexity = perplexityDebug

    // Validate and build final brand data
    const ensureArray = (arr: any, count: number, fallback: string[]): string[] => {
      if (Array.isArray(arr) && arr.length >= 2) {
        return arr.filter((item: any) => item && typeof item === 'string' && item.trim()).slice(0, count)
      }
      return fallback
    }

    const companyName = gptResult.brandName || domain.split('.')[0] || 'Your Company'

    const validatedBrandData: OnboardingFormData = {
      brandName: typeof gptResult.brandName === 'string' && gptResult.brandName.trim()
        ? gptResult.brandName.trim()
        : companyName,
      industry: typeof gptResult.industry === 'string' && gptResult.industry.trim()
        ? gptResult.industry.trim()
        : 'Technology',
      productCategory: typeof gptResult.productCategory === 'string' && gptResult.productCategory.trim()
        ? gptResult.productCategory.trim()
        : 'Business solutions',
      problemSolved: typeof gptResult.problemSolved === 'string' && gptResult.problemSolved.trim()
        ? gptResult.problemSolved.trim()
        : `Helping customers achieve their goals through ${companyName}`,
      tasksHelped: ensureArray(gptResult.actionsHelped, 5, [
        'Streamlining workflows', 'Improving efficiency', 'Managing processes', 'Optimizing operations', 'Supporting growth'
      ]),
      goalFacilitated: typeof gptResult.goalFacilitated === 'string' && gptResult.goalFacilitated.trim()
        ? gptResult.goalFacilitated.trim()
        : 'Achieve better business outcomes',
      keyFeatures: ensureArray(gptResult.keyFeatures, 4, [
        'User-friendly interface', 'Reliable performance', 'Expert support', 'Scalable solutions'
      ]),
      useCases: ensureArray(gptResult.useCases, 4, [
        'Small to medium businesses', 'Enterprise organizations', 'Professional teams', 'Individual users'
      ]),
      // Perplexity is the only source for competitors — no GPT fallback
      competitors: perplexityCompetitors.map(c => c.name),
      competitorDomains: perplexityCompetitors.map(c => c.domain),
      uniqueSellingProps: ensureArray(gptResult.uniqueSellingProps, 4, [
        'Faster implementation', 'Better support', 'More affordable', 'Industry-specific features'
      ]),
      businessSummary,
      businessLabel,
      marketScope,
      marketCountry,
    }

    // Save to pending brand
    const { data: pendingBrands, error: brandError } = await supabase
      .from('brands')
      .select('id, onboarding_answers')
      .eq('owner_user_id', user.id)
      .eq('is_demo', false)
      .eq('onboarding_completed', false)
      .order('created_at', { ascending: false })
      .limit(1)

    if (brandError) {
      console.error('Error finding pending brand:', brandError)
      return NextResponse.json({ success: false, error: 'Database error while finding brand' }, { status: 500 })
    }

    if (!pendingBrands || pendingBrands.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No pending brand found. Please start the onboarding process first.'
      }, { status: 404 })
    }

    const brandId = pendingBrands[0].id
    const existingAnswers = pendingBrands[0].onboarding_answers || {}

    _debug.step5_finalAnswers = {
      competitors: validatedBrandData.competitors,
      competitorDomains: validatedBrandData.competitorDomains,
      businessSummary: validatedBrandData.businessSummary,
      businessLabel: validatedBrandData.businessLabel,
      marketScope: validatedBrandData.marketScope,
      marketCountry: validatedBrandData.marketCountry
    }

    const mergedAnswers = {
      ...existingAnswers,
      ...validatedBrandData,
      websiteUrl: normalizedUrl,
      _debug
    }

    const { error: updateError } = await supabase
      .from('brands')
      .update({
        onboarding_answers: mergedAnswers,
        domain: normalizedUrl,
        name: validatedBrandData.brandName
      })
      .eq('id', brandId)

    if (updateError) {
      console.error('Error updating brand with analyzed data:', updateError)
      return NextResponse.json({ success: false, error: 'Failed to save analyzed data' }, { status: 500 })
    }

    if (process.env.NODE_ENV === 'development') {
      console.log('✅ Website analysis completed:', validatedBrandData.brandName, '|', businessLabel, '|', marketScope, marketCountry)
    }

    return NextResponse.json({ success: true, brandData: validatedBrandData })

  } catch (error) {
    console.error('Error in website analysis:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    }, { status: 500 })
  }
}
