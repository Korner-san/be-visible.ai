/**
 * Domain Classification Service
 * Categorizes domains based on their homepage content (title, description, overall purpose)
 * This is separate from URL content classification which is for individual pages
 */

import { createServiceClient } from '@/lib/supabase/service'
import { extractUrlContent } from '@/lib/providers/tavily'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// Domain Role Categories (based on overall domain purpose)
export const DOMAIN_ROLE_CATEGORIES = {
  FOUNDATIONAL_AUTHORITY: 'Foundational Authority',
  COMPETITIVE_CONSENSUS: 'Competitive Consensus', 
  REAL_TIME_SIGNAL: 'Real-Time Signal',
  COMMUNITY_VALIDATION: 'Community Validation',
  TACTICAL_GUIDE: 'Tactical Guide',
} as const

export type DomainRoleCategory = keyof typeof DOMAIN_ROLE_CATEGORIES

interface DomainClassificationResult {
  domain: string
  domain_role_category: DomainRoleCategory
  classification_confidence: number
}

/**
 * Classify a domain based on its homepage content
 */
export const classifyDomain = async (
  domain: string
): Promise<DomainClassificationResult> => {
  console.log(`🌐 [DOMAIN CLASSIFIER] Classifying domain: ${domain}`)
  
  try {
    // Extract content from domain homepage
    const homepageUrl = `https://${domain}`
    const tavilyResponse = await extractUrlContent([homepageUrl])
    
    if (!tavilyResponse.results || tavilyResponse.results.length === 0) {
      console.warn(`⚠️ [DOMAIN CLASSIFIER] No content extracted for ${domain}`)
      return {
        domain,
        domain_role_category: 'FOUNDATIONAL_AUTHORITY',
        classification_confidence: 0.1
      }
    }
    
    const homepageContent = tavilyResponse.results[0]
    const { title, content, url } = homepageContent
    
    // Classify the domain based on homepage content
    const systemPrompt = `You are an expert domain analyst. Your task is to analyze a domain's homepage content to determine its primary role in the information ecosystem.

**DOMAIN ROLE TAXONOMY:**
1. FOUNDATIONAL_AUTHORITY: Domains that establish definitions, standards, and widely accepted facts (e.g., official documentation sites, standards bodies, established institutions)
2. COMPETITIVE_CONSENSUS: Domains that provide comparative analysis, product reviews, and market consensus (e.g., comparison sites, review platforms, market research)
3. REAL_TIME_SIGNAL: Domains that provide breaking news, real-time updates, and current events (e.g., news sites, live blogs, event coverage)
4. COMMUNITY_VALIDATION: Domains where user-generated content and peer discussion drive authority (e.g., forums, social platforms, community sites)
5. TACTICAL_GUIDE: Domains that provide step-by-step instructions, tutorials, and practical guidance (e.g., educational sites, how-to platforms, technical guides)

**INSTRUCTIONS:**
1. Analyze the homepage title, content, and overall domain purpose
2. Determine which single category best represents this domain's primary role
3. Consider the domain's overall mission, not individual page content
4. Return only the JSON format specified below

**DESIRED JSON OUTPUT FORMAT:**
{
  "domain": "[The domain being analyzed]",
  "domain_role_category": "[ONE_OF_THE_DOMAIN_ROLE_CATEGORIES]",
  "classification_confidence": [0.0-1.0]
}`

    const userPrompt = `**DOMAIN HOMEPAGE ANALYSIS:**
<DOMAIN>${domain}</DOMAIN>
<HOMEPAGE_URL>${url}</HOMEPAGE_URL>
<HOMEPAGE_TITLE>${title}</HOMEPAGE_TITLE>
<HOMEPAGE_CONTENT>${content.substring(0, 3000)}</HOMEPAGE_CONTENT>

Return only the JSON object, no additional text.`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' }
    })

    const responseContent = completion.choices[0].message.content || '{}'
    const parsed = JSON.parse(responseContent)
    
    console.log(`✅ [DOMAIN CLASSIFIER] Classified ${domain}: ${parsed.domain_role_category}`)
    
    return {
      domain: parsed.domain || domain,
      domain_role_category: parsed.domain_role_category || 'FOUNDATIONAL_AUTHORITY',
      classification_confidence: parsed.classification_confidence || 0.5
    }
    
  } catch (error: any) {
    console.error(`❌ [DOMAIN CLASSIFIER] Failed to classify ${domain}:`, error.message)
    return {
      domain,
      domain_role_category: 'FOUNDATIONAL_AUTHORITY',
      classification_confidence: 0.1
    }
  }
}

/**
 * Batch classify multiple domains
 */
export const classifyDomainsBatch = async (
  domains: string[]
): Promise<DomainClassificationResult[]> => {
  console.log(`🌐 [DOMAIN CLASSIFIER] Batch classifying ${domains.length} domains...`)
  
  const results: DomainClassificationResult[] = []
  
  // Process sequentially to avoid rate limits
  for (const domain of domains) {
    const result = await classifyDomain(domain)
    results.push(result)
    
    // Small delay between calls
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  
  console.log(`✅ [DOMAIN CLASSIFIER] Batch classification complete: ${results.length} domains`)
  return results
}

/**
 * Store domain classifications in database
 */
export const storeDomainClassifications = async (
  classifications: DomainClassificationResult[]
): Promise<void> => {
  const supabase = createServiceClient()
  
  console.log(`💾 [DOMAIN CLASSIFIER] Storing ${classifications.length} domain classifications...`)
  
  for (const classification of classifications) {
    try {
      // Update all URLs from this domain with the domain classification
      const { error } = await supabase
        .from('url_content_facts')
        .update({
          domain_role_category: classification.domain_role_category,
          domain_classification_confidence: classification.classification_confidence,
          domain_classified_at: new Date().toISOString()
        })
        .in('url_id', 
          supabase
            .from('url_inventory')
            .select('id')
            .eq('domain', classification.domain)
        )
      
      if (error) {
        console.error(`❌ [DOMAIN CLASSIFIER] Failed to store classification for ${classification.domain}:`, error)
      } else {
        console.log(`✅ [DOMAIN CLASSIFIER] Stored classification for ${classification.domain}`)
      }
    } catch (error) {
      console.error(`❌ [DOMAIN CLASSIFIER] Error storing classification for ${classification.domain}:`, error)
    }
  }
}
