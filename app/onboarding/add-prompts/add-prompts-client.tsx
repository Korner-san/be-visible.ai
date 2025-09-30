'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Plus, X, AlertTriangle, Lightbulb } from "lucide-react"
import { toast } from 'sonner'

interface Brand {
  id: string
  name: string
  onboarding_answers: any
}

interface CustomPrompt {
  id: string
  prompt: string
  hasWarning: boolean
}

export default function AddPromptsClient({ brand }: { brand: Brand }) {
  const router = useRouter()
  const [customPrompts, setCustomPrompts] = useState<CustomPrompt[]>([])
  const [currentPrompt, setCurrentPrompt] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const onboardingAnswers = brand.onboarding_answers
  const brandName = onboardingAnswers?.brandName || ''
  const competitors = onboardingAnswers?.competitors || []

  // Check if prompt mentions brand or competitors
  const checkForMentions = (prompt: string): boolean => {
    const lowerPrompt = prompt.toLowerCase()
    const lowerBrand = brandName.toLowerCase()
    
    // Check for brand name
    if (lowerPrompt.includes(lowerBrand)) {
      return true
    }
    
    // Check for competitor names
    return competitors.some((competitor: string) => 
      competitor.trim() && lowerPrompt.includes(competitor.toLowerCase())
    )
  }

  const handleAddPrompt = () => {
    if (!currentPrompt.trim()) {
      toast.error('Please enter a prompt')
      return
    }

    if (customPrompts.length >= 10) {
      toast.error('You can add up to 10 custom prompts')
      return
    }

    const hasWarning = checkForMentions(currentPrompt.trim())
    
    const newPrompt: CustomPrompt = {
      id: Date.now().toString(),
      prompt: currentPrompt.trim(),
      hasWarning
    }

    setCustomPrompts([...customPrompts, newPrompt])
    setCurrentPrompt('')
    
    if (hasWarning) {
      toast.warning('Warning: This prompt mentions your brand or competitors')
    } else {
      toast.success('Custom prompt added')
    }
  }

  const handleRemovePrompt = (id: string) => {
    setCustomPrompts(customPrompts.filter(p => p.id !== id))
    toast.success('Prompt removed')
  }

  const handleContinue = async () => {
    setIsLoading(true)
    
    try {
      // Save custom prompts to database
      if (customPrompts.length > 0) {
        const response = await fetch('/api/onboarding/save-custom-prompts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            brandId: brand.id,
            customPrompts: customPrompts.map(p => ({
              prompt: p.prompt,
              hasWarning: p.hasWarning
            }))
          }),
        })

        if (!response.ok) {
          throw new Error('Failed to save custom prompts')
        }
      }

      // Navigate to review prompts page
      router.push('/onboarding/review-prompts')
    } catch (error) {
      console.error('Error saving custom prompts:', error)
      toast.error('Failed to save custom prompts. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSkip = () => {
    router.push('/onboarding/review-prompts')
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleAddPrompt()
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center pb-6">
          <CardTitle className="text-2xl font-bold text-gray-900">
            Add Your Own Prompts (Optional)
          </CardTitle>
          <div className="flex items-center justify-center gap-2 mt-4 p-4 bg-blue-50 rounded-lg">
            <Lightbulb className="h-5 w-5 text-blue-600" />
            <p className="text-sm text-blue-800">
              Think about questions your customers ask when looking for solutions like yours
            </p>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Add Prompt Input */}
          <div className="space-y-3">
            <Label htmlFor="custom-prompt" className="text-sm font-medium">
              Enter a search question
            </Label>
            <div className="flex gap-2">
              <Textarea
                id="custom-prompt"
                value={currentPrompt}
                onChange={(e) => setCurrentPrompt(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="e.g., What are the best tools for managing team projects?"
                className="flex-1 resize-none"
                rows={2}
                maxLength={200}
              />
              <Button 
                onClick={handleAddPrompt}
                disabled={!currentPrompt.trim() || customPrompts.length >= 10}
                className="shrink-0"
              >
                <Plus className="h-4 w-4" />
                Add
              </Button>
            </div>
            <div className="flex justify-between text-xs text-gray-500">
              <span>{currentPrompt.length}/200 characters</span>
              <span>{customPrompts.length}/10 prompts</span>
            </div>
          </div>

          {/* Warning Message */}
          <Alert className="border-amber-200 bg-amber-50">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800">
              <strong>Tip:</strong> Avoid mentioning your brand name or competitors. 
              Prompts that mention brands may affect the credibility of your statistics, 
              as natural discovery-focused queries better reflect genuine relevance.
            </AlertDescription>
          </Alert>

          {/* Custom Prompts List */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">
              Your Custom Prompts ({customPrompts.length}/10)
            </Label>
            
            {customPrompts.length === 0 ? (
              <div className="p-8 text-center text-gray-500 border-2 border-dashed border-gray-200 rounded-lg">
                No custom prompts added yet
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {customPrompts.map((prompt) => (
                  <div 
                    key={prompt.id} 
                    className={`p-3 rounded-lg border ${
                      prompt.hasWarning 
                        ? 'border-amber-200 bg-amber-50' 
                        : 'border-gray-200 bg-white'
                    }`}
                  >
                    <div className="flex justify-between items-start gap-3">
                      <div className="flex-1">
                        <p className="text-sm text-gray-900">{prompt.prompt}</p>
                        {prompt.hasWarning && (
                          <div className="flex items-center gap-1 mt-1">
                            <AlertTriangle className="h-3 w-3 text-amber-600" />
                            <span className="text-xs text-amber-700">
                              Contains brand/competitor mention
                            </span>
                          </div>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemovePrompt(prompt.id)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex justify-between pt-4">
            <Button 
              variant="outline" 
              onClick={handleSkip}
              disabled={isLoading}
            >
              Skip This Step
            </Button>
            <Button 
              onClick={handleContinue}
              disabled={isLoading}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isLoading ? 'Saving...' : 'Continue'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
