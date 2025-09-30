'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { CheckCircle, XCircle, Loader2 } from 'lucide-react'
import Link from 'next/link'

export default function ConfirmEmailPage() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')
  const [countdown, setCountdown] = useState(8)
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useAuth()

  useEffect(() => {
    const confirmEmail = async () => {
      const confirmed = searchParams.get('confirmed')
      const tokenHash = searchParams.get('token_hash')
      const type = searchParams.get('type')
      
      if (!confirmed || !tokenHash || type !== 'signup') {
        setStatus('error')
        setMessage('Invalid confirmation link')
        return
      }

      // Show loading for 2 seconds first
      setTimeout(() => {
        // Assume the email is confirmed if we got here with the right parameters
        setStatus('success')
        setMessage('Your email has been confirmed successfully!')
        
        // Start countdown timer
        const countdownInterval = setInterval(() => {
          setCountdown((prev) => {
            if (prev <= 1) {
              clearInterval(countdownInterval)
              router.push('/reports/overview')
              return 0
            }
            return prev - 1
          })
        }, 1000)
      }, 2000)
    }

    confirmEmail()
  }, [searchParams, router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            {status === 'loading' && <Loader2 className="h-12 w-12 animate-spin text-blue-600" />}
            {status === 'success' && <CheckCircle className="h-12 w-12 text-green-600" />}
            {status === 'error' && <XCircle className="h-12 w-12 text-red-600" />}
          </div>
          
          <CardTitle className="text-2xl">
            {status === 'loading' && 'Confirming Email...'}
            {status === 'success' && 'Email Confirmed!'}
            {status === 'error' && 'Confirmation Failed'}
          </CardTitle>
          
          <CardDescription>
            {status === 'loading' && 'Please wait while we confirm your email address.'}
            {status === 'success' && `Redirecting you to your dashboard in ${countdown} seconds...`}
            {status === 'error' && 'There was an issue confirming your email.'}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {message && (
            <Alert className={status === 'error' ? 'border-red-200' : 'border-green-200'}>
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          )}

          {status === 'error' && (
            <div className="mt-4 space-y-2">
              <Button asChild className="w-full">
                <Link href="/auth/signin">Try Signing In</Link>
              </Button>
              <Button asChild variant="outline" className="w-full">
                <Link href="/auth/signup">Create New Account</Link>
              </Button>
            </div>
          )}

          {status === 'success' && (
            <div className="mt-4 space-y-3">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600 mb-2">{countdown}</div>
                <p className="text-sm text-slate-600">seconds remaining</p>
              </div>
              <Button asChild className="w-full">
                <Link href="/reports/overview">Go to Dashboard Now</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
