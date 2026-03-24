import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

interface AnalyzeWebsiteRequest {
  url: string
  language?: string
  timezone?: string
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
  uniqueSellingProps: string[]
  businessSummary: string
  businessLabel: string
  marketScope: string
  marketCountry: string | null
}

interface Competitor {
  name: string
  domain: string
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
      // @ts-ignore
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

// Phase B — Perplexity competitor search
const fetchPerplexityCompetitors = async (
  businessSummary: string,
  marketScope: string,
  marketCountry: string | null
): Promise<Competitor[]> => {
  const perplexityApiKey = process.env.PERPLEXITY_API_KEY
  if (!perplexityApiKey) {
    console.error('[analyze-website] PERPLEXITY_API_KEY not set')
    return []
  }

  const isLocal = marketScope === 'local' && marketCountry

  const userPrompt = isLocal
    ? `Here is a description of the company I need competitors for:\n\n${businessSummary}\n\nFind the top competitors of this business that operate in ${marketCountry}.\nList only companies with real presence or meaningful focus in the ${marketCountry} market.\nDo not include generic category names — only real company names.\nReturn ONLY a valid JSON array of up to 6 objects with "name" and "domain" fields, nothing else.\nExample format: [{"name": "Company A", "domain": "companya.com"}, {"name": "Company B", "domain": "companyb.com"}]`
    : `Here is a description of the company I need competitors for:\n\n${businessSummary}\n\nFind the top global competitors in this space.\nList the leading companies worldwide that compete directly with this type of business.\nDo not include generic category names — only real company names.\nReturn ONLY a valid JSON array of up to 6 objects with "name" and "domain" fields, nothing else.\nExample format: [{"name": "Company A", "domain": "companya.com"}, {"name": "Company B", "domain": "companyb.com"}]`

  try {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${perplexityApiKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.1-sonar-large-128k-online',
        messages: [
          {
            role: 'system',
            content: 'You are a market research expert. Return only valid JSON arrays as instructed, no additional text or explanation.'
          },
          {
            role: 'user',
            content: userPrompt
          }
        ],
        temperature: 0.2,
        max_tokens: 600
      })
    })

    if (!response.ok) {
      console.error('[analyze-website] Perplexity API error:', response.status)
      return []
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content?.trim()
    if (!content) return []

    const jsonMatch = content.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return []

    const parsed = JSON.parse(jsonMatch[0])
    if (!Array.isArray(parsed)) return []

    const competitors: Competitor[] = parsed
      .filter((item: any) => item && typeof item === 'object' && item.name)
      .map((item: any) => ({
        name: String(item.name).trim(),
        domain: String(item.domain || '')
          .trim()
          .replace(/^https?:\/\//, '')
          .replace(/^www\./, '')
          .replace(/\/$/, '')
      }))
      .slice(0, 6)

    console.log(`[analyze-website] Perplexity returned ${competitors.length} competitors`)
    return competitors
  } catch (err) {
    console.error('[analyze-website] Perplexity call failed:', err)
    return []
  }
}

