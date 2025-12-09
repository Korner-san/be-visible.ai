import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/reports/overview'
  const type = searchParams.get('type') // Supabase adds this for email confirmations

  if (code) {
    const supabase = await createClient()
    
    try {
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      
      if (error) {
        console.error('Auth callback error:', error)
        return NextResponse.redirect(`${origin}/auth/signin?error=${encodeURIComponent(error.message)}`)
      }
      
      // Check if this is an email confirmation
      if (type === 'signup' || type === 'email_change') {
        // This is an email confirmation for a new signup
        // Redirect to loading page to determine next steps
        return NextResponse.redirect(`${origin}/loading`)
      }
      
      // Handle other auth callbacks (like password reset)
      if (searchParams.get('next')) {
        return NextResponse.redirect(`${origin}${next}`)
      }
      
      // Default: redirect to loading page to determine user flow
      return NextResponse.redirect(`${origin}/loading`)
    } catch (err) {
      console.error('Auth callback exception:', err)
      return NextResponse.redirect(`${origin}/auth/signin?error=auth_callback_error`)
    }
  }

  // No code parameter, redirect to sign in
  return NextResponse.redirect(`${origin}/auth/signin?error=missing_auth_code`)
}
