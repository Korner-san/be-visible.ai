import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ReviewPromptsClient } from './review-prompts-client'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function ReviewPromptsPage() {
  console.log('🔍 [REVIEW PROMPTS PAGE] Page accessed')
  console.log('🔍 [REVIEW PROMPTS PAGE] Timestamp:', new Date().toISOString())
  
  // Get user from server-side auth
  const supabase = createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  
  if (authError || !user) {
    console.log('❌ [REVIEW PROMPTS PAGE] Auth error, redirecting to signin')
    redirect('/auth/signin')
  }

  console.log('🔍 [REVIEW PROMPTS PAGE] Looking for pending brand with prompts for user:', user.id)

  // First, get the user's pending brand
  const { data: pendingBrands, error: brandError } = await supabase
    .from('brands')
    .select('id, name, onboarding_answers, onboarding_completed')
    .eq('owner_user_id', user.id)
    .eq('is_demo', false)
    .eq('onboarding_completed', false)
    .order('created_at', { ascending: false })
    .limit(1)

  console.log('📊 [REVIEW PROMPTS PAGE] Pending brands query result:', { pendingBrands, brandError })

  if (brandError || !pendingBrands || pendingBrands.length === 0) {
    console.error('❌ [REVIEW PROMPTS PAGE] No pending brand found:', brandError)
    console.log('🔄 [REVIEW PROMPTS PAGE] Redirecting to onboarding to create/complete brand')
    redirect('/setup/onboarding')
  }

  const brand = pendingBrands[0]

  // Now get prompts for this brand (include active and inactive)
  const { data: prompts, error: promptsError } = await supabase
    .from('brand_prompts')
    .select(`
      id,
      source_template_code,
      raw_prompt,
      improved_prompt,
      status,
      category,
      created_at
    `)
    .eq('brand_id', brand.id)
    .in('status', ['active', 'inactive'])
    .order('source_template_code')

  console.log('📊 [REVIEW PROMPTS PAGE] Prompts query result:', { 
    promptsCount: prompts?.length || 0, 
    promptsError,
    statuses: prompts?.map(p => p.status) || []
  })

  // If no prompts, show error message but don't redirect - let user know what happened
  if (promptsError || !prompts || prompts.length === 0) {
    console.error('❌ [REVIEW PROMPTS PAGE] No prompts found for brand:', promptsError)
    
    // Instead of redirecting, show an error page with options
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md mx-auto text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">No Prompts Found</h1>
          <p className="text-gray-600 mb-6">
            We couldn't find any generated prompts for your brand. This might happen if the prompt generation step failed.
          </p>
          <div className="space-y-3">
            <a
              href="/setup/onboarding"
              className="block w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
            >
              Go Back to Onboarding
            </a>
            <button
              onClick={() => window.location.reload()}
              className="block w-full bg-gray-200 text-gray-900 px-4 py-2 rounded-md hover:bg-gray-300 transition-colors"
            >
              Refresh Page
            </button>
          </div>
        </div>
      </div>
    )
  }

  console.log(`✅ [REVIEW PROMPTS PAGE] Found ${prompts.length} prompts for brand ${brand.name}`)
  console.log('📋 [REVIEW PROMPTS PAGE] Prompt statuses:', prompts.map(p => `${p.source_template_code}:${p.status}`))

  return (
    <ReviewPromptsClient 
      brand={{
        ...brand,
        brand_prompts: prompts
      }}
      prompts={prompts}
      userId={user.id}
    />
  )
}
