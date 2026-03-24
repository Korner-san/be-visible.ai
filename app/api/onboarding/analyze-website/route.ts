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
  uniqueSellingProps: string[]
}

interface AnalyzeWebsiteResponse {
  success: boolean
  brandData?: OnboardingFormData
  error?: string
}

// Normalize URL function
const normalizeUrl = (url: string): string => {
  if (!url) return ''
  
  // Remove whitespace and any @ symbols at the beginning
  url = url.trim().replace(/^@+/, '')
  
  // Remove trailing slashes
  url = url.replace(/\/+$/, '')
  
  // Add protocol if missing
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
      // Check for common blocking scenarios
      if (response.status === 403) {
        throw new Error('BLOCKED_ACCESS')
      }
      if (response.status === 400) {
        throw new Error('BLOCKED_ACCESS')
      }
      if (response.status === 429) {
        throw new Error('BLOCKED_ACCESS')
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    
    const html = await response.text()
    
    // Extract text content from HTML (simple approach)
    const textContent = html
      .replace(/<script[^>]*>.*?<\/script>/gis, '')
      .replace(/<style[^>]*>.*?<\/style>/gis, '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 8000) // Limit content size for OpenAI
    
    return textContent
  } catch (error) {
    if (error instanceof Error && error.message === 'BLOCKED_ACCESS') {
      throw new Error('BLOCKED_ACCESS')
    }
    // Check for network/timeout errors that might indicate blocking
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

export async function POST(request: NextRequest) {
  try {
    const { url }: AnalyzeWebsiteRequest = await request.json()
    
    if (!url) {
      return NextResponse.json({ 
        success: false, 
        error: 'URL is required' 
      }, { status: 400 })
    }

    // Get user from server-side auth
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({
        success: false,
        error: 'Unauthorized'
      }, { status: 401 })
    }

    const normalizedUrl = normalizeUrl(url)
    const domain = extractDomain(normalizedUrl)
    
    if (process.env.NODE_ENV === 'development') {
      console.log('🔍 Analyzing website:', normalizedUrl)
    }

    // Optional: Check for duplicate brand (skip if same domain already processed)
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
    } catch (error) {
      // Check if website blocks access
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

    // Initialize OpenAI client
    if (!process.env.OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY missing from environment variables')
      return NextResponse.json({
        success: false,
        error: 'AI analysis service not configured'
      }, { status: 500 })
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })

    // Use the exact prompt from LLMSEO-master
    const prompt = `
Analyze the following website content and extract brand information to answer these specific questions. 
For multiple-choice fields, provide at least 2 relevant items per field.

Website URL: ${normalizedUrl}
Website Content: ${content}

Please provide the information in the following JSON format exactly:

{
  "brandName": "exact brand name found on the website",
  "industry": "the industry/sector this brand operates in",
  "problemSolved": "what main problem does this brand solve for customers",
  "tasksHelped": ["task 1", "task 2", "task 3", "task 4", "task 5"],
  "goalFacilitated": "what main goal does this brand help users achieve",
  "keyFeatures": ["feature 1", "feature 2", "feature 3", "feature 4"],
  "useCases": ["use case 1", "use case 2", "use case 3", "use case 4"],
  "competitors": ["competitor 1", "competitor 2", "competitor 3", "competitor 4"],
  "productCategory": "what product or service category this brand belongs to",
  "uniqueSellingProps": ["unique point 1", "unique point 2", "unique point 3", "unique point 4"]
}

Guidelines:
1. Base all answers strictly on what you can infer from the website content
2. For arrays, provide relevant items (at least 2, up to the specified count)
3. If you can't find specific information, make reasonable inferences based on the content
4. Keep answers concise but descriptive
5. Use proper capitalization and formatting
6. Make sure all strings are properly escaped for JSON

Respond ONLY with the JSON object, no additional text or explanation.
`

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are a brand analysis expert. You analyze website content and extract key brand information in JSON format. Always respond with valid JSON only."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 1500,
      })

      const responseContent = completion.choices[0]?.message?.content
      
      if (!responseContent) {
        throw new Error('No response from OpenAI')
      }

      if (process.env.NODE_ENV === 'development') {
        console.log('OpenAI Raw Response:', responseContent)
      }

      // Parse the JSON response
      let brandData: OnboardingFormData
      try {
        // Clean the response to ensure it's valid JSON
        const cleanedResponse = responseContent.trim()
        const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/)
        
        if (!jsonMatch) {
          throw new Error('No JSON found in response')
        }
        
        brandData = JSON.parse(jsonMatch[0])
      } catch (parseError) {
        console.error('Error parsing OpenAI response:', parseError)
        console.error('Raw response:', responseContent)
        throw new Error('Failed to parse AI response as JSON')
      }

      // Validate and provide defaults
      const validateBrandData = (data: any): OnboardingFormData => {
        // Helper function to ensure we have at least 2 items for arrays
        const ensureMinItems = (arr: any, minCount: number, fallbackItems: string[]): string[] => {
          if (Array.isArray(arr) && arr.length >= minCount) {
            return arr.filter(item => item && typeof item === 'string' && item.trim()).slice(0, fallbackItems.length)
          }
          return fallbackItems
        }

        const companyName = data.brandName || domain.split('.')[0] || 'Your Company'

        return {
          brandName: data.brandName && typeof data.brandName === 'string' && data.brandName.trim() 
            ? data.brandName.trim() 
            : companyName,
          industry: data.industry && typeof data.industry === 'string' && data.industry.trim()
            ? data.industry.trim()
            : 'Technology',
          problemSolved: data.problemSolved && typeof data.problemSolved === 'string' && data.problemSolved.trim()
            ? data.problemSolved.trim()
            : `Helping customers achieve their goals through ${companyName}`,
          tasksHelped: ensureMinItems(data.tasksHelped, 2, [
            'Streamlining workflows', 'Improving efficiency', 'Managing processes', 'Optimizing operations', 'Supporting growth'
          ]),
          goalFacilitated: data.goalFacilitated && typeof data.goalFacilitated === 'string' && data.goalFacilitated.trim()
            ? data.goalFacilitated.trim()
            : 'Achieve better business outcomes',
          keyFeatures: ensureMinItems(data.keyFeatures, 2, [
            'User-friendly interface', 'Reliable performance', 'Expert support', 'Scalable solutions'
          ]),
          useCases: ensureMinItems(data.useCases, 2, [
            'Small to medium businesses', 'Enterprise organizations', 'Professional teams', 'Individual users'
          ]),
          competitors: ensureMinItems(data.competitors, 2, [
            'Industry leader A', 'Alternative solution B', 'Traditional methods', 'Manual processes'
          ]),
          productCategory: data.productCategory && typeof data.productCategory === 'string' && data.productCategory.trim()
            ? data.productCategory.trim()
            : 'Business solutions',
          uniqueSellingProps: ensureMinItems(
            data.uniqueSellingProps, 
            2, 
            ['Faster implementation', 'Better support', 'More affordable', 'Industry-specific features']
          ),
        }
      }

      const validatedBrandData = validateBrandData(brandData)

      // Save to user's pending brand (merge with existing onboarding_answers)
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
        return NextResponse.json({
          success: false,
          error: 'Database error while finding brand'
        }, { status: 500 })
      }

      if (!pendingBrands || pendingBrands.length === 0) {
        return NextResponse.json({
          success: false,
          error: 'No pending brand found. Please start the onboarding process first.'
        }, { status: 404 })
      }

      const brandId = pendingBrands[0].id
      const existingAnswers = pendingBrands[0].onboarding_answers || {}

      // Merge with existing answers (website analysis takes precedence)
      const mergedAnswers = {
        ...existingAnswers,
        ...validatedBrandData,
        // Also update domain for the brand
        websiteUrl: normalizedUrl
      }

      // Update the brand with analyzed data and domain
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
        return NextResponse.json({
          success: false,
          error: 'Failed to save analyzed data'
        }, { status: 500 })
      }

      if (process.env.NODE_ENV === 'development') {
        console.log('✅ Website analysis completed for brand:', validatedBrandData.brandName)
      }

      return NextResponse.json({
        success: true,
        brandData: validatedBrandData
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