'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Loader2, Sparkles } from "lucide-react"
import { ScopeSlides } from './ScopeSlides'

interface ScopeModalProps {
  isOpen: boolean
  onClose: () => void
  domain: string
}

export function ScopeModal({ isOpen, onClose, domain }: ScopeModalProps) {
  const [isGenerating, setIsGenerating] = useState(true)

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setIsGenerating(true)
      // Simulate 5 second generation
      const timer = setTimeout(() => {
        setIsGenerating(false)
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [isOpen])

  const handleDIY = () => {
    alert('DIY option selected - This would download the scope checklist or guide you to implementation resources.')
    onClose()
  }

  const handlePartner = () => {
    alert('Partner option selected - This would connect you with a BeVisible-certified agency partner.')
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-blue-600" />
            Improve {domain} visibility
          </DialogTitle>
        </DialogHeader>

        {/* Body - Loading or Slides */}
        <div className="py-6">
          {isGenerating ? (
            <div className="flex flex-col items-center justify-center py-16 space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
              <div className="text-center">
                <p className="text-lg font-medium text-slate-900">Generating your scope...</p>
                <p className="text-sm text-slate-500 mt-1">
                  Analyzing {domain} influence patterns and gap opportunities
                </p>
              </div>
              {/* Progress indicators */}
              <div className="w-full max-w-md mt-8 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span>Analyzing communities</span>
                  <span className="animate-pulse">●●●</span>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span>Identifying content gaps</span>
                  <span className="animate-pulse">●●●</span>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span>Creating action plan</span>
                  <span className="animate-pulse">●●●</span>
                </div>
              </div>
            </div>
          ) : (
            <ScopeSlides domain={domain} />
          )}
        </div>

        {/* Footer */}
        {!isGenerating && (
          <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:justify-end border-t pt-4">
            <Button
              variant="outline"
              onClick={handleDIY}
              className="w-full sm:w-auto"
            >
              Do it yourself
            </Button>
            <Button
              onClick={handlePartner}
              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700"
            >
              Work with a Partner
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
