"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent } from "@/components/ui/card"
import { InfoIcon, CheckCircle2, Edit3, Zap, ChevronDown } from "lucide-react"

interface OnboardingConsentProps {
  onContinue: () => void
  currentStep: number
  totalSteps: number
  progress: number
}

export function OnboardingConsent({ onContinue, currentStep, totalSteps, progress }: OnboardingConsentProps) {
  const [isChecked, setIsChecked] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const router = useRouter()

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-3 overflow-y-auto">
      <div className="w-full max-w-2xl py-8">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <button 
            onClick={() => router.push('/auth/signin')}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Back to Sign In
          </button>
          <span className="text-sm text-muted-foreground">{Math.round(progress)}% Complete</span>
        </div>

        {/* Main Card */}
        <Card className="p-6 md:p-8">
          <CardContent className="p-0">
            {/* Title Section */}
            <div className="mb-4">
              <h1 className="text-xl md:text-2xl font-semibold mb-1 text-balance leading-tight">
                We've pre-filled your answers. Now help us make them perfect.
              </h1>
              <p className="text-sm text-muted-foreground">Step {currentStep} of {totalSteps}</p>
            </div>

            {/* Progress Bar */}
            <div className="mb-6">
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-foreground rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
            </div>

            {/* Main Content */}
            <div className="space-y-4 mb-6">
              {/* Brief Explanation */}
              <p className="text-sm text-foreground leading-normal">
                Based on your website, we've automatically filled in answers about your brand. On the next screens, you'll
                review and refine these answers.
              </p>

              <div className="border border-border rounded-lg overflow-hidden">
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors text-left"
                >
                  <span className="text-sm font-medium text-foreground">Learn more about this process</span>
                  <ChevronDown
                    className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`}
                  />
                </button>

                {isExpanded && (
                  <div className="p-4 pt-0 space-y-4 border-t border-border">
                    {/* Detailed Explanation */}
                    <div className="space-y-3">
                      <p className="text-sm text-foreground leading-normal">Please take a moment to:</p>
                      <ul className="space-y-2 ml-4">
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="w-4 h-4 text-foreground mt-0.5 flex-shrink-0" />
                          <span className="text-sm text-foreground leading-normal">Review each answer carefully</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Edit3 className="w-4 h-4 text-foreground mt-0.5 flex-shrink-0" />
                          <span className="text-sm text-foreground leading-normal">
                            Edit anything that's not accurate or complete
                          </span>
                        </li>
                      </ul>
                    </div>

                    {/* Why It Matters Section */}
                    <Card className="bg-muted/50 border-border p-4">
                      <div className="flex gap-2">
                        <Zap className="w-4 h-4 text-foreground mt-0.5 flex-shrink-0" />
                        <div className="space-y-2">
                          <h3 className="text-sm font-semibold text-foreground">Why this matters</h3>
                          <p className="text-xs text-foreground leading-normal">
                            Your confirmed answers will be used to generate up to 15 smart prompts, which will be asked to
                            AI models every day.
                          </p>
                          <p className="text-xs text-foreground leading-normal">
                            These daily responses will become part of your visibility report — showing how your brand
                            appears across the web, how it compares to competitors, and which content influences AI
                            results.
                          </p>
                        </div>
                      </div>
                    </Card>

                    {/* Control Message */}
                    <div className="bg-muted/30 border border-border rounded-lg p-3">
                      <div className="flex gap-2">
                        <InfoIcon className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-muted-foreground leading-normal">
                          You can edit your answers later from your dashboard, and you can change your selected prompts at
                          any time.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Consent Checkbox */}
            <div className="mb-5">
              <label className="flex items-start gap-3 cursor-pointer group">
                <Checkbox
                  id="consent"
                  checked={isChecked}
                  onCheckedChange={(checked) => setIsChecked(checked === true)}
                  className="mt-0.5"
                />
                <span className="text-sm text-foreground leading-normal select-none group-hover:text-foreground/80 transition-colors">
                  I've read and understand how my answers will shape my AI prompts and visibility reports. I know I can
                  edit them later.
                </span>
              </label>
            </div>

            {/* CTA Button */}
            <Button size="lg" disabled={!isChecked} className="w-full md:w-auto px-8" onClick={onContinue}>
              Start reviewing answers
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
