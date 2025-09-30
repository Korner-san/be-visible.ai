'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Loader2 } from 'lucide-react'

export default function OnboardingLoadingScreen() {
  const router = useRouter()
  const [progressStep, setProgressStep] = useState(0)
  const [progressMessage, setProgressMessage] = useState('')
  const [progressPercent, setProgressPercent] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const progressSteps = [
    { message: 'Saving your answers...', percent: 20 },
    { message: 'Generating custom prompts...', percent: 50 },
    { message: 'Improving prompts with AI...', percent: 80 },
    { message: 'Preparing your review...', percent: 100 }
  ]

  useEffect(() => {
    const processOnboarding = async () => {
      try {
        // Step 1: Generate prompts from templates
        console.log('🔄 [LOADING SCREEN] Calling generate-prompts API...')
        setProgressStep(0)
        setProgressMessage('Generating custom prompts...')
        setProgressPercent(20)
        
        const generateResponse = await fetch('/api/onboarding/generate-prompts', {
          method: 'POST'
        })
        
        console.log('📊 [LOADING SCREEN] Generate response status:', generateResponse.status)
        
        if (!generateResponse.ok) {
          const generateData = await generateResponse.json()
          console.error('❌ [LOADING SCREEN] Generate failed:', generateData)
          throw new Error(generateData.error || 'Failed to generate prompts')
        }
        
        const generateData = await generateResponse.json()
        console.log('✅ [LOADING SCREEN] Generate success:', generateData)
        
        // Update progress with real data
        setProgressMessage(`Generated ${generateData.totalPrompts || 0} prompts (${generateData.newPrompts || 0} new)`)
        setProgressPercent(50)
        
        // Step 2: Improve prompts with ChatGPT (optional - continue even if it fails)
        console.log('🔄 [LOADING SCREEN] Calling improve-prompts API...')
        setProgressStep(1)
        setProgressMessage('Improving prompts with AI...')
        setProgressPercent(70)
        
        try {
          const improveResponse = await fetch('/api/onboarding/improve-prompts', {
            method: 'POST'
          })
          
          console.log('📊 [LOADING SCREEN] Improve response status:', improveResponse.status)
          
          if (improveResponse.ok) {
            const improveData = await improveResponse.json()
            console.log('✅ [LOADING SCREEN] Improve success:', improveData)
            // Update progress with real improvement data
            setProgressMessage(`AI improved ${improveData.improvedCount || 0} prompts`)
            setProgressPercent(90)
          } else {
            const improveError = await improveResponse.json()
            console.warn('⚠️ [LOADING SCREEN] Improve failed:', improveError)
            // Update progress to show partial success
            setProgressMessage('Using original prompts (AI improvement failed)')
            setProgressPercent(85)
          }
        } catch (improveError) {
          console.warn('❌ [LOADING SCREEN] Improve error:', improveError)
          // Continue to prompt review even if improvement fails
        }
        
        // Step 3: Preparing review page
        console.log('✅ [LOADING SCREEN] All APIs completed successfully, preparing navigation')
        setProgressStep(2)
        setProgressMessage('Ready! Preparing your prompt review...')
        setProgressPercent(100)
        
        // Brief delay to show completion
        await new Promise(resolve => setTimeout(resolve, 500))
        
        console.log('🎯 [LOADING SCREEN] About to navigate to combined prompts page')
        
        // Navigate to the combined prompts page
        router.push('/onboarding/add-prompts')
        
      } catch (error) {
        console.error('❌ [LOADING SCREEN] Error in onboarding processing:', error)
        setError(error instanceof Error ? error.message : 'An unexpected error occurred. Please try again.')
      }
    }

    processOnboarding()
  }, [router])

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-xl text-red-600">Processing Failed</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">{error}</p>
            <button
              onClick={() => router.push('/setup/onboarding')}
              className="w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
            >
              Back to Onboarding
            </button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Header with Back to Sign In link */}
        <div className="mb-4 flex justify-start">
          <button 
            onClick={() => router.push('/auth/signin')}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Back to Sign In
          </button>
        </div>
        
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl text-center">Processing Your Brand Data</CardTitle>
          </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">
                {progressMessage}
              </span>
              <span className="text-sm text-gray-500">
                {progressPercent}%
              </span>
            </div>
            <Progress value={progressPercent} className="w-full" />
            <div className="flex items-center justify-center space-x-2 text-sm text-gray-600">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>This may take a few moments...</span>
            </div>
          </div>
        </CardContent>
        </Card>
      </div>
    </div>
  )
}
