import { redirect } from 'next/navigation'
import { getUserState } from '@/lib/supabase/user-state'

export default async function SetupLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Server-first route guard
  const userState = await getUserState()
  
  if (process.env.NODE_ENV === 'development') {
    console.log('⚙️ Setup layout - User state:', userState.state)
  }
  
  // Redirect unauthenticated users
  if (userState.state === 'NOT_AUTHENTICATED') {
    redirect('/auth/signin')
  }
  
  // All authenticated users can access setup pages
  // The specific setup pages will handle their own logic
  return <>{children}</>
}