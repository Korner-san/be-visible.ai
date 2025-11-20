'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { RefreshCw, CheckCircle, Circle, Edit3, Wand2, Save, Loader2 } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
// import { completeOnboardingAction } from '../actions' // Replaced with API route

interface BrandPrompt {
  id: string
  brand_id: string
  source_template_code: string
  raw_prompt: string
  improved_prompt?: string
  status: 'draft' | 'improved' | 'selected' | 'archived'
  notes?: string
  created_at: string
  updated_at: string
}

interface PromptReviewClientProps {
  userState: any
}

export function PromptReviewClient({ userState }: PromptReviewClientProps) {
  const router = useRouter()
  const [prompts, setPrompts] = useState<BrandPrompt[]>([])
  const [selectedPrompts, setSelectedPrompts] = useState<Set<string>>(new Set())
  const [editingPrompts, setEditingPrompts] = useState<Set<string>>(new Set())
  const [editedContent, setEditedContent] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [lastClickTime, setLastClickTime] = useState(0)
  const [generatingPrompts, setGeneratingPrompts] = useState(false)
  const [improvingPrompts, setImprovingPrompts] = useState(false)
  const [activeTab, setActiveTab] = useState('all')
  const [brandName, setBrandName] = useState('')
  const [brandId, setBrandId] = useState<string>('')

  // Load prompts on component mount
  useEffect(() => {
    loadPrompts()
  }, [])

  const loadPrompts = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/onboarding/prompts')
      const data = await response.json()
      
      if (data.success) {
        setPrompts(data.prompts)
        setBrandName(data.brandName)
        setBrandId(data.brandId)
        
        // Auto-select improved prompts by default
        const improvedPromptIds = data.prompts
          .filter((p: BrandPrompt) => p.status === 'improved')
          .map((p: BrandPrompt) => p.id)
        setSelectedPrompts(new Set(improvedPromptIds))
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to load prompts",
          variant: "destructive"
        })
      }
    } catch (error) {
      console.error('Error loading prompts:', error)
      toast({
        title: "Error",
        description: "Failed to load prompts",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const generatePrompts = async () => {
    try {
      setGeneratingPrompts(true)
      const response = await fetch('/api/onboarding/generate-prompts', {
        method: 'POST'
      })
      const data = await response.json()
      
      if (data.success) {
        toast({
          title: "Success",
          description: `Generated ${data.newPrompts} new prompts (${data.totalPrompts} total)`
        })
        await loadPrompts()
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to generate prompts",
          variant: "destructive"
        })
      }
    } catch (error) {
      console.error('Error generating prompts:', error)
      toast({
        title: "Error",
        description: "Failed to generate prompts",
        variant: "destructive"
      })
    } finally {
      setGeneratingPrompts(false)
    }
  }

  const improvePrompts = async () => {
    try {
      setImprovingPrompts(true)
      const response = await fetch('/api/onboarding/improve-prompts', {
        method: 'POST'
      })
      const data = await response.json()
      
      if (data.success) {
        toast({
          title: "Success",
          description: `Improved ${data.improvedCount} prompts`
        })
        await loadPrompts()
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to improve prompts",
          variant: "destructive"
        })
      }
    } catch (error) {
      console.error('Error improving prompts:', error)
      toast({
        title: "Error",
        description: "Failed to improve prompts",
        variant: "destructive"
      })
    } finally {
      setImprovingPrompts(false)
    }
  }

  const togglePromptSelection = (promptId: string) => {
    const newSelected = new Set(selectedPrompts)
    if (newSelected.has(promptId)) {
      newSelected.delete(promptId)
    } else {
      newSelected.add(promptId)
    }
    setSelectedPrompts(newSelected)
  }

  const toggleAllSelection = () => {
    if (selectedPrompts.size === prompts.length) {
      setSelectedPrompts(new Set())
    } else {
      setSelectedPrompts(new Set(prompts.map(p => p.id)))
    }
  }

  const startEditing = (promptId: string, currentContent: string) => {
    setEditingPrompts(new Set([...editingPrompts, promptId]))
    setEditedContent({ ...editedContent, [promptId]: currentContent })
  }

  const saveEdit = async (promptId: string) => {
    try {
      setSaving(true)
      const response = await fetch('/api/onboarding/prompts/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          promptId,
          improvedPrompt: editedContent[promptId]
        })
      })
      
      const data = await response.json()
      if (data.success) {
        // Update local state
        setPrompts(prompts.map(p => 
          p.id === promptId 
            ? { ...p, improved_prompt: editedContent[promptId] }
            : p
        ))
        
        // Stop editing
        const newEditing = new Set(editingPrompts)
        newEditing.delete(promptId)
        setEditingPrompts(newEditing)
        
        toast({
          title: "Success",
          description: "Prompt updated successfully"
        })
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to update prompt",
          variant: "destructive"
        })
      }
    } catch (error) {
      console.error('Error saving edit:', error)
      toast({
        title: "Error",
        description: "Failed to save changes",
        variant: "destructive"
      })
    } finally {
      setSaving(false)
    }
  }

  const saveSelections = async () => {
    try {
      setSaving(true)
      const response = await fetch('/api/onboarding/prompts/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId,
          selectedPromptIds: Array.from(selectedPrompts)
        })
      })
      
      const data = await response.json()
      if (data.success) {
        toast({
          title: "Success",
          description: `Selected ${selectedPrompts.size} prompts`
        })
        await loadPrompts()
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to save selections",
          variant: "destructive"
        })
      }
    } catch (error) {
      console.error('Error saving selections:', error)
      toast({
        title: "Error",
        description: "Failed to save selections",
        variant: "destructive"
      })
    } finally {
      setSaving(false)
    }
  }

  const completeOnboarding = async () => {
    const now = Date.now()
    
    // Debounce rapid clicks (prevent double-submit within 2 seconds)
    if (now - lastClickTime < 2000) {
      console.log('❌ [CLIENT] Ignoring rapid click (debounced)')
      return
    }
    setLastClickTime(now)
    
    console.log('🔄 [CLIENT] Complete button clicked')
    console.log('🔄 [CLIENT] Timestamp:', new Date().toISOString())
    
    if (selectedPrompts.size < 15) {
      console.log('❌ [CLIENT] Not enough prompts selected:', selectedPrompts.size)
      toast({
        title: "Selection Required",
        description: "Please select at least 15 prompts to continue",
        variant: "destructive"
      })
      return
    }

    // Prevent double execution if already completing
    if (completing) {
      console.log('❌ [CLIENT] Already completing, ignoring click')
      return
    }

    try {
      setCompleting(true)
      console.log('🔄 [CLIENT] Starting completion process...')
      
      // First save selections
      console.log('🔄 [CLIENT] Saving selections...')
      await saveSelections()
      
      // Then complete onboarding using API route instead of server action
      console.log('🔄 [CLIENT] Calling completion API...')
      const completeResponse = await fetch('/api/onboarding/complete-final', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      
      const completeResult = await completeResponse.json()
      console.log('🔄 [CLIENT] Completion API result:', completeResult)
      
      if (completeResult.success) {
        console.log('✅ [CLIENT] Onboarding completed successfully, redirecting...')
        window.location.href = '/finishing'
      } else {
        throw new Error(completeResult.error || 'Failed to complete onboarding')
      }
      
      console.log('❌ [CLIENT] This should NOT run - server action should have redirected!')
      console.log('❌ [CLIENT] Server action completed without redirect - this indicates an error')
    } catch (error) {
      console.error('❌ [CLIENT] Error completing onboarding:', error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to complete onboarding",
        variant: "destructive"
      })
      setCompleting(false)
    }
  }

  const filteredPrompts = prompts.filter(prompt => {
    switch (activeTab) {
      case 'draft':
        return prompt.status === 'draft'
      case 'improved':
        return prompt.status === 'improved'
      case 'selected':
        return selectedPrompts.has(prompt.id)
      default:
        return true
    }
  })

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft':
        return 'bg-yellow-500'
      case 'improved':
        return 'bg-blue-500'
      case 'selected':
        return 'bg-green-500'
      default:
        return 'bg-gray-500'
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading prompts...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto p-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Review & Select Prompts
          </h1>
          <p className="text-gray-600">
            Review the generated prompts for <strong>{brandName}</strong> and select which ones to use for your brand analysis.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-4 mb-6">
          <Button 
            onClick={generatePrompts}
            disabled={generatingPrompts}
            variant="outline"
          >
            {generatingPrompts ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Generate Prompts
          </Button>
          
          <Button 
            onClick={improvePrompts}
            disabled={improvingPrompts}
            variant="outline"
          >
            {improvingPrompts ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Wand2 className="h-4 w-4 mr-2" />}
            Improve Prompts
          </Button>
          
          <Button 
            onClick={saveSelections}
            disabled={saving}
            variant="outline"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Save Selections
          </Button>
        </div>

        {/* Selection Summary */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Selection Summary</span>
              <Button
                onClick={toggleAllSelection}
                variant="outline"
                size="sm"
              >
                {selectedPrompts.size === prompts.length ? 'Deselect All' : 'Select All'}
              </Button>
            </CardTitle>
            <CardDescription>
              {selectedPrompts.size} of {prompts.length} prompts selected 
              {selectedPrompts.size < 15 && (
                <span className="text-red-600 ml-2">
                  (minimum 15 required)
                </span>
              )}
            </CardDescription>
          </CardHeader>
        </Card>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
          <TabsList>
            <TabsTrigger value="all">All ({prompts.length})</TabsTrigger>
            <TabsTrigger value="draft">
              Draft ({prompts.filter(p => p.status === 'draft').length})
            </TabsTrigger>
            <TabsTrigger value="improved">
              Improved ({prompts.filter(p => p.status === 'improved').length})
            </TabsTrigger>
            <TabsTrigger value="selected">
              Selected ({selectedPrompts.size})
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Prompts List */}
        <div className="space-y-4 mb-8">
          {filteredPrompts.map((prompt) => (
            <Card key={prompt.id} className="relative">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <Checkbox
                      checked={selectedPrompts.has(prompt.id)}
                      onCheckedChange={() => togglePromptSelection(prompt.id)}
                    />
                    <div>
                      <Badge variant="outline" className={`${getStatusColor(prompt.status)} text-white`}>
                        {prompt.source_template_code}
                      </Badge>
                      <Badge variant="secondary" className="ml-2">
                        {prompt.status}
                      </Badge>
                    </div>
                  </div>
                  <Button
                    onClick={() => startEditing(prompt.id, prompt.improved_prompt || prompt.raw_prompt)}
                    variant="ghost"
                    size="sm"
                    disabled={editingPrompts.has(prompt.id)}
                  >
                    <Edit3 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              
              <CardContent className="pt-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Raw Prompt */}
                  <div>
                    <h4 className="font-medium text-gray-700 mb-2">Original Prompt</h4>
                    <div className="bg-gray-50 p-3 rounded text-sm text-gray-600">
                      {prompt.raw_prompt}
                    </div>
                  </div>
                  
                  {/* Improved Prompt */}
                  <div>
                    <h4 className="font-medium text-gray-700 mb-2">Improved Prompt</h4>
                    {editingPrompts.has(prompt.id) ? (
                      <div className="space-y-2">
                        <Textarea
                          value={editedContent[prompt.id] || ''}
                          onChange={(e) => setEditedContent({
                            ...editedContent,
                            [prompt.id]: e.target.value
                          })}
                          className="min-h-[100px]"
                        />
                        <div className="flex space-x-2">
                          <Button
                            onClick={() => saveEdit(prompt.id)}
                            size="sm"
                            disabled={saving}
                          >
                            Save
                          </Button>
                          <Button
                            onClick={() => {
                              const newEditing = new Set(editingPrompts)
                              newEditing.delete(prompt.id)
                              setEditingPrompts(newEditing)
                            }}
                            variant="outline"
                            size="sm"
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-blue-50 p-3 rounded text-sm">
                        {prompt.improved_prompt || (
                          <span className="text-gray-500 italic">
                            Not improved yet - click "Improve Prompts" above
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Complete Onboarding */}
        <div className="flex justify-end">
          <Button
            onClick={completeOnboarding}
            disabled={completing || selectedPrompts.size < 15}
            size="lg"
            className="bg-primary hover:bg-primary/90"
          >
            {completing ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <CheckCircle className="h-4 w-4 mr-2" />
            )}
            Complete Onboarding ({selectedPrompts.size} selected)
          </Button>
        </div>
      </div>
    </div>
  )
}
