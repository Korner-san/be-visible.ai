'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Loader2, CheckCircle } from 'lucide-react'

export default function LoadingPage() {
  const router = useRouter()
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('Initializing...')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const determineUserFlow = async () => {
      try {
        setProgress(20)
        setStatus('Checking authentication...')
        
        // Small delay to show loading state
        await new Promise(resolve => setTimeout(resolve, 500))
        
        const supabase = await createClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        
        if (authError || !user) {
          setProgress(100)
          setStatus('Redirecting to sign in...')
          await new Promise(resolve => setTimeout(resolve, 300))
          router.push('/auth/signin')
          return
        }
        
        setProgress(40)
        setStatus('Loading your account...')
        
        // Get user's brands to determine state
        const { data: brands, error: brandsError } = await supabase
          .from('brands')
          .select('id, name, onboarding_completed, first_report_status')
          .eq('owner_user_id', user.id)
          .eq('is_demo', false)
          .order('created_at', { ascending: false })

        if (brandsError) {
          console.error('Error fetching brands:', brandsError)
          setProgress(100)
          setStatus('Redirecting to onboarding...')
          await new Promise(resolve => setTimeout(resolve, 300))
          router.push('/setup/onboarding')
          return
        }

        setProgress(70)
        setStatus('Determining next steps...')

        const realBrands = brands || []
        
        if (realBrands.length === 0) {
          // No brands - needs onboarding
          setProgress(100)
          setStatus('Redirecting to setup...')
          await new Promise(resolve => setTimeout(resolve, 300))
          router.push('/setup/onboarding')
          return
        }

        // Check onboarding status
        const completedBrands = realBrands.filter(brand => brand.onboarding_completed)
        const incompleteBrands = realBrands.filter(brand => !brand.onboarding_completed)

        if (completedBrands.length > 0) {
          // User has completed onboarding - check report status
          const brandsWithReports = completedBrands.filter(brand => 
            brand.first_report_status === 'succeeded'
          )

          setProgress(90)
          setStatus('Loading your dashboard...')

          if (brandsWithReports.length > 0) {
            // Full dashboard ready
            setProgress(100)
            setStatus('Welcome to your dashboard!')
            await new Promise(resolve => setTimeout(resolve, 500))
            router.push('/reports/visibility')
          } else {
            // Onboarding done but no reports yet - show demo
            setProgress(100)
            setStatus('Preparing your dashboard...')
            await new Promise(resolve => setTimeout(resolve, 500))
            router.push('/reports/visibility?demo=true')
          }
        } else if (incompleteBrands.length > 0) {
          // User has incomplete onboarding
          setProgress(100)
          setStatus('Continuing your setup...')
          await new Promise(resolve => setTimeout(resolve, 300))
          router.push('/setup/onboarding')
        } else {
          // Fallback
          setProgress(100)
          setStatus('Redirecting to setup...')
          await new Promise(resolve => setTimeout(resolve, 300))
          router.push('/setup/onboarding')
        }

      } catch (error) {
        console.error('Error in loading flow:', error)
        setError('Something went wrong. Please try again.')
        setProgress(100)
        setStatus('Redirecting to sign in...')
        await new Promise(resolve => setTimeout(resolve, 1000))
        router.push('/auth/signin')
      }
    }

    determineUserFlow()
  }, [router])

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-xl text-red-600">Loading Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">{error}</p>
            <div className="flex items-center justify-center space-x-2 text-sm text-gray-600">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Redirecting...</span>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader className="text-center">
            <div className="w-12 h-12 bg-primary rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-white font-semibold text-xl">B</span>
            </div>
            <CardTitle className="text-2xl">be-visible.ai</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">
                  {status}
                </span>
                <span className="text-sm text-gray-500">
                  {progress}%
                </span>
              </div>
              <Progress value={progress} className="w-full" />
              <div className="flex items-center justify-center space-x-2 text-sm text-gray-600">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Please wait...</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
