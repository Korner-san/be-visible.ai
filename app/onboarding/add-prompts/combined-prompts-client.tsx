'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Plus, X, AlertTriangle, Lightbulb, CheckCircle, ArrowRight, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { BrandPrompt } from '@/types/database'

interface Brand {
  id: string
  name: string
  onboarding_answers: any
}

interface CustomPrompt {
  id: string
  prompt: string
  hasWarning: boolean
  isLocked: boolean
}

interface CombinedPromptsClientProps {
  brand: Brand
}

const getCategoryColor = (category: string | null): string => {
  const colors: { [key: string]: string } = {
    'Brand Awareness': 'bg-blue-500',
    'Product Information': 'bg-green-500',
    'Value Proposition': 'bg-purple-500',
    'Competitive Analysis': 'bg-red-500',
    'Public Perception': 'bg-yellow-500',
    'Problem Resolution': 'bg-indigo-500',
    'Task Assistance': 'bg-pink-500',
    'Goal Achievement': 'bg-teal-500',
    'Feature Recognition': 'bg-orange-500',
    'Use Case Application': 'bg-cyan-500',
    'Competitive Alternatives': 'bg-rose-500',
    'Direct Comparison': 'bg-amber-500',
    'Competitive Advantage': 'bg-violet-500',
    'Industry Leadership': 'bg-emerald-500',
    'Category Recommendation': 'bg-lime-500',
    'Brand Challenges': 'bg-red-600',
    'Customer Concerns': 'bg-orange-600',
    'Purchase Decision': 'bg-blue-600',
    'Requirement Matching': 'bg-green-600',
    'USP Handling': 'bg-purple-600',
    'Pricing Information': 'bg-gray-600',
    'Discovery': 'bg-blue-500',
    'Custom': 'bg-purple-500'
  }
  return colors[category || ''] || 'bg-gray-500'
}

