'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useBrandsStore } from '@/store/brands'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import { Checkbox } from '@/components/ui/checkbox'
import { Loader2, Globe, ArrowRight, ArrowLeft, CheckCircle, Info } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import type { UserStateResult } from '@/lib/supabase/user-state'
import { OnboardingConsent } from '@/components/OnboardingConsent'
import { ReviewPromptsScreen } from '@/components/ReviewPromptsScreen'

interface OnboardingClientProps {
  userState: UserStateResult
}

// Form schema for onboarding data
const onboardingSchema = z.object({
  brandName: z.string().min(2, 'Brand name must be at least 2 characters'),
  website: z.string().url('Please enter a valid website URL'),
  industry: z.string().min(2, 'Please specify your industry'),
  productCategory: z.string().min(2, 'Please describe your product/service category'),
  problemSolved: z.string().min(10, 'Please describe the problem you solve (at least 10 characters)'),
  tasksHelped: z.array(z.string()).min(1, 'Please list at least one task'),
  goalFacilitated: z.string().min(5, 'Please describe the goal your product helps achieve'),
  keyFeatures: z.array(z.string()).min(1, 'Please list at least one key feature'),
  useCases: z.array(z.string()).min(1, 'Please list at least one use case'),
  competitors: z.array(z.string()).min(1, 'Please list at least one competitor'),
  uniqueSellingProps: z.array(z.string()).min(1, 'Please list at least one unique selling proposition'),
})

type OnboardingFormData = z.infer<typeof onboardingSchema>

// 10 onboarding questions based on LLMSEO pattern
const questions = [
  {
    id: 'brandName',
    title: 'Brand Name',
    question: 'What is your brand name?',
    type: 'single' as const,
    placeholder: 'e.g. "Tesla", "Shopify", "Your Company"',
    description: 'Enter the name of your brand or company'
  },
  {
    id: 'website',
    title: 'Website',
    question: 'What is your website URL?',
    type: 'single' as const,
    placeholder: 'https://yourcompany.com',
    description: 'Enter your primary website URL'
  },
  {
    id: 'industry',
    title: 'Industry',
    question: 'Which industry does your brand belong to?',
    type: 'single' as const,
    placeholder: 'e.g. "E-commerce", "SaaS", "Healthcare"',
    description: 'Specify your industry or sector'
  },
  {
    id: 'productCategory',
    title: 'Product Category',
    question: 'What type of product/service do you offer?',
    type: 'single' as const,
    placeholder: 'e.g. "Payment processors", "AI productivity tools"',
    description: 'Describe your product or service category'
  },
  {
    id: 'problemSolved',
    title: 'Problem Solved',
    question: 'What problem does your product solve?',
    type: 'single' as const,
    placeholder: 'e.g. "Helps small businesses accept payments online"',
    description: 'Describe the main problem your product addresses'
  },
  {
    id: 'tasksHelped',
    title: 'Tasks',
    question: 'What tasks does your product help users complete?',
    type: 'multiple' as const,
    count: 5,
    placeholder: 'e.g. "Process payments", "Manage inventory", "Track analytics"',
    description: 'List up to 5 tasks your product helps with'
  },
  {
    id: 'goalFacilitated',
    title: 'Goals',
    question: 'What goals can users achieve using your product?',
    type: 'single' as const,
    placeholder: 'e.g. "Increase online sales", "Improve productivity"',
    description: 'Describe the main goal your product helps achieve'
  },
  {
    id: 'keyFeatures',
    title: 'Key Features',
    question: 'List up to 4 key features your product offers:',
    type: 'multiple' as const,
    count: 4,
    placeholder: 'e.g. "Real-time analytics", "Mobile app", "API access"',
    description: 'List your most important product features'
  },
  {
    id: 'useCases',
    title: 'Use Cases',
    question: 'List up to 4 use cases your product supports:',
    type: 'multiple' as const,
    count: 4,
    placeholder: 'e.g. "E-commerce stores", "Subscription businesses"',
    description: 'List the main use cases for your product'
  },
  {
    id: 'competitors',
    title: 'Competitors',
    question: 'Who are your top 3-4 competitors?',
    type: 'multiple' as const,
    count: 4,
    placeholder: 'e.g. "PayPal", "Wise", "Shopify Payments"',
    description: 'List your main competitors'
  },
  {
    id: 'uniqueSellingProps',
    title: 'Unique Value',
    question: 'What makes your product better than competitors?',
    type: 'multiple' as const,
    count: 4,
    placeholder: 'e.g. "Faster onboarding", "More transparent pricing"',
    description: 'List your unique selling propositions'
  }
]

