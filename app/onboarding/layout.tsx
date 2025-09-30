import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Onboarding - be-visible.ai',
  description: 'Complete your brand setup',
}

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Dedicated onboarding layout without dashboard UI
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {children}
    </div>
  )
}