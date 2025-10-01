import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function HomePage() {
  // Always redirect to loading page to determine user flow
  // This prevents any dashboard flash for users who need onboarding
  redirect('/loading')
}