export async function POST(request: NextRequest) {
  try {
    const { url, language = 'English', timezone = 'UTC' }: AnalyzeWebsiteRequest = await request.json()

    if (!url) {
      return NextResponse.json({ success: false, error: 'URL is required' }, { status: 400 })
    }

    // Auth check
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const normalizedUrl = normalizeUrl(url)
    const domain = extractDomain(normalizedUrl)

    // Duplicate domain check
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
          error: `A brand with domain "${domain}" already exists.`
        }, { status: 409 })
      }
    }

    // Fetch website content
    let content: string
    try {
      content = await fetchWebsiteContent(normalizedUrl)
    } catch (error) {
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
      return NextResponse.json({ success: false, error: 'AI analysis service not configured' }, { status: 500 })
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

    // Phase A — GPT-4o-mini extraction prompt
    const gptPrompt = `The following website belongs to a business. The user who submitted it selected these regional settings:
- Language: ${language}
- Timezone: ${timezone}

Use these as strong hints about where this business operates and who it serves.

Website URL: ${normalizedUrl}
Website Content: ${content}

Analyze the content and return ONLY a valid JSON object in this exact format:

{
  "brandName": "exact brand name found on the website",
  "industry": "the industry/sector this brand operates in",
  "productCategory": "short product or service category e.g. Marketing agency, SaaS platform, Plastic manufacturer",
  "problemSolved": "what main problem does this brand solve for customers",
  "tasksHelped": ["task 1", "task 2", "task 3", "task 4", "task 5"],
  "goalFacilitated": "what main goal does this brand help users achieve",
  "keyFeatures": ["feature 1", "feature 2", "feature 3", "feature 4"],
  "useCases": ["use case 1", "use case 2", "use case 3", "use case 4"],
  "uniqueSellingProps": ["unique point 1", "unique point 2", "unique point 3", "unique point 4"],
  "businessSummary": "2-3 sentence paragraph: who this company is, exactly what they do, what problem they solve, and where they operate — inferred from website content, domain, language, and timezone",
  "businessLabel": "a short 2-5 word categorical label for what this business is, ignoring their branding — e.g. Marketing agency, Plastic parts manufacturer, B2B HR SaaS, Automotive build tools",
  "marketScope": "local or global",
  "marketCountry": "the country name in English where this business primarily operates if local, or null if global"
}

Guidelines:
1. Base all answers strictly on what you can infer from the website content and regional signals
2. For arrays provide at least 2 items
3. businessLabel must be short and categorical — strip all marketing language, 2-5 words maximum
4. businessSummary must be 2-3 sentences covering who they are, what they do, the problem they solve, and where they operate
5. marketScope is "local" if the business clearly targets one country, "global" otherwise
6. marketCountry must be in English regardless of the website language
7. Do NOT include a competitors field
8. Respond ONLY with the JSON object, no additional text`

    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a brand analysis expert. You analyze website content and extract key brand information in JSON format. Always respond with valid JSON only.'
          },
          {
            role: 'user',
            content: gptPrompt
          }
        ],
        temperature: 0.3,
        max_tokens: 1500,
      })

      const responseContent = completion.choices[0]?.message?.content
      if (!responseContent) throw new Error('No response from OpenAI')

      // Parse GPT response
      let rawBrandData: any
      try {
        const cleanedResponse = responseContent.trim()
        const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/)
        if (!jsonMatch) throw new Error('No JSON found in response')
        rawBrandData = JSON.parse(jsonMatch[0])
      } catch (parseError) {
        console.error('Error parsing OpenAI response:', parseError)
        throw new Error('Failed to parse AI response as JSON')
      }

      // Validate GPT output
      const ensureMinItems = (arr: any, minCount: number, fallbackItems: string[]): string[] => {
        if (Array.isArray(arr) && arr.length >= minCount) {
          return arr.filter((item: any) => item && typeof item === 'string' && item.trim()).slice(0, fallbackItems.length)
        }
        return fallbackItems
      }

      const companyName = rawBrandData.brandName || domain.split('.')[0] || 'Your Company'

      const validatedBrandData: OnboardingFormData = {
        brandName: typeof rawBrandData.brandName === 'string' && rawBrandData.brandName.trim()
          ? rawBrandData.brandName.trim() : companyName,
        industry: typeof rawBrandData.industry === 'string' && rawBrandData.industry.trim()
          ? rawBrandData.industry.trim() : 'Technology',
        productCategory: typeof rawBrandData.productCategory === 'string' && rawBrandData.productCategory.trim()
          ? rawBrandData.productCategory.trim() : 'Business solutions',
        problemSolved: typeof rawBrandData.problemSolved === 'string' && rawBrandData.problemSolved.trim()
          ? rawBrandData.problemSolved.trim() : `Helping customers achieve their goals through ${companyName}`,
        tasksHelped: ensureMinItems(rawBrandData.tasksHelped, 2, [
          'Streamlining workflows', 'Improving efficiency', 'Managing processes', 'Optimizing operations', 'Supporting growth'
        ]),
        goalFacilitated: typeof rawBrandData.goalFacilitated === 'string' && rawBrandData.goalFacilitated.trim()
          ? rawBrandData.goalFacilitated.trim() : 'Achieve better business outcomes',
        keyFeatures: ensureMinItems(rawBrandData.keyFeatures, 2, [
          'User-friendly interface', 'Reliable performance', 'Expert support', 'Scalable solutions'
        ]),
        useCases: ensureMinItems(rawBrandData.useCases, 2, [
          'Small to medium businesses', 'Enterprise organizations', 'Professional teams', 'Individual users'
        ]),
        uniqueSellingProps: ensureMinItems(rawBrandData.uniqueSellingProps, 2, [
          'Faster implementation', 'Better support', 'More affordable', 'Industry-specific features'
        ]),
        businessSummary: typeof rawBrandData.businessSummary === 'string' && rawBrandData.businessSummary.trim()
          ? rawBrandData.businessSummary.trim() : '',
        businessLabel: typeof rawBrandData.businessLabel === 'string' && rawBrandData.businessLabel.trim()
          ? rawBrandData.businessLabel.trim() : '',
        marketScope: rawBrandData.marketScope === 'local' ? 'local' : 'global',
        marketCountry: typeof rawBrandData.marketCountry === 'string' && rawBrandData.marketCountry.trim()
          ? rawBrandData.marketCountry.trim() : null,
      }

      console.log(`[analyze-website] Phase A complete — businessLabel: "${validatedBrandData.businessLabel}", marketScope: ${validatedBrandData.marketScope}, marketCountry: ${validatedBrandData.marketCountry}`)

      // Phase B — Perplexity competitor search (sequential, same request)
      const competitors: Competitor[] = validatedBrandData.businessSummary
        ? await fetchPerplexityCompetitors(
            validatedBrandData.businessSummary,
            validatedBrandData.marketScope,
            validatedBrandData.marketCountry
          )
        : []

      console.log(`[analyze-website] Phase B complete — ${competitors.length} competitors found`)

      // Find pending brand
      const { data: pendingBrands, error: brandError } = await supabase
        .from('brands')
        .select('id, onboarding_answers')
        .eq('owner_user_id', user.id)
        .eq('is_demo', false)
        .eq('onboarding_completed', false)
        .order('created_at', { ascending: false })
        .limit(1)

      if (brandError || !pendingBrands || pendingBrands.length === 0) {
        return NextResponse.json({
          success: false,
          error: 'No pending brand found. Please start the onboarding process first.'
        }, { status: 404 })
      }

      const brandId = pendingBrands[0].id
      const existingAnswers = pendingBrands[0].onboarding_answers || {}

      // Merge everything — competitors come from Perplexity only
      const mergedAnswers = {
        ...existingAnswers,
        ...validatedBrandData,
        competitors,
        websiteUrl: normalizedUrl
      }

      // Save via admin client to bypass RLS
      const adminSupabase = createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )

      const { error: updateError } = await adminSupabase
        .from('brands')
        .update({
          onboarding_answers: mergedAnswers,
          domain: normalizedUrl,
          name: validatedBrandData.brandName
        })
        .eq('id', brandId)

      if (updateError) {
        console.error('Error updating brand:', updateError)
        return NextResponse.json({ success: false, error: 'Failed to save analyzed data' }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        v: '2.1',
        brandData: { ...validatedBrandData, competitors }
      })

    } catch (error) {
      console.error('Error in OpenAI analysis:', error)
      return NextResponse.json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to analyze website content'
      }, { status: 500 })
    }

  } catch (error) {
    console.error('Error in website analysis:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    }, { status: 500 })
  }
}
