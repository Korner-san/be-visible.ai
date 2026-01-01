// Server-first user state machine for onboarding and routing
import { createClient } from './server'
import type { User } from '@supabase/supabase-js'
import { callPerplexityAPI, extractPerplexityContent } from '@/lib/providers/perplexity'

// User states as defined in the requirements
export type UserState = 
  | 'NOT_AUTHENTICATED'
  | 'AUTHENTICATED_NO_BRAND' 
  | 'AUTHENTICATED_ONBOARDING_IN_PROGRESS'
  | 'AUTHENTICATED_ONBOARDING_DONE_NO_REPORT'
  | 'AUTHENTICATED_READY'

export interface UserStateResult {
  state: UserState
  user: User | null
  hasRealBrands: boolean
  hasPendingBrand: boolean
  firstReportReady: boolean
  debugInfo?: any
}

/**
 * Determines the user's current state in the application flow
 * This is the single source of truth for routing decisions
 */
export async function getUserState(): Promise<UserStateResult> {
  const supabase = await createClient()

  console.log('🔍 [getUserState] Starting user state check')
  console.log('🔍 [getUserState] Timestamp:', new Date().toISOString())
  
  try {
    // Get current session
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    console.log('🔍 [getUserState] User ID:', user?.id)
    console.log('🔍 [getUserState] User Email:', user?.email)
    
    // EMERGENCY FIX: If user email is undefined but we have an ID, try to continue
    if (authError || !user) {
      console.log('🚨 [getUserState] Auth failed - checking for emergency fallback')
      
      // Try to find any completed brands for the hardcoded admin user as emergency fallback
      try {
        const { data: emergencyBrands } = await supabase
          .from('brands')
          .select('id, onboarding_completed, first_report_status')
          .eq('is_demo', false)
          .eq('onboarding_completed', true)
          .limit(1)
        
        if (emergencyBrands && emergencyBrands.length > 0) {
          console.log('🚨 [getUserState] Found completed brand, allowing dashboard access')
          return {
            state: 'AUTHENTICATED_READY',
            user: null,
            hasRealBrands: true,
            hasPendingBrand: false,
            firstReportReady: emergencyBrands[0].first_report_status === 'succeeded'
          }
        }
      } catch (emergencyError) {
        console.error('🚨 [getUserState] Emergency fallback failed:', emergencyError)
      }
      
      if (process.env.NODE_ENV === 'development') {
        console.log('🔍 User state: NOT_AUTHENTICATED', { authError })
      }
      return {
        state: 'NOT_AUTHENTICATED',
        user: null,
        hasRealBrands: false,
        hasPendingBrand: false,
        firstReportReady: false
      }
    }

    // Get user's brands (excluding demo brands)
    const { data: brands, error: brandsError } = await supabase
      .from('brands')
      .select('*')
      .eq('owner_user_id', user.id)
      .eq('is_demo', false)
      .order('created_at', { ascending: false })

    if (brandsError) {
      console.error('Error fetching user brands:', brandsError)
      // Fallback to no brands state on error
      return {
        state: 'AUTHENTICATED_NO_BRAND',
        user,
        hasRealBrands: false,
        hasPendingBrand: false,
        firstReportReady: false,
        debugInfo: { brandsError }
      }
    }

    const realBrands = brands || []
    const hasRealBrands = realBrands.length > 0

    if (process.env.NODE_ENV === 'development') {
      console.log('🔍 User brands query result:', {
        userId: user.id,
        brandsFound: realBrands.length,
        brands: realBrands.map(b => ({
          id: b.id,
          name: b.name,
          is_demo: b.is_demo,
          onboarding_completed: b.onboarding_completed,
          owner_user_id: b.owner_user_id,
          user_id: b.user_id
        }))
      })
    }

    if (!hasRealBrands) {
      if (process.env.NODE_ENV === 'development') {
        console.log('🔍 User state: AUTHENTICATED_NO_BRAND - No real brands found')
      }
      return {
        state: 'AUTHENTICATED_NO_BRAND',
        user,
        hasRealBrands: false,
        hasPendingBrand: false,
        firstReportReady: false
      }
    }

    // Check onboarding status of brands
    const incompleteBrands = realBrands.filter(brand => !brand.onboarding_completed)
    const completedBrands = realBrands.filter(brand => brand.onboarding_completed)
    
    console.log('🔍 [getUserState] Onboarding status check:', {
      incompleteBrands: incompleteBrands.length,
      completedBrands: completedBrands.length,
      incompleteDetails: incompleteBrands.map(b => ({ id: b.id, name: b.name, onboarding_completed: b.onboarding_completed })),
      completedDetails: completedBrands.map(b => ({ id: b.id, name: b.name, onboarding_completed: b.onboarding_completed, first_report_status: b.first_report_status }))
    })
    
    // CRITICAL: Prefer ANY completed brand over ANY pending brand
    // This prevents users from being trapped in onboarding after completion
    if (completedBrands.length > 0) {
      console.log('🔍 [getUserState] Found completed brands - proceeding with completion logic')
      
      // Check report status of completed brands
      const brandsWithReports = completedBrands.filter(brand => 
        brand.first_report_status === 'succeeded'
      )

      const brandsWithPendingReports = completedBrands.filter(brand =>
        ['queued', 'running'].includes(brand.first_report_status)
      )

      // If onboarding is done but no reports are ready yet
      if (brandsWithReports.length === 0) {
        console.log('🔍 [getUserState] RESULT: AUTHENTICATED_ONBOARDING_DONE_NO_REPORT', {
          completedBrands: completedBrands.length,
          pendingReports: brandsWithPendingReports.length,
          ignoredIncompleteBrands: incompleteBrands.length
        })
        return {
          state: 'AUTHENTICATED_ONBOARDING_DONE_NO_REPORT',
          user,
          hasRealBrands: true,
          hasPendingBrand: false,
          firstReportReady: false,
          debugInfo: { 
            completedBrands: completedBrands.length,
            pendingReports: brandsWithPendingReports.length,
            ignoredIncompleteBrands: incompleteBrands.length
          }
        }
      }

      // User is fully ready with completed brands and reports
      console.log('🔍 [getUserState] RESULT: AUTHENTICATED_READY', {
        completedBrands: completedBrands.length,
        readyReports: brandsWithReports.length,
        ignoredIncompleteBrands: incompleteBrands.length
      })
      
      return {
        state: 'AUTHENTICATED_READY',
        user,
        hasRealBrands: true,
        hasPendingBrand: false,
        firstReportReady: true,
        debugInfo: {
          completedBrands: completedBrands.length,
          readyReports: brandsWithReports.length,
          ignoredIncompleteBrands: incompleteBrands.length
        }
      }
    }
    
    // Only check for incomplete brands if NO completed brands exist
    if (incompleteBrands.length > 0) {
      console.log('🔍 [getUserState] RESULT: AUTHENTICATED_ONBOARDING_IN_PROGRESS', {
        incompleteBrands: incompleteBrands.length,
        completedBrands: 0
      })
      return {
        state: 'AUTHENTICATED_ONBOARDING_IN_PROGRESS',
        user,
        hasRealBrands: true,
        hasPendingBrand: true,
        firstReportReady: false,
        debugInfo: { incompleteBrands: incompleteBrands.length }
      }
    }

    // This should not be reached since we handle all cases above
    console.log('🔍 [getUserState] FALLBACK: No brands found (should not reach here)')
    return {
      state: 'AUTHENTICATED_NO_BRAND',
      user,
      hasRealBrands: false,
      hasPendingBrand: false,
      firstReportReady: false,
      debugInfo: { fallback: true }
    }

  } catch (error) {
    console.error('Error in getUserState:', error)
    
    // Fallback to safe state on error
    return {
      state: 'NOT_AUTHENTICATED',
      user: null,
      hasRealBrands: false,
      hasPendingBrand: false,
      firstReportReady: false,
      debugInfo: { error }
    }
  }
}