export default function CombinedPromptsClient({ brand }: CombinedPromptsClientProps) {
  const router = useRouter()
  const [generatedPrompts, setGeneratedPrompts] = useState<BrandPrompt[]>([])
  const [selectedPrompts, setSelectedPrompts] = useState<Set<string>>(new Set())
  const [customPrompts, setCustomPrompts] = useState<CustomPrompt[]>([])
  const [currentPrompt, setCurrentPrompt] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onboardingAnswers = brand.onboarding_answers
  const brandName = onboardingAnswers?.brandName || ''
  const competitors = onboardingAnswers?.competitors || []

  // Load generated prompts
  useEffect(() => {
    const loadGeneratedPrompts = async () => {
      try {
        setIsLoading(true)
        const response = await fetch(`/api/onboarding/prompts?brandId=${brand.id}`)
        const data = await response.json()
        
        if (data.success && data.prompts) {
          setGeneratedPrompts(data.prompts)
          
          // Auto-select prompts (prioritize already selected ones)
          const sortedPrompts = [...data.prompts].sort((a, b) => {
            const codeA = a.source_template_code
            const codeB = b.source_template_code
            if (codeA !== codeB) {
              return codeA.localeCompare(codeB)
            }
            return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          })

          const alreadySelected = sortedPrompts.filter(p => p.status === 'selected')
          const availableForSelection = sortedPrompts.filter(p => p.status === 'draft' || p.status === 'improved' || p.status === 'inactive')
          
          const toSelect = [
            ...alreadySelected,
            ...availableForSelection.slice(0, Math.max(0, Math.min(15, data.prompts.length) - alreadySelected.length))
          ].slice(0, 15)

          const selectedIds = new Set(toSelect.map(p => p.id))
          setSelectedPrompts(selectedIds)
        } else {
          setError('Failed to load generated prompts')
        }
      } catch (error) {
        console.error('Error loading prompts:', error)
        setError('Failed to load generated prompts')
      } finally {
        setIsLoading(false)
      }
    }

    loadGeneratedPrompts()
  }, [brand.id])

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

  const handleAddCustomPrompt = () => {
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
      hasWarning,
      isLocked: true // Lock immediately after adding
    }

    setCustomPrompts([...customPrompts, newPrompt])
    setCurrentPrompt('')
    
    if (hasWarning) {
      toast.warning('Warning: This prompt mentions your brand or competitors')
    } else {
      toast.success('Custom prompt added and locked')
    }
  }

  const handleRemoveCustomPrompt = (id: string) => {
    setCustomPrompts(customPrompts.filter(p => p.id !== id))
    toast.success('Custom prompt removed')
  }

  const handleGeneratedPromptToggle = (promptId: string) => {
    const newSelected = new Set(selectedPrompts)
    if (newSelected.has(promptId)) {
      newSelected.delete(promptId)
    } else if (newSelected.size + customPrompts.length < 15) {
      newSelected.add(promptId)
    } else {
      toast.error('You can select up to 15 total prompts (including custom ones)')
    }
    setSelectedPrompts(newSelected)
  }

  const handleFinishOnboarding = async () => {
    const totalSelected = selectedPrompts.size + customPrompts.length
    
    if (totalSelected === 0) {
      toast.error('Please select at least one prompt')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      // Save custom prompts if any
      if (customPrompts.length > 0) {
        const customResponse = await fetch('/api/onboarding/save-custom-prompts', {
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

        if (!customResponse.ok) {
          throw new Error('Failed to save custom prompts')
        }
      }

      // Update selected generated prompts
      if (selectedPrompts.size > 0) {
        const updateResponse = await fetch('/api/onboarding/prompts/select', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            brandId: brand.id,
            selectedPromptIds: Array.from(selectedPrompts)
          }),
        })

        if (!updateResponse.ok) {
          throw new Error('Failed to update prompt selections')
        }
      }

      // Complete onboarding
      const completeResponse = await fetch('/api/onboarding/complete-final', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          brandId: brand.id
        }),
      })

      if (!completeResponse.ok) {
        throw new Error('Failed to complete onboarding')
      }

      toast.success('Onboarding completed successfully!')
      
      // Navigate to dashboard
      router.push('/reports/overview')
      
    } catch (error) {
      console.error('Error completing onboarding:', error)
      setError(error instanceof Error ? error.message : 'Failed to complete onboarding')
      toast.error('Failed to complete onboarding. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleAddCustomPrompt()
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex items-center justify-center py-8">
            <div className="flex items-center space-x-2">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span>Loading prompts...</span>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const totalSelected = selectedPrompts.size + customPrompts.length

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header with Back to Sign In link */}
        <div className="flex justify-start">
          <button 
            onClick={() => router.push('/auth/signin')}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Back to Sign In
          </button>
        </div>
        
        {/* Header */}
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold text-gray-900">
              Review & Select Your Prompts
            </CardTitle>
            <p className="text-sm text-gray-600 mt-2">
              Select up to 15 prompts total. Generated prompts are ready to use, or add your own custom prompts.
            </p>
            <div className="flex justify-center mt-4">
              <Badge variant="outline" className="text-sm">
                {totalSelected}/15 prompts selected
              </Badge>
            </div>
          </CardHeader>
        </Card>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Generated Prompts */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Generated Prompts</CardTitle>
              <p className="text-sm text-gray-600">
                AI-generated prompts based on your brand information
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {generatedPrompts.map((prompt) => {
                  const isSelected = selectedPrompts.has(prompt.id)
                  const displayPrompt = prompt.improved_prompt || prompt.raw_prompt
                  
                  return (
                    <div
                      key={prompt.id}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                        isSelected
                          ? 'border-blue-300 bg-blue-50'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                      onClick={() => handleGeneratedPromptToggle(prompt.id)}
                    >
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={isSelected}
                          onChange={() => handleGeneratedPromptToggle(prompt.id)}
                          className="mt-1"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-900 mb-2">{displayPrompt}</p>
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="secondary"
                              className={`text-xs text-white ${getCategoryColor(prompt.category)}`}
                            >
                              {prompt.category || 'General'}
                            </Badge>
                            {prompt.improved_prompt && (
                              <Badge variant="outline" className="text-xs">
                                <CheckCircle className="w-3 h-3 mr-1" />
                                AI Improved
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          {/* Custom Prompts */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Add Your Own Prompts</CardTitle>
              <p className="text-sm text-gray-600">
                Enter your own prompt instead
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Add Prompt Input */}
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Textarea
                    value={currentPrompt}
                    onChange={(e) => setCurrentPrompt(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="e.g., What are the best tools for managing team projects?"
                    className="flex-1 resize-none"
                    rows={2}
                    maxLength={200}
                  />
                  <Button 
                    onClick={handleAddCustomPrompt}
                    disabled={!currentPrompt.trim() || customPrompts.length >= 10}
                    className="shrink-0"
                    size="sm"
                  >
                    <Plus className="h-4 w-4" />
                    Add
                  </Button>
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                  <span>{currentPrompt.length}/200 characters</span>
                  <span>{customPrompts.length}/10 custom prompts</span>
                </div>
              </div>

              {/* Tip Box */}
              <Alert className="border-amber-200 bg-amber-50">
                <Lightbulb className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-800">
                  <strong>Tip:</strong> Think about questions your customers ask when looking for solutions like yours. 
                  Avoid mentioning your brand name or competitors for better discovery-focused results.
                </AlertDescription>
              </Alert>

              {/* Custom Prompts List */}
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {customPrompts.length === 0 ? (
                  <div className="p-4 text-center text-gray-500 border-2 border-dashed border-gray-200 rounded-lg">
                    No custom prompts added yet
                  </div>
                ) : (
                  customPrompts.map((prompt) => (
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
                          <div className="flex items-center gap-2 mt-1">
                            {prompt.hasWarning && (
                              <div className="flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3 text-amber-600" />
                                <span className="text-xs text-amber-700">
                                  Contains brand/competitor mention
                                </span>
                              </div>
                            )}
                            <Badge variant="outline" className="text-xs">
                              Custom • Locked
                            </Badge>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveCustomPrompt(prompt.id)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Action Button */}
        <Card>
          <CardContent className="flex justify-center pt-6">
            <Button 
              onClick={handleFinishOnboarding}
              disabled={isSubmitting || totalSelected === 0}
              className="bg-blue-600 hover:bg-blue-700 px-8"
              size="lg"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Completing Onboarding...
                </>
              ) : (
                <>
                  Finish Onboarding
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
