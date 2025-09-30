import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import CombinedPromptsClient from './combined-prompts-client'

export default async function CombinedPromptsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect('/auth/signin')
  }

  // Check if user has a pending brand with onboarding answers
  const { data: pendingBrands } = await supabase
    .from('brands')
    .select('id, name, onboarding_answers')
    .eq('owner_user_id', user.id)
    .eq('is_demo', false)
    .eq('onboarding_completed', false)
    .order('created_at', { ascending: false })
    .limit(1)

  if (!pendingBrands || pendingBrands.length === 0) {
    redirect('/setup/onboarding')
  }

  const brand = pendingBrands[0]
  const onboardingAnswers = brand.onboarding_answers as any

  if (!onboardingAnswers || !onboardingAnswers.brandName) {
    redirect('/setup/onboarding')
  }

  return <CombinedPromptsClient brand={brand} />
}