export function OnboardingClient({ userState }: OnboardingClientProps) {
  console.log('🎨 [ONBOARDING CLIENT] Component initialized with userState:', userState.state)
  
  const router = useRouter()
  const { loadUserBrands } = useBrandsStore()
  const [currentStep, setCurrentStep] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [brandId, setBrandId] = useState<string | null>(null)
  const [isAnalyzingWebsite, setIsAnalyzingWebsite] = useState(false)
  const [showSiteScanInfo, setShowSiteScanInfo] = useState(false)
  const [hasReadSiteScanInfo, setHasReadSiteScanInfo] = useState(false)
  const [showConsentPage, setShowConsentPage] = useState(false)
  const [showReviewPrompts, setShowReviewPrompts] = useState(false)
  

  // Add effect to track navigation changes
  useEffect(() => {
    console.log('🎨 [ONBOARDING CLIENT] Component mounted/updated')
    console.log('🎨 [ONBOARDING CLIENT] Current URL:', window.location.href)
    console.log('🎨 [ONBOARDING CLIENT] Current step:', currentStep)
    console.log('🎨 [ONBOARDING CLIENT] Brand ID:', brandId)
  }, [currentStep, brandId])

  // Initialize form with default values
  const form = useForm<OnboardingFormData>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      brandName: '',
      website: '',
      industry: '',
      productCategory: '',
      problemSolved: '',
      tasksHelped: ['', '', '', '', ''],
      goalFacilitated: '',
      keyFeatures: ['', '', '', ''],
      useCases: ['', '', '', ''],
      competitors: ['', '', '', ''],
      uniqueSellingProps: ['', '', '', '']
    }
  })

  // Create or get pending brand on mount (server-side brand resolution)
  useEffect(() => {
    const initializeBrand = async () => {
      if (!userState.user) {
        console.log('🎨 [ONBOARDING CLIENT] No user found, skipping brand initialization')
        return
      }

      console.log('🔄 [ONBOARDING CLIENT] Initializing brand for user:', userState.user.id)

      try {
        const response = await fetch('/api/onboarding/init', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}) // No userId needed - server resolves from auth
        })

        console.log('📊 [ONBOARDING CLIENT] Init response status:', response.status)

        const data = await response.json()
        console.log('📊 [ONBOARDING CLIENT] Init response data:', data)
        
        if (data.success) {
          setBrandId(data.brandId) // Still store for UI confirmation, but not required for API calls
          console.log('✅ [ONBOARDING CLIENT] Brand initialized:', data.brandId)
          
          // If there are existing answers, populate the form
          if (data.existingAnswers && Object.keys(data.existingAnswers).length > 0) {
            console.log('📝 [ONBOARDING CLIENT] Populating form with existing answers')
            form.reset(data.existingAnswers)
          }
        } else {
          console.error('❌ [ONBOARDING CLIENT] Brand initialization failed:', data.error)
          setError(data.error || 'Failed to initialize onboarding')
        }
      } catch (error) {
        console.error('❌ [ONBOARDING CLIENT] Error initializing brand:', error)
        setError('Failed to initialize onboarding. Please refresh and try again.')
      }
    }

    initializeBrand()
  }, [userState.user, form])

  // Auto-save answers as user progresses (server-side brand resolution)
  const saveAnswers = async (data: Partial<OnboardingFormData>) => {
    try {
      const response = await fetch('/api/onboarding/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answers: data // No brandId needed - server resolves from auth
        })
      })

      const result = await response.json()
      if (result.success && result.brandId) {
        setBrandId(result.brandId) // Update local brandId for UI confirmation
      }
    } catch (error) {
      console.error('Error saving answers:', error)
      // Don't show error to user for auto-save failures
    }
  }

  // Handle website analysis
  const analyzeWebsite = async (websiteUrl: string) => {
    console.log('🔍 [WEBSITE ANALYSIS] Starting analysis for:', websiteUrl)
    setIsAnalyzingWebsite(true)
    setError(null)

    try {
      console.log('🔍 [WEBSITE ANALYSIS] Calling analyze-website API...')
      const response = await fetch('/api/onboarding/analyze-website', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: websiteUrl })
      })

      console.log('🔍 [WEBSITE ANALYSIS] Response status:', response.status)
      const data = await response.json()
      console.log('🔍 [WEBSITE ANALYSIS] Response data:', data)
      
      if (data.success && data.brandData) {
        console.log('✅ [WEBSITE ANALYSIS] Got brand data, prefilling form...')
        console.log('📊 [WEBSITE ANALYSIS] Brand data keys:', Object.keys(data.brandData))
        
        // Prefill form with analyzed data
        const currentValues = form.getValues()
        const mergedData = {
          ...currentValues,
          ...data.brandData,
          website: websiteUrl // Keep the original URL
        }
        
        console.log('🔄 [WEBSITE ANALYSIS] Resetting form with merged data')
        form.reset(mergedData)
        
        // Save the prefilled data
        console.log('💾 [WEBSITE ANALYSIS] Saving prefilled data...')
        await saveAnswers(mergedData)
        
        console.log('✅ [WEBSITE ANALYSIS] Website analysis and prefill complete')
        
        // Show the consent page instead of site scan info
        setShowConsentPage(true)
      } else {
        console.warn('⚠️ [WEBSITE ANALYSIS] No brand data returned:', data)
        if (!data.success) {
          setError(`Website analysis failed: ${data.error || 'Unknown error'}`)
        }
      }
    } catch (error) {
      console.error('❌ [WEBSITE ANALYSIS] Error analyzing website:', error)
      setError('Failed to analyze website. You can continue manually.')
    } finally {
      setIsAnalyzingWebsite(false)
    }
  }

  // Global Enter key handler as fallback
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !isSubmitting && !isAnalyzingWebsite) {
        // Only handle if the target is an input in our onboarding form
        const target = e.target as HTMLElement
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
          const isOnboardingInput = target.closest('[data-onboarding-form]')
          if (isOnboardingInput) {
            console.log('🎯 [GLOBAL] Enter key detected on onboarding input, ensuring Next behavior')
            e.preventDefault()
            e.stopPropagation()
            handleNext()
          }
        }
      }
    }

    document.addEventListener('keydown', handleGlobalKeyDown)
    return () => document.removeEventListener('keydown', handleGlobalKeyDown)
  }, [isSubmitting, isAnalyzingWebsite, currentStep])

  const currentQuestion = questions[currentStep]
  const progress = ((currentStep + 1) / questions.length) * 100

  const handleNext = async () => {
    if (isSubmitting) return // Prevent double submission
    
    // If showing consent page, continue to next question
    if (showConsentPage) {
      setShowConsentPage(false)
      return
    }
    
    // Check if site scan info is shown and checkbox is not checked
    if (showSiteScanInfo && !hasReadSiteScanInfo) {
      setError('Please confirm you have read the information about AI-generated answers.')
      return
    }
    
    const currentField = currentQuestion.id as keyof OnboardingFormData
    const currentValue = form.getValues(currentField)
    
    // Validate current field
    const fieldSchema = onboardingSchema.shape[currentField]
    const validation = fieldSchema.safeParse(currentValue)
    
    if (!validation.success) {
      form.setError(currentField, {
        type: 'manual',
        message: validation.error.errors[0]?.message || 'This field is required'
      })
      return
    }

    // Set loading state for auto-save
    if (currentStep < questions.length - 1) {
      setIsSubmitting(true)
    }

    try {
      // Auto-save current progress
      await saveAnswers({ [currentField]: currentValue })

      // Handle website analysis on website step
      if (currentField === 'website' && typeof currentValue === 'string') {
        await analyzeWebsite(currentValue)
      }

      if (currentStep < questions.length - 1) {
        setCurrentStep(currentStep + 1)
        // Hide site scan info when moving to next step
        if (showSiteScanInfo) {
          setShowSiteScanInfo(false)
        }
      } else {
        await handleSubmit()
      }
    } finally {
      if (currentStep < questions.length - 1) {
        setIsSubmitting(false)
      }
    }
  }

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleSubmit = async () => {
    console.log('🚀 [ONBOARDING CLIENT] Starting handleSubmit - Review & Generate Prompts clicked')
    console.log('🚀 [ONBOARDING CLIENT] Timestamp:', new Date().toISOString())
    console.log('🚀 [ONBOARDING CLIENT] Current brandId state:', brandId)
    
    setIsSubmitting(true)
    setError(null)

    try {
      const formData = form.getValues()
      console.log('🚀 [ONBOARDING CLIENT] Form data prepared:', {
        brandName: formData.brandName,
        website: formData.website,
        industry: formData.industry,
        hasTasksHelped: formData.tasksHelped?.length > 0,
        hasKeyFeatures: formData.keyFeatures?.length > 0,
        hasUseCases: formData.useCases?.length > 0,
        hasCompetitors: formData.competitors?.length > 0,
        hasUSPs: formData.uniqueSellingProps?.length > 0
      })
      
      // Only save the final onboarding answers, then navigate to loading screen
      console.log('🔄 [ONBOARDING CLIENT] Calling /api/onboarding/save...')
      
      const saveResponse = await fetch('/api/onboarding/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: formData })
      })
      
      console.log('📊 [ONBOARDING CLIENT] Save response status:', saveResponse.status)
      
      if (!saveResponse.ok) {
        const saveData = await saveResponse.json()
        console.error('❌ [ONBOARDING CLIENT] Save failed:', saveData)
        throw new Error(saveData.error || 'Failed to save onboarding answers')
      }
      
      const saveResult = await saveResponse.json()
      console.log('✅ [ONBOARDING CLIENT] Save success:', saveResult)
      
      // Refresh brand data immediately after name update
      if (userState.userId) {
        console.log('🔄 [ONBOARDING CLIENT] Refreshing brand data after name update...')
        loadUserBrands(userState.userId).catch(console.error)
      }
      
      console.log('🎯 [ONBOARDING CLIENT] About to show review prompts screen')
      console.log('🎯 [ONBOARDING CLIENT] Current URL before showing prompts:', window.location.href)
      
      // Show review prompts screen instead of navigating
      setShowReviewPrompts(true)
      setIsSubmitting(false)
      console.log('🎯 [ONBOARDING CLIENT] Review prompts screen initiated...')
      
    } catch (error) {
      console.error('❌ [ONBOARDING CLIENT] Error in onboarding submission:', error)
      console.error('❌ [ONBOARDING CLIENT] Error stack:', error instanceof Error ? error.stack : 'No stack trace')
      setError(error instanceof Error ? error.message : 'An unexpected error occurred. Please try again.')
      setIsSubmitting(false)
    }
  }

  // Handle Enter key navigation
  const handleKeyDown = (e: React.KeyboardEvent, inputIndex?: number) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      
      console.log('🎯 [ONBOARDING] Enter key pressed:', {
        currentStep,
        questionType: currentQuestion.type,
        inputIndex,
        isSubmitting,
        isAnalyzing: isAnalyzingWebsite,
        target: (e.target as HTMLElement)?.tagName,
        eventPhase: e.eventPhase
      })
      
      // Prevent action if submitting or analyzing
      if (isSubmitting || isAnalyzingWebsite) {
        console.log('🎯 [ONBOARDING] Blocked Enter - currently processing')
        return
      }
      
      // Always trigger Next behavior - never Previous
      // For multiple inputs, move to next input or next question
      if (currentQuestion.type === 'multiple' && inputIndex !== undefined) {
        const nextIndex = inputIndex + 1
        const maxInputs = currentQuestion.count || 4
        
        if (nextIndex < maxInputs) {
          // Focus next input in the same question
          console.log('🎯 [ONBOARDING] Moving to next input within question:', nextIndex)
          setTimeout(() => {
            const nextInput = document.querySelector(`[data-input-index="${nextIndex}"]`) as HTMLInputElement
            if (nextInput) {
              nextInput.focus()
            }
          }, 0)
        } else {
          // Move to next question
          console.log('🎯 [ONBOARDING] Moving to next question via Enter (multiple input complete)')
          handleNext()
        }
      } else {
        // Single input - move to next question
        console.log('🎯 [ONBOARDING] Single input - moving to next question via Enter')
        handleNext()
      }
    }
  }

  const renderInput = () => {
    const field = currentQuestion.id as keyof OnboardingFormData
    const value = form.watch(field)
    const error = form.formState.errors[field]

    if (currentQuestion.type === 'multiple') {
      const arrayValue = Array.isArray(value) ? value : []
      
      return (
        <div className="space-y-3">
          {Array.from({ length: currentQuestion.count || 4 }, (_, index) => (
            <div key={index}>
              <Input
                data-input-index={index}
                value={arrayValue[index] || ''}
                onChange={(e) => {
                  const newArray = [...arrayValue]
                  newArray[index] = e.target.value
                  form.setValue(field, newArray as any)
                }}
                onKeyDown={(e) => handleKeyDown(e, index)}
                placeholder={`${currentQuestion.placeholder} (${index + 1})`}
                className="w-full"
              />
            </div>
          ))}
          {error && (
            <p className="text-sm text-red-600">{error.message}</p>
          )}
        </div>
      )
    }

    return (
      <div>
        <Input
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => form.setValue(field, e.target.value as any)}
          onKeyDown={handleKeyDown}
          placeholder={currentQuestion.placeholder}
          className="w-full"
          type={field === 'website' ? 'url' : 'text'}
        />
        {error && (
          <p className="text-sm text-red-600 mt-1">{error.message}</p>
        )}
      </div>
    )
  }

  // Show consent page if needed
  if (showConsentPage) {
    return (
      <OnboardingConsent
        onContinue={() => setShowConsentPage(false)}
        currentStep={currentStep + 1}
        totalSteps={questions.length}
        progress={progress}
      />
    )
  }

  // Show review prompts screen if needed
  if (showReviewPrompts) {
    return (
      <ReviewPromptsScreen
        onComplete={async (selectedPrompts) => {
          try {
            setIsSubmitting(true)
            
            // Save selected prompts and complete onboarding
            const response = await fetch('/api/onboarding/save-prompts', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ selectedPrompts })
            })
            
            const data = await response.json()
            
            if (data.success) {
              // Navigate to loading screen to start report generation
              router.push('/setup/onboarding/loading-screen')
            } else {
              setError(data.error || 'Failed to save prompts')
              setIsSubmitting(false)
            }
          } catch (error) {
            console.error('Error saving prompts:', error)
            setError('Failed to save prompts. Please try again.')
            setIsSubmitting(false)
          }
        }}
        onBack={() => setShowReviewPrompts(false)}
        currentStep={questions.length + 1}
        totalSteps={questions.length + 1}
        progress={100}
      />
    )
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl" data-onboarding-form>
        <CardHeader>
          <div className="flex items-center justify-between mb-4">
            <div>
              <CardTitle className="text-2xl">Brand Onboarding</CardTitle>
              <CardDescription>
                Step {currentStep + 1} of {questions.length}
              </CardDescription>
            </div>
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push('/auth/signin')}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                ← Back to Sign In
              </Button>
              <div className="text-sm text-muted-foreground">
                {Math.round(progress)}% Complete
              </div>
            </div>
          </div>
          
          <Progress value={progress} className="w-full" />
        </CardHeader>

        <CardContent className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {isAnalyzingWebsite && (
            <Alert>
              <Loader2 className="h-4 w-4 animate-spin" />
              <AlertDescription>
                Analyzing your website to prefill the remaining questions...
              </AlertDescription>
            </Alert>
          )}

          {showSiteScanInfo && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-3">
                  <p className="font-medium">Next screens = AI-generated answers from your brand scan.</p>
                  <p>Accuracy is crucial for the best report & prompts.</p>
                  <p>You can edit answers anytime.</p>
                  <div className="flex items-center space-x-2 mt-3">
                    <Checkbox
                      id="read-confirmation"
                      checked={hasReadSiteScanInfo}
                      onCheckedChange={(checked) => {
                        setHasReadSiteScanInfo(checked as boolean)
                        if (checked) setError(null) // Clear error when checked
                      }}
                    />
                    <Label htmlFor="read-confirmation" className="text-sm font-medium">
                      Yes, I've read this information
                    </Label>
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-4">
            <div>
              <h3 className="text-xl font-semibold mb-2">
                {currentQuestion.question}
              </h3>
              <p className="text-muted-foreground text-sm mb-4">
                {currentQuestion.description}
              </p>
            </div>

            {renderInput()}
          </div>


          <div className="flex justify-between pt-6">
            <Button
              type="button"
              variant="outline"
              onClick={handlePrevious}
              disabled={currentStep === 0 || isSubmitting}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Previous
            </Button>

            <Button
              type="button"
              onClick={handleNext}
              disabled={isSubmitting || isAnalyzingWebsite}
              className={isSubmitting ? 'cursor-not-allowed opacity-50' : ''}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {currentStep === questions.length - 1 ? 'Processing...' : 'Saving...'}
                </>
              ) : currentStep === questions.length - 1 ? (
                <>
                  Review & Generate Prompts
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              ) : (
                <>
                  Next
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
