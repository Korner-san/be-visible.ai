'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertTriangle, RefreshCw } from 'lucide-react'

export default function OnboardingError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log the error for debugging
    console.error('Onboarding error:', error)
  }, [error])

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-6 h-6 text-destructive" />
          </div>
          <CardTitle className="text-xl">Onboarding Error</CardTitle>
          <CardDescription>
            Something went wrong during the onboarding process
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <Alert variant="destructive">
            <AlertDescription>
              {error.message || 'An unexpected error occurred while setting up your onboarding.'}
            </AlertDescription>
          </Alert>

          <div className="space-y-3">
            <Button 
              onClick={reset}
              className="w-full"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Try Again
            </Button>
            
            <Button 
              variant="outline"
              onClick={() => window.location.href = '/auth/signin'}
              className="w-full"
            >
              Back to Sign In
            </Button>
          </div>

          {process.env.NODE_ENV === 'development' && (
            <div className="mt-4 p-3 bg-muted rounded-lg">
              <p className="text-xs font-mono text-muted-foreground">
                <strong>Dev Error:</strong> {error.message}
                {error.digest && <><br /><strong>Digest:</strong> {error.digest}</>}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
