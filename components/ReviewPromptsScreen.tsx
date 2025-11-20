"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Input } from "@/components/ui/input"
import { ChevronLeft, Plus } from "lucide-react"

interface ReviewPromptsScreenProps {
  onComplete: (selectedPrompts: string[]) => void
  onBack: () => void
  currentStep: number
  totalSteps: number
  progress: number
}

interface PromptOption {
  id: string
  text: string
  improved?: string
}

export function ReviewPromptsScreen({ onComplete, onBack, currentStep, totalSteps, progress }: ReviewPromptsScreenProps) {
  const [customPrompts, setCustomPrompts] = useState<string[]>([])
  const [systemPrompts, setSystemPrompts] = useState<PromptOption[]>([])
  const [newPrompt, setNewPrompt] = useState("")
  const [selectedPrompts, setSelectedPrompts] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [brandId, setBrandId] = useState<string>('')
  const maxSelections = 10
  const router = useRouter()

  // Load prompts from the server
  useEffect(() => {
    const loadPrompts = async () => {
      try {
        setIsLoading(true)
        
        // Fetch generated prompts for this brand
        const response = await fetch('/api/onboarding/get-prompts')
        const data = await response.json()
        
        if (data.success) {
          // Store brandId
          setBrandId(data.brandId)
          
          // Set custom prompts (user can add more)
          setCustomPrompts(data.customPrompts || [])
          
          // Set system prompts (generated from onboarding answers)
          setSystemPrompts(data.systemPrompts || [])
          
          // Pre-select recommended prompts (first 10 by ID)
          const recommendedPromptIds = (data.systemPrompts || [])
            .slice(0, 10)
            .map((p: PromptOption) => p.id)
            .filter(Boolean)
          setSelectedPrompts(new Set(recommendedPromptIds))
        }
      } catch (error) {
        console.error('Error loading prompts:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadPrompts()
  }, [])

  const addCustomPrompt = () => {
    if (newPrompt.trim() && !customPrompts.includes(newPrompt.trim())) {
      setCustomPrompts([...customPrompts, newPrompt.trim()])
      setNewPrompt("")
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      addCustomPrompt()
    }
  }

  const togglePrompt = (promptId: string) => {
    const newSelected = new Set(selectedPrompts)
    if (newSelected.has(promptId)) {
      newSelected.delete(promptId)
    } else if (newSelected.size < maxSelections) {
      newSelected.add(promptId)
    }
    setSelectedPrompts(newSelected)
  }

  const handleComplete = async () => {
    try {
      setIsSubmitting(true)
      setError(null)
      
      console.log('🔄 [ReviewPromptsScreen] Starting completion...')
      console.log('🔄 [ReviewPromptsScreen] BrandId:', brandId)
      console.log('🔄 [ReviewPromptsScreen] Selected prompt IDs:', Array.from(selectedPrompts))
      
      // Step 1: Save selected prompt IDs by activating them
      const selectResponse = await fetch('/api/onboarding/prompts/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          brandId: brandId,
          selectedPromptIds: Array.from(selectedPrompts)
        })
      })
      
      const selectData = await selectResponse.json()
      
      if (!selectResponse.ok) {
        console.error('❌ [ReviewPromptsScreen] Select failed:', selectData)
        throw new Error(selectData.error || 'Failed to save prompt selections')
      }
      
      console.log('✅ [ReviewPromptsScreen] Prompts selected successfully:', selectData)
      
      // Step 2: Complete onboarding
      const completeResponse = await fetch('/api/onboarding/complete-final', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      
      const completeData = await completeResponse.json()
      
      if (!completeResponse.ok) {
        console.error('❌ [ReviewPromptsScreen] Complete failed:', completeData)
        throw new Error(completeData.error || 'Failed to complete onboarding')
      }
      
      console.log('✅ [ReviewPromptsScreen] Onboarding completed successfully')
      
      // Step 3: Navigate to loading/finishing page
      router.push('/finishing')
      
    } catch (error) {
      console.error('❌ [ReviewPromptsScreen] Error:', error)
      setError(error instanceof Error ? error.message : 'Failed to complete onboarding. Please try again.')
      setIsSubmitting(false)
    }
  }

  const isSelected = (promptId: string) => selectedPrompts.has(promptId)
  const canSelect = selectedPrompts.size < maxSelections

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading prompts...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-semibold text-foreground">Brand Onboarding</h1>
              <button 
                onClick={() => router.push('/auth/signin')}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                ← Back to Sign In
              </button>
            </div>
            <span className="text-sm text-muted-foreground">{Math.round(progress)}% Complete</span>
          </div>

          <div className="mb-6">
            <div className="text-sm text-muted-foreground mb-2">Step {currentStep} of {totalSteps}</div>
            <Progress value={progress} className="h-2" />
          </div>

          <div className="mb-6">
            <h2 className="text-xl font-medium text-foreground mb-2">Review and Select Your Prompts</h2>
            <p className="text-muted-foreground mb-2">
              Choose up to {maxSelections} prompts from your custom prompts and our recommendations.
            </p>
            <p className="text-sm font-medium text-foreground">
              {selectedPrompts.size} of {maxSelections} selected
            </p>
          </div>
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Left Column - Your Prompts */}
          <div>
            <h3 className="text-lg font-medium text-foreground mb-4">Your Prompts</h3>

            <div className="mb-4">
              <div className="flex gap-2">
                <Input
                  type="text"
                  placeholder="Add your own custom prompt..."
                  value={newPrompt}
                  onChange={(e) => setNewPrompt(e.target.value)}
                  onKeyPress={handleKeyPress}
                  className="flex-1"
                />
                <Button onClick={addCustomPrompt} disabled={!newPrompt.trim()} size="icon" className="shrink-0">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
              {customPrompts.map((prompt, index) => (
                <Card
                  key={`user-${index}`}
                  className={`p-4 cursor-pointer transition-all duration-200 hover:shadow-md ${
                    isSelected(prompt)
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border hover:border-primary/50"
                  } ${!canSelect && !isSelected(prompt) ? "opacity-50 cursor-not-allowed" : ""}`}
                  onClick={() => togglePrompt(prompt)}
                >
                  <p className="text-sm text-foreground leading-relaxed">{prompt}</p>
                </Card>
              ))}
            </div>
          </div>

          {/* Right Column - Our Prompts */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-foreground">Our Prompts</h3>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></div>
                <span className="text-xs text-muted-foreground">Recommended by our system</span>
              </div>
            </div>
            <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
              {systemPrompts.map((prompt, index) => (
                <div key={`system-${prompt.id || index}`} className="relative pl-8">
                  {index < 15 && (
                    <div className="absolute left-2 top-4 w-3 h-3 bg-yellow-400 rounded-full animate-pulse shadow-lg"></div>
                  )}
                  <Card
                    className={`p-4 cursor-pointer transition-all duration-200 hover:shadow-md ${
                      isSelected(prompt.id)
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-border hover:border-primary/50"
                    } ${!canSelect && !isSelected(prompt.id) ? "opacity-50 cursor-not-allowed" : ""}`}
                    onClick={() => togglePrompt(prompt.id)}
                  >
                    <p className="text-sm text-foreground leading-relaxed">{prompt.text}</p>
                  </Card>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" className="flex items-center gap-2" onClick={onBack} disabled={isSubmitting}>
            <ChevronLeft className="w-4 h-4" />
            Previous
          </Button>

          <Button 
            className="px-8" 
            disabled={selectedPrompts.size === 0 || isSubmitting} 
            onClick={handleComplete}
          >
            {isSubmitting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Completing Setup...
              </>
            ) : (
              'Complete Setup'
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
