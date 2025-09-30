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

export function ReviewPromptsScreen({ onComplete, onBack, currentStep, totalSteps, progress }: ReviewPromptsScreenProps) {
  const [customPrompts, setCustomPrompts] = useState<string[]>([])
  const [systemPrompts, setSystemPrompts] = useState<string[]>([])
  const [newPrompt, setNewPrompt] = useState("")
  const [selectedPrompts, setSelectedPrompts] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(true)
  const maxSelections = 15
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
          // Set custom prompts (user can add more)
          setCustomPrompts(data.customPrompts || [])
          
          // Set system prompts (generated from onboarding answers)
          setSystemPrompts(data.systemPrompts || [])
          
          // Pre-select recommended prompts (first 15)
          const recommendedPrompts = (data.systemPrompts || []).slice(0, 15)
          setSelectedPrompts(new Set(recommendedPrompts))
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

  const togglePrompt = (prompt: string) => {
    const newSelected = new Set(selectedPrompts)
    if (newSelected.has(prompt)) {
      newSelected.delete(prompt)
    } else if (newSelected.size < maxSelections) {
      newSelected.add(prompt)
    }
    setSelectedPrompts(newSelected)
  }

  const handleComplete = () => {
    onComplete(Array.from(selectedPrompts))
  }

  const isSelected = (prompt: string) => selectedPrompts.has(prompt)
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
    <div className="min-h-screen bg-background overflow-y-auto">
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
            <p className="text-muted-foreground">
              Choose up to {maxSelections} prompts from your custom prompts and our recommendations (
              {selectedPrompts.size}/{maxSelections} selected)
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

            <div className="space-y-3">
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
            <div className="space-y-3">
              {systemPrompts.map((prompt, index) => (
                <div key={`system-${index}`} className="relative">
                  {index < 15 && (
                    <div className="absolute -left-4 top-4 w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></div>
                  )}
                  <Card
                    className={`p-4 cursor-pointer transition-all duration-200 hover:shadow-md ${
                      isSelected(prompt)
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-border hover:border-primary/50"
                    } ${!canSelect && !isSelected(prompt) ? "opacity-50 cursor-not-allowed" : ""}`}
                    onClick={() => togglePrompt(prompt)}
                  >
                    <p className="text-sm text-foreground leading-relaxed">{prompt}</p>
                  </Card>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" className="flex items-center gap-2" onClick={onBack}>
            <ChevronLeft className="w-4 h-4" />
            Previous
          </Button>

          <Button className="px-8" disabled={selectedPrompts.size === 0} onClick={handleComplete}>
            Complete Setup
          </Button>
        </div>
      </div>
    </div>
  )
}
