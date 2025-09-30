'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, CheckCircle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

interface FinishingClientProps {
  brandName: string
  brandId: string
}

export function FinishingClient({ brandName, brandId }: FinishingClientProps) {
  const router = useRouter()
  const [countdown, setCountdown] = useState(3)

  useEffect(() => {
    console.log('🎯 [FINISHING CLIENT] Starting 3-second handoff for brand:', brandName)
    console.log('🎯 [FINISHING CLIENT] Will redirect to dashboard in 3 seconds')

    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer)
          console.log('🎯 [FINISHING CLIENT] Executing client redirect to dashboard')
          console.log('🎯 [FINISHING CLIENT] This is the ONLY client navigation in the completion flow')
          router.push('/reports/overview?onboarding_completed=true')
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [brandName, router])

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6">
          <div className="text-center space-y-6">
            {/* Success Icon */}
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>

            {/* Main Headline */}
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-gray-900">
                We're preparing your first report…
              </h1>
              <p className="text-gray-600">
                This usually takes a moment. You'll start on the Demo report while we build your personalized insights for <strong>{brandName}</strong>.
              </p>
            </div>

            {/* Progress Indicator */}
            <div className="space-y-4">
              <div className="flex items-center justify-center space-x-2">
                <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                <span className="text-sm text-gray-500">
                  Redirecting in {countdown} second{countdown !== 1 ? 's' : ''}...
                </span>
              </div>

              {/* Progress Steps */}
              <div className="space-y-2 text-sm text-gray-500">
                <div className="flex items-center space-x-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span>Onboarding completed</span>
                </div>
                <div className="flex items-center space-x-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span>Prompts generated and selected</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                  <span>Report generation queued</span>
                </div>
              </div>
            </div>

            {/* Footer Note */}
            <div className="text-xs text-gray-400 pt-4 border-t">
              You can switch between Demo and {brandName} reports anytime using the brand selector.
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
