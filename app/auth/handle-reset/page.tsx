'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Loader2 } from 'lucide-react'

export default function HandleResetPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  useEffect(() => {
    const handleAuthCallback = async () => {
      // Get all possible parameters
      const code = searchParams.get('code')
      const token_hash = searchParams.get('token_hash')
      const type = searchParams.get('type')
      const access_token = searchParams.get('access_token')
      const refresh_token = searchParams.get('refresh_token')

      console.log('Handle reset params:', { 
        code, 
        token_hash, 
        type, 
        access_token: access_token ? 'present' : 'missing',
        refresh_token: refresh_token ? 'present' : 'missing',
        allParams: Object.fromEntries(searchParams.entries())
      })

      // Handle different auth flows
      if (access_token && refresh_token && type === 'recovery') {
        // Direct token flow (older Supabase versions)
        try {
          const { data, error } = await supabase.auth.setSession({
            access_token,
            refresh_token
          })
          
          if (error) {
            console.error('Set session error:', error)
            router.push(`/auth/reset-password?error=${encodeURIComponent(error.message)}`)
          } else {
            console.log('Session set successful, redirecting to reset password')
            router.push('/auth/reset-password?verified=true')
          }
        } catch (err) {
          console.error('Set session exception:', err)
          router.push('/auth/reset-password?error=session_error')
        }
      } else if (token_hash && type === 'recovery') {
        // Legacy OTP flow
        try {
          const { data, error } = await supabase.auth.verifyOtp({
            token_hash,
            type: 'recovery'
          })
          
          if (error) {
            console.error('OTP verification error:', error)
            router.push(`/auth/reset-password?error=${encodeURIComponent(error.message)}`)
          } else {
            console.log('OTP verification successful, redirecting to reset password')
            router.push('/auth/reset-password?verified=true')
          }
        } catch (err) {
          console.error('OTP verification exception:', err)
          router.push('/auth/reset-password?error=invalid_token')
        }
      } else if (code) {
        // PKCE flow - this requires the code verifier which should be handled automatically
        try {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code)
          
          if (error) {
            console.error('Exchange code error:', error)
            // If PKCE fails, try to handle it as a simple redirect with the code
            router.push(`/auth/reset-password?code=${code}`)
          } else {
            console.log('Code exchange successful, redirecting to reset password')
            router.push('/auth/reset-password?verified=true')
          }
        } catch (err) {
          console.error('Code exchange exception:', err)
          // Fallback: pass the code to reset-password page
          router.push(`/auth/reset-password?code=${code}`)
        }
      } else {
        // No valid parameters, redirect to forgot password
        console.log('No valid auth parameters found')
        router.push('/auth/forgot-password?error=invalid_reset_link')
      }
    }

    handleAuthCallback()
  }, [searchParams, supabase.auth, router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
        <p className="text-slate-600">Processing reset link...</p>
      </div>
    </div>
  )
}
