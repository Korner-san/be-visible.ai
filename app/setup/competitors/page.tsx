import { redirect } from 'next/navigation'
import { getUserState, getRouteForState } from '@/lib/supabase/user-state'
import { createClient } from '@/lib/supabase/server'
import CompetitorsClient from './competitors-client'

export default async function SetupCompetitors() {
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
  
  // Get both demo brand and user's completed brands with their onboarding answers
  const { data: brands } = await supabase
    .from('brands')
    .select('id, name, domain, is_demo, onboarding_completed, first_report_status, onboarding_answers')
    .or(`and(owner_user_id.eq.${user.id},is_demo.eq.false),is_demo.eq.true`)
    .eq('onboarding_completed', true)
    .order('created_at', { ascending: false })

  if (!brands || brands.length === 0) {
    redirect('/setup/onboarding')
  }

  // Fetch competitors from brand_competitors table for all brands
  const { data: competitorsData } = await supabase
    .from('brand_competitors')
    .select('*')
    .in('brand_id', brands.map(b => b.id))
    .eq('is_active', true)
    .order('display_order', { ascending: true })

  // Group competitors by brand_id for easy lookup
  const competitorsByBrand: Record<string, any[]> = {}
  if (competitorsData) {
    competitorsData.forEach(comp => {
      if (!competitorsByBrand[comp.brand_id]) {
        competitorsByBrand[comp.brand_id] = []
      }
      competitorsByBrand[comp.brand_id].push(comp)
    })
  }

  return <CompetitorsClient brands={brands} competitorsByBrand={competitorsByBrand} />
}
