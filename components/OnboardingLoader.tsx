'use client'

import CircularText from './CircularText'

interface OnboardingLoaderProps {
  message?: string
  className?: string
}

export default function OnboardingLoader({ 
  message = "Setting up your brand...", 
  className = "" 
}: OnboardingLoaderProps) {
  return (
    <div className={`min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center ${className}`}>
      <div className="text-center">
        {/* Animated be-visible text */}
        <div className="mb-8">
          <CircularText
            text="BE*VISIBLE*AI*"
            onHover="speedUp"
            spinDuration={8}
            className="text-blue-600"
          />
        </div>
        
        {/* Loading message */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-gray-800">
            {message}
          </h2>
          
          {/* Simple loading dots */}
          <div className="flex justify-center space-x-1">
            <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse"></div>
            <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
            <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
          </div>
        </div>
      </div>
    </div>
  )
}
