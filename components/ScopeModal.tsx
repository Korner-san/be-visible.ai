'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Loader2, Sparkles, Search, CheckCircle, Calendar, ExternalLink } from "lucide-react"
import { ScopeSlides } from './ScopeSlides'
import { PartnerBooking } from './PartnerBooking'

interface ScopeModalProps {
  isOpen: boolean
  onClose: () => void
  domain: string
}

type ViewState = 'generating' | 'slides' | 'searching-partner' | 'partner-found'

export function ScopeModal({ isOpen, onClose, domain }: ScopeModalProps) {
  const [viewState, setViewState] = useState<ViewState>('generating')

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setViewState('generating')
      // Simulate 5 second generation
      const timer = setTimeout(() => {
        setViewState('slides')
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [isOpen])

  const handleDIY = () => {
    alert('DIY option selected - This would download the scope checklist or guide you to implementation resources.')
    onClose()
  }

  const handlePartner = () => {
    setViewState('searching-partner')
    // Simulate 3 second partner search
    setTimeout(() => {
      setViewState('partner-found')
    }, 3000)
  }

  const handleBackToSlides = () => {
    setViewState('slides')
  }

  // Get modal title based on view state
  const getModalTitle = () => {
    switch (viewState) {
      case 'generating':
        return `Improve ${domain} visibility`
      case 'slides':
        return `Improve ${domain} visibility`
      case 'searching-partner':
        return 'Finding Your Partner'
      case 'partner-found':
        return 'Match Found!'
      default:
        return `Improve ${domain} visibility`
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold flex items-center gap-2">
            {viewState === 'searching-partner' && <Search className="h-5 w-5 text-blue-600 animate-pulse" />}
            {viewState === 'partner-found' && <CheckCircle className="h-5 w-5 text-green-600" />}
            {(viewState === 'generating' || viewState === 'slides') && <Sparkles className="h-5 w-5 text-blue-600" />}
            {getModalTitle()}
          </DialogTitle>
        </DialogHeader>

        {/* Body - Different views based on state */}
        <div className="py-6">
          {viewState === 'generating' && (
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
          )}

          {viewState === 'slides' && <ScopeSlides domain={domain} />}

          {viewState === 'searching-partner' && (
            <div className="flex flex-col items-center justify-center py-16 space-y-4">
              <div className="relative">
                <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
                <Search className="h-6 w-6 text-blue-600 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
              </div>
              <div className="text-center">
                <p className="text-lg font-medium text-slate-900">Searching for BeVisible Certified partner...</p>
                <p className="text-sm text-slate-500 mt-1">
                  Matching you with {domain} specialists
                </p>
              </div>
              {/* Search progress */}
              <div className="w-full max-w-md mt-8 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span>Scanning partner network</span>
                  <span className="animate-pulse">●●●</span>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span>Checking expertise & availability</span>
                  <span className="animate-pulse">●●●</span>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span>Finding best match</span>
                  <span className="animate-pulse">●●●</span>
                </div>
              </div>
            </div>
          )}

          {viewState === 'partner-found' && (
            <PartnerBooking domain={domain} onBack={handleBackToSlides} />
          )}
        </div>

        {/* Footer */}
        {viewState === 'slides' && (
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
