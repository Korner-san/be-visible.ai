'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Loader2, CheckCircle, AlertCircle, ArrowRight } from 'lucide-react'
import type { BrandPrompt } from '@/types/database'

interface ReviewPromptsClientProps {
  brand: {
    id: string
    name: string
    onboarding_answers: Record<string, any>
    brand_prompts: BrandPrompt[]
  }
  prompts: BrandPrompt[]
  userId: string
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

export function ReviewPromptsClient({ brand, prompts, userId }: ReviewPromptsClientProps) {
  console.log('🎨 [REVIEW PROMPTS CLIENT] Component initialized')
  console.log('🎨 [REVIEW PROMPTS CLIENT] Brand:', brand.name, 'Prompts count:', prompts.length)
  
  const router = useRouter()
  const [selectedPrompts, setSelectedPrompts] = useState<Set<string>>(new Set())
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Auto-select prompts (prioritize already selected ones)
  useEffect(() => {
    console.log('🔄 [REVIEW PROMPTS CLIENT] Auto-selecting prompts...')
    
    // Sort prompts by template code and creation time for consistent ordering
    const sortedPrompts = [...prompts].sort((a, b) => {
      const codeA = a.source_template_code
      const codeB = b.source_template_code
      if (codeA !== codeB) {
        return codeA.localeCompare(codeB)
      }
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    })

    // Auto-select already selected prompts, then add more up to 10 total
    const alreadySelected = sortedPrompts.filter(p => p.status === 'selected')
    const availableForSelection = sortedPrompts.filter(p => p.status === 'draft' || p.status === 'improved' || p.status === 'inactive')
    
    const toSelect = [
      ...alreadySelected,
      ...availableForSelection.slice(0, Math.max(0, Math.min(10, prompts.length) - alreadySelected.length))
    ].slice(0, 10)

    const selectedIds = new Set(toSelect.map(p => p.id))
    setSelectedPrompts(selectedIds)
    
    console.log('✅ [REVIEW PROMPTS CLIENT] Auto-selected prompts:', {
      totalAvailable: prompts.length,
      alreadySelected: alreadySelected.length,
      newlySelected: selectedIds.size,
      selectedIds: Array.from(selectedIds)
    })
  }, [prompts])

  const handlePromptToggle = (promptId: string) => {
    const newSelected = new Set(selectedPrompts)
    if (newSelected.has(promptId)) {
      newSelected.delete(promptId)
    } else if (newSelected.size < 10) {
      newSelected.add(promptId)
    }
    setSelectedPrompts(newSelected)
    
    console.log('🔄 [REVIEW PROMPTS CLIENT] Prompt toggled:', promptId, 'New count:', newSelected.size)
  }

  const handleSelectAll = () => {
    // Select first 10 prompts by template code order (Basic plan limit)
    const sortedPrompts = [...prompts].sort((a, b) => 
      a.source_template_code.localeCompare(b.source_template_code)
    )
    const newSelected = new Set(sortedPrompts.slice(0, 10).map(p => p.id))
    setSelectedPrompts(newSelected)
    console.log('🔄 [REVIEW PROMPTS CLIENT] Selected all (first 10):', newSelected.size)
  }

  const handleDeselectAll = () => {
    setSelectedPrompts(new Set())
    console.log('🔄 [REVIEW PROMPTS CLIENT] Deselected all prompts')
  }

  const handleSubmit = async () => {
    if (selectedPrompts.size === 0) {
      setError('Please select at least 1 prompt to continue.')
      return
    }
    if (selectedPrompts.size > 10) {
      setError('Please select no more than 10 prompts (Basic plan limit).')
      return
    }

    console.log('🚀 [REVIEW PROMPTS CLIENT] Starting prompt selection submission')
    console.log('🚀 [REVIEW PROMPTS CLIENT] Selected prompt IDs:', Array.from(selectedPrompts))

    setIsSubmitting(true)
    setError(null)

    try {
      // Save prompt selections
      console.log('🔄 [REVIEW PROMPTS CLIENT] Calling select prompts API...')
      const response = await fetch('/api/onboarding/prompts/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId: brand.id,
          selectedPromptIds: Array.from(selectedPrompts)
        })
      })

      console.log('📊 [REVIEW PROMPTS CLIENT] Select response status:', response.status)
      const result = await response.json()
      console.log('📊 [REVIEW PROMPTS CLIENT] Select response data:', result)

      if (!result.success) {
        throw new Error(result.error || 'Failed to save prompt selections')
      }

      console.log('✅ [REVIEW PROMPTS CLIENT] Prompt selections saved')

