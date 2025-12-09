import { redirect } from 'next/navigation'
import { getUserState, getRouteForState } from '@/lib/supabase/user-state'
import { createClient } from '@/lib/supabase/server'
import ReportsPromptsClient from './prompts-client'

export default async function ReportsPromptsPage() {
  const userState = await getUserState()
  
  if (userState.state === 'NOT_AUTHENTICATED') {
    redirect('/auth/signin')
  }
  
  // Only allow access if user has completed onboarding
  if (userState.state !== 'AUTHENTICATED_READY' && userState.state !== 'AUTHENTICATED_ONBOARDING_DONE_NO_REPORT') {
    const targetRoute = getRouteForState(userState.state)
    redirect(targetRoute)
  }
  
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect('/auth/signin')
  }
  
  // Get both demo brand and user's completed brands with selected prompts
  // Demo brand is available to all users, user brands only to their owner
  const { data: brands } = await supabase
    .from('brands')
    .select(`
      id, 
      name, 
      domain,
      is_demo,
      brand_prompts!inner(
        id,
        source_template_code,
        raw_prompt,
        improved_prompt,
        status,
        created_at
      )
    `)
    .or(`and(owner_user_id.eq.${user.id},is_demo.eq.false),is_demo.eq.true`)
    .eq('onboarding_completed', true)
    .eq('brand_prompts.status', 'active')
    .order('created_at', { ascending: false })
  
  return <ReportsPromptsClient brands={brands || []} />
}