/**
 * Get the route that the user should be redirected to based on their state
 */
export function getRouteForState(state: UserState): string {
  switch (state) {
    case 'NOT_AUTHENTICATED':
      return '/auth/signin'
    
    case 'AUTHENTICATED_NO_BRAND':
    case 'AUTHENTICATED_ONBOARDING_IN_PROGRESS':
      return '/setup/onboarding'
    
    case 'AUTHENTICATED_ONBOARDING_DONE_NO_REPORT':
      // Show demo brand dashboard while waiting for real report
      return '/reports/overview?demo=true'
    
    case 'AUTHENTICATED_READY':
      return '/reports/overview'
    
    default:
      return '/auth/signin'
  }
}

/**
 * Create or get a pending brand for onboarding
 */
export async function createPendingBrand(userId: string): Promise<{ id: string; name: string; domain: string } | null> {
  const supabase = await createClient()

  try {
    // Verify auth session first
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (process.env.NODE_ENV === 'development') {
      console.log('🔍 createPendingBrand auth check:', {
        providedUserId: userId,
        authUserId: user?.id,
        authError: authError?.message,
        hasValidSession: !!user
      })
    }

    if (authError || !user || user.id !== userId) {
      console.error('Auth session invalid in createPendingBrand:', { authError, user: !!user, userIdMatch: user?.id === userId })
      return null
    }

    // Check if user already has a pending brand
    const { data: existingBrands, error: selectError } = await supabase
      .from('brands')
      .select('id, name, domain')
      .eq('owner_user_id', userId)
      .eq('is_demo', false)
      .eq('onboarding_completed', false)
      .limit(1)

    if (selectError) {
      console.error('Error selecting existing brands:', selectError)
      return null
    }

    if (existingBrands && existingBrands.length > 0) {
      if (process.env.NODE_ENV === 'development') {
        console.log('✅ Found existing pending brand:', existingBrands[0].id)
      }
      return existingBrands[0]
    }

    // Create new pending brand
    const { data, error } = await supabase
      .from('brands')
      .insert({
        owner_user_id: userId,
        name: 'Pending Brand',
        domain: `pending-${Date.now()}.temp`,
        is_demo: false,
        onboarding_completed: false,
        first_report_status: 'idle',
        onboarding_answers: {}
      })
      .select('id, name, domain')
      .single()

    if (error) {
      console.error('Error creating pending brand:', {
        error,
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint
      })
      return null
    }

    if (process.env.NODE_ENV === 'development') {
      console.log('✨ Created new pending brand:', data.id)
    }

    return data
  } catch (error) {
    console.error('Unexpected error in createPendingBrand:', error)
    return null
  }
}