      // Complete onboarding
      console.log('🔄 [REVIEW PROMPTS CLIENT] Calling complete onboarding API...')
      const completeResponse = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId: brand.id
        })
      })

      console.log('📊 [REVIEW PROMPTS CLIENT] Complete response status:', completeResponse.status)
      const completeResult = await completeResponse.json()
      console.log('📊 [REVIEW PROMPTS CLIENT] Complete response data:', completeResult)

      if (!completeResult.success) {
        throw new Error(completeResult.error || 'Failed to complete onboarding')
      }

      console.log('✅ [REVIEW PROMPTS CLIENT] Onboarding completed successfully')
      console.log('🎯 [REVIEW PROMPTS CLIENT] Redirecting to dashboard...')

      // Use router for proper navigation to dashboard
      router.push('/reports/overview?onboarding_completed=true')

    } catch (error) {
      console.error('❌ [REVIEW PROMPTS CLIENT] Error completing prompt selection:', error)
      console.error('❌ [REVIEW PROMPTS CLIENT] Error stack:', error instanceof Error ? error.stack : 'No stack trace')
      setError(error instanceof Error ? error.message : 'An unexpected error occurred. Please try again.')
    } finally {
      console.log('🏁 [REVIEW PROMPTS CLIENT] Submission complete, setIsSubmitting(false)')
      setIsSubmitting(false)
    }
  }

  const selectedCount = selectedPrompts.size
  const canProceed = selectedCount > 0 && selectedCount <= 10

  // Group prompts by category for better organization
  // Separate AI-generated and user-added prompts
  const aiPrompts = prompts.filter(p => !p.source || p.source === 'ai_generated')
  const userPrompts = prompts.filter(p => p.source === 'user_added')
  
  // Group AI prompts by category for display
  const aiPromptsByCategory = aiPrompts.reduce((acc, prompt) => {
    const category = prompt.category || 'Other'
    if (!acc[category]) {
      acc[category] = []
    }
    acc[category].push(prompt)
    return acc
  }, {} as Record<string, BrandPrompt[]>)

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-5xl mx-auto">
        {/* Onboarding-style header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Step 3: Select Your Prompts
          </h1>
          <p className="text-gray-600 mb-6 max-w-2xl mx-auto">
            We've prepared {aiPrompts.length} AI-generated prompts{userPrompts.length > 0 ? ` and ${userPrompts.length} custom prompts` : ''} for <strong>{brand.name}</strong>. 
            Select up to 10 prompts total to power your brand visibility analysis (Basic plan).
          </p>
        </div>

        {/* Compact selection status */}
        <div className="bg-gray-50 border rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className={`text-lg font-bold ${canProceed ? 'text-green-600' : selectedCount > 10 ? 'text-red-600' : 'text-blue-600'}`}>
                {selectedCount} / 10 Selected
              </div>
              {canProceed ? (
                <Badge className="bg-green-500 text-white">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Ready
                </Badge>
              ) : selectedCount === 0 ? (
                <Badge variant="outline" className="text-blue-600 border-blue-300">
                  Select at least 1 prompt
                </Badge>
              ) : selectedCount > 10 ? (
                <Badge variant="outline" className="text-red-600 border-red-300">
                  Remove {selectedCount - 10}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-blue-600 border-blue-300">
                  {10 - selectedCount} more available
                </Badge>
              )}
            </div>
            
            <div className="flex space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSelectAll}
                disabled={isSubmitting}
                className="text-xs"
              >
                Auto-select 10
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDeselectAll}
                disabled={isSubmitting}
                className="text-xs"
              >
                Clear All
              </Button>
            </div>
          </div>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-8">
          {/* AI Generated Prompts Section */}
          {aiPrompts.length > 0 && (
            <div>
              <div className="flex items-center mb-4">
                <div className="flex items-center">
                  <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center mr-3">
                    <span className="text-white text-xs font-bold">✨</span>
                  </div>
                  <h2 className="text-xl font-semibold text-gray-900">
                    AI Suggested Prompts ({aiPrompts.length} generated)
                  </h2>
                </div>
              </div>
              
              <div className="space-y-4">
                {Object.entries(aiPromptsByCategory).map(([category, categoryPrompts]) => (
                  <div key={category}>
                    <h3 className="text-lg font-medium text-gray-900 mb-3 flex items-center">
                      <div className={`w-2 h-2 rounded-full ${getCategoryColor(category)} mr-3`} />
                      {category}
                      <span className="ml-2 text-sm font-normal text-gray-500">
                        ({categoryPrompts.length})
                      </span>
                    </h3>
              
              {/* Compact table-style list */}
              <div className="bg-gray-50 rounded-lg border overflow-hidden">
                {categoryPrompts.map((prompt, index) => {
                  const isSelected = selectedPrompts.has(prompt.id)
                  const canSelect = isSelected || selectedPrompts.size < 10
                  
                  return (
                    <div 
                      key={prompt.id}
                      className={`flex items-center px-4 py-3 cursor-pointer transition-colors ${
                        index !== categoryPrompts.length - 1 ? 'border-b border-gray-200' : ''
                      } ${
                        isSelected 
                          ? 'bg-green-50 hover:bg-green-100' 
                          : canSelect 
                            ? 'hover:bg-white' 
                            : 'opacity-60 cursor-not-allowed bg-gray-100'
                      }`}
                      onClick={() => canSelect && handlePromptToggle(prompt.id)}
                    >
                      {/* Checkbox */}
                      <div className="flex-shrink-0 mr-3">
                        <Checkbox
                          checked={isSelected}
                          disabled={!canSelect}
                          onChange={() => {}}
                          className="h-4 w-4"
                        />
                      </div>
                      
                      {/* Template code badge */}
                      <div className="flex-shrink-0 mr-4">
                        <Badge variant="outline" className="text-xs px-2 py-1 font-mono">
                          {prompt.source_template_code}
                        </Badge>
                      </div>
                      
                      {/* Prompt text - takes remaining space */}
                      <div className="flex-1 min-w-0 mr-4">
                        <p className="text-sm text-gray-700 truncate" title={prompt.improved_prompt || prompt.raw_prompt}>
                          {prompt.improved_prompt || prompt.raw_prompt}
                        </p>
                      </div>
                      
                      {/* Status badge */}
                      <div className="flex-shrink-0 mr-3">
                        <Badge 
                          variant={prompt.status === 'selected' ? 'default' : 'secondary'}
                          className={`text-xs ${prompt.status === 'selected' ? 'bg-green-500' : ''}`}
                        >
                          {prompt.status === 'selected' ? 'Selected' : 
                           prompt.status === 'improved' ? 'Improved' : 'Draft'}
                        </Badge>
                      </div>
                      
                      {/* Selected indicator */}
                      {isSelected && (
                        <div className="flex-shrink-0">
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        </div>
                      )}
                    </div>
                  )
                })}
                  </div>
                </div>
              ))}
              </div>
            </div>
          )}

          {/* Custom Prompts Section */}
          {userPrompts.length > 0 && (
            <div>
              <div className="flex items-center mb-4">
                <div className="flex items-center">
                  <div className="w-6 h-6 rounded-full bg-purple-500 flex items-center justify-center mr-3">
                    <span className="text-white text-xs font-bold">👤</span>
                  </div>
                  <h2 className="text-xl font-semibold text-gray-900">
                    Your Custom Prompts ({userPrompts.length} added)
                  </h2>
                </div>
              </div>
              
              <div className="bg-gray-50 rounded-lg border overflow-hidden">
                {userPrompts.map((prompt, index) => {
                  const isSelected = selectedPrompts.has(prompt.id)
                  const canSelect = isSelected || selectedPrompts.size < 10
                  const hasWarning = prompt.generation_metadata?.hasWarning
                  
                  return (
                    <div 
                      key={prompt.id}
                      className={`flex items-center px-4 py-3 cursor-pointer transition-colors ${
                        index !== userPrompts.length - 1 ? 'border-b border-gray-200' : ''
                      } ${
                        isSelected 
                          ? 'bg-green-50 hover:bg-green-100' 
                          : canSelect 
                            ? 'hover:bg-white' 
                            : 'opacity-60 cursor-not-allowed bg-gray-100'
                      }`}
                      onClick={() => canSelect && handlePromptToggle(prompt.id)}
                    >
                      {/* Checkbox */}
                      <div className="flex-shrink-0 mr-3">
                        <Checkbox
                          checked={isSelected}
                          disabled={!canSelect}
                          onChange={() => {}}
                          className="h-4 w-4"
                        />
                      </div>
                      
                      {/* Custom badge */}
                      <div className="flex-shrink-0 mr-4">
                        <Badge variant="outline" className="text-xs px-2 py-1 bg-purple-50 text-purple-700 border-purple-200">
                          👤 Custom
                        </Badge>
                      </div>
                      
                      {/* Prompt text - takes remaining space */}
                      <div className="flex-1 min-w-0 mr-4">
                        <p className="text-sm text-gray-700 truncate" title={prompt.raw_prompt}>
                          {prompt.raw_prompt}
                        </p>
                        {hasWarning && (
                          <div className="flex items-center gap-1 mt-1">
                            <AlertCircle className="h-3 w-3 text-amber-600" />
                            <span className="text-xs text-amber-700">Contains brand/competitor mention</span>
                          </div>
                        )}
                      </div>
                      
                      {/* Selected indicator */}
                      {isSelected && (
                        <div className="flex-shrink-0">
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Onboarding completion section */}
        <div className="mt-8 border-t pt-6">
          <div className="text-center">
            <p className="text-sm text-gray-600 mb-4">
              {canProceed 
                ? `Perfect! You've selected ${selectedCount} prompt${selectedCount !== 1 ? 's' : ''}. Ready to complete your onboarding?`
                : selectedCount === 0
                  ? 'Please select at least 1 prompt to continue.'
                  : selectedCount > 10
                    ? `Please remove ${selectedCount - 10} prompt${selectedCount - 10 !== 1 ? 's' : ''} (maximum 10 allowed for Basic plan).`
                    : 'You can select more prompts if you want (up to 10 total for Basic plan).'
              }
            </p>
            <Button
              onClick={handleSubmit}
              disabled={!canProceed || isSubmitting}
              size="lg"
              className="px-8 py-3"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Finalizing Setup...
                </>
              ) : (
                <>
                  Complete Onboarding & Go to Dashboard
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
