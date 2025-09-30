import { redirect } from 'next/navigation'
import { getUserState, getRouteForState } from '@/lib/supabase/user-state'
import { createClient } from '@/lib/supabase/server'
import { PromptsManagementClient } from './prompts-management-client'

export default async function PromptsManagementPage() {
  const userState = await getUserState()
  
  if (userState.state === 'NOT_AUTHENTICATED') {
    redirect('/auth/signin')
  }
  
  // Only allow access if user has completed onboarding
  if (userState.state !== 'AUTHENTICATED_READY' && userState.state !== 'AUTHENTICATED_ONBOARDING_DONE_NO_REPORT') {
    const targetRoute = getRouteForState(userState.state)
    redirect(targetRoute)
  }
  
  // Get user's brands and their prompts
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect('/auth/signin')
  }
  
  // Get both demo brand and user's completed brands
  // Demo brand is available to all users, user brands only to their owner
  const { data: brands } = await supabase
    .from('brands')
    .select('id, name, domain, is_demo, onboarding_completed, first_report_status')
    .or(`and(owner_user_id.eq.${user.id},is_demo.eq.false),is_demo.eq.true`)
    .eq('onboarding_completed', true)
    .order('created_at', { ascending: false })
  
  if (!brands || brands.length === 0) {
    redirect('/setup/onboarding')
  }
  
  return <PromptsManagementClient brands={brands} />
}