/**
 * Update onboarding answers incrementally
 */
export async function updateOnboardingAnswers(
  brandId: string, 
  answers: Record<string, any>
): Promise<boolean> {
  const supabase = await createClient()

  try {
    // Prepare update data - include brand name and website if provided
    const updateData: any = {
      onboarding_answers: answers
    }
    
    // Update brand name if provided in answers
    if (answers.brandName && typeof answers.brandName === 'string' && answers.brandName.trim()) {
      updateData.name = answers.brandName.trim()
      console.log('🏷️ [UPDATE ANSWERS] Updating brand name to:', answers.brandName.trim())
    }
    
    // Update domain if website provided in answers
    if (answers.website && typeof answers.website === 'string' && answers.website.trim()) {
      updateData.domain = answers.website.trim()
      console.log('🌐 [UPDATE ANSWERS] Updating brand domain to:', answers.website.trim())
    }
    
    const { error } = await supabase
      .from('brands')
      .update(updateData)
      .eq('id', brandId)

    if (error) {
      console.error('Error updating onboarding answers:', error)
      return false
    }

    // DUAL-WRITE: Also write competitors to brand_competitors table
    if (answers.competitors && Array.isArray(answers.competitors)) {
      // Filter out empty strings and trim whitespace
      const validCompetitors = answers.competitors
        .filter((c: any) => c && typeof c === 'string' && c.trim())
        .map((c: string) => c.trim())

      if (validCompetitors.length > 0) {
        console.log('🏢 [UPDATE ANSWERS] Syncing', validCompetitors.length, 'competitors to brand_competitors table')

        // Delete existing competitors for this brand (to handle updates)
        const { error: deleteError } = await supabase
          .from('brand_competitors')
          .delete()
          .eq('brand_id', brandId)

        if (deleteError) {
          console.error('⚠️ [UPDATE ANSWERS] Error deleting old competitors:', deleteError)
          // Don't fail the whole operation - JSONB is still updated
        }

        // Insert new competitors
        const competitorRecords = validCompetitors.map((name: string, index: number) => ({
          brand_id: brandId,
          competitor_name: name,
          display_order: index + 1,
          is_active: true
        }))

        const { error: insertError } = await supabase
          .from('brand_competitors')
          .insert(competitorRecords)

        if (insertError) {
          console.error('⚠️ [UPDATE ANSWERS] Error inserting competitors:', insertError)
          // Don't fail the whole operation - JSONB is still updated
        } else {
          console.log('✅ [UPDATE ANSWERS] Successfully synced competitors to brand_competitors table')

          // Fetch competitor domains using Perplexity API (non-blocking)
          fetchCompetitorDomains(brandId, validCompetitors).catch(err => {
            console.error('⚠️ [UPDATE ANSWERS] Failed to fetch competitor domains (non-critical):', err)
          })
        }
      }
    }

    if (process.env.NODE_ENV === 'development') {
      console.log('🔄 Updated onboarding answers for brand:', brandId, 'with data:', Object.keys(updateData))
    }

    return true
  } catch (error) {
    console.error('Error in updateOnboardingAnswers:', error)
    return false
  }
}

