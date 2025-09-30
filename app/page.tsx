import { redirect } from 'next/navigation'
import { getUserState, getRouteForState } from '@/lib/supabase/user-state'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function HomePage() {
  // Server-first route decision - single source of truth
  const userState = await getUserState()
  const targetRoute = getRouteForState(userState.state)
  
  if (process.env.NODE_ENV === 'development') {
    console.log('🏠 Home page - User state:', userState.state, '-> Redirecting to:', targetRoute)
  }
  
  // Server-side redirect based on user state
  redirect(targetRoute)
}