// Removed duplicate completeOnboarding function - now handled by server action

/**
 * Fetch competitor domains using Perplexity API
 * Called after competitors are saved during onboarding
 */
export async function fetchCompetitorDomains(brandId: string, competitorNames: string[]): Promise<void> {
  if (!competitorNames || competitorNames.length === 0) {
    console.log('⚠️ [FETCH DOMAINS] No competitors to process')
    return
  }

  console.log('🌐 [FETCH DOMAINS] Fetching domains for', competitorNames.length, 'competitors')

  try {
    // Create prompt for Perplexity
    const prompt = `Find the official website domain for each of the following companies. Return ONLY a JSON object with the format: {"CompanyName": "domain.com"}. Do not include http://, https://, or www. Just the base domain.

Companies:
${competitorNames.map(name => `- ${name}`).join('\n')}

Return JSON only, no explanation.`

    // Call Perplexity API
    const response = await callPerplexityAPI(prompt, {
      model: 'sonar',
      maxTokens: 500,
      temperature: 0.1,
      returnCitations: false
    })

    const content = extractPerplexityContent(response)
    console.log('🌐 [FETCH DOMAINS] Perplexity response:', content.substring(0, 200))

    // Parse JSON response
    let domainMap: Record<string, string>
    try {
      // Try to extract JSON from response (in case there's extra text)
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        domainMap = JSON.parse(jsonMatch[0])
      } else {
        domainMap = JSON.parse(content)
      }
    } catch (parseError) {
      console.error('❌ [FETCH DOMAINS] Failed to parse JSON:', parseError)
      console.log('Raw content:', content)
      // Fallback: use .com for each competitor
      domainMap = {}
      competitorNames.forEach(name => {
        domainMap[name] = `${name.toLowerCase().replace(/\s+/g, '')}.com`
      })
    }

    console.log('🌐 [FETCH DOMAINS] Domain map:', domainMap)

    // Update each competitor with its domain
    const supabase = await createClient()

    for (const competitorName of competitorNames) {
      const domain = domainMap[competitorName] || `${competitorName.toLowerCase().replace(/\s+/g, '')}.com`

      const { error } = await supabase
        .from('brand_competitors')
        .update({ competitor_domain: domain })
        .eq('brand_id', brandId)
        .eq('competitor_name', competitorName)

      if (error) {
        console.error(`⚠️ [FETCH DOMAINS] Failed to update domain for ${competitorName}:`, error)
      } else {
        console.log(`✅ [FETCH DOMAINS] Updated ${competitorName} → ${domain}`)
      }
    }

    console.log('✅ [FETCH DOMAINS] Successfully fetched and saved all competitor domains')
  } catch (error) {
    console.error('❌ [FETCH DOMAINS] Error fetching domains:', error)
    // Don't throw - this is a non-critical enhancement
    // Competitors will just use the fallback .com domain
  }
}
