'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { Loader2, Eye, EyeOff } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'

const signInSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional(),
})

type SignInFormData = z.infer<typeof signInSchema>

const saveRememberedEmail = (email: string) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('be-visible-remembered-email', email)
  }
}

const getRememberedEmail = () => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('be-visible-remembered-email')
  }
  return null
}

const clearRememberedEmail = () => {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('be-visible-remembered-email')
  }
}

export default function SignInPage() {
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [rememberMe, setRememberMe] = useState(false)

  const { signIn, user } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<SignInFormData>({
    resolver: zodResolver(signInSchema),
  })

  useEffect(() => {
    const urlMessage = searchParams.get('message')
    if (urlMessage) {
      setMessage(urlMessage)
    }
  }, [searchParams])

  useEffect(() => {
    const savedEmail = getRememberedEmail()
    if (savedEmail) {
      setValue('email', savedEmail)
      setRememberMe(true)
    }
  }, [setValue])

  useEffect(() => {
    if (user) {
      router.push('/setup/onboarding')
    }
  }, [user, router])

  const handleSignIn = async (data: SignInFormData) => {
    setIsLoading(true)
    setError(null)

    try {
      const { error } = await signIn(data.email, data.password, rememberMe)

      if (error) {
        setError(error.message)
      } else {
        if (rememberMe) {
          saveRememberedEmail(data.email)
        } else {
          clearRememberedEmail()
        }
        router.push('/setup/onboarding')
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md animate-fadeIn">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-brand-brown rounded-xl flex items-center justify-center mx-auto mb-4 shadow-sm">
            <span className="text-white font-bold text-xl">B</span>
          </div>
          <h1 className="text-2xl font-bold text-brand-brown">Welcome back</h1>
          <p className="text-sm text-slate-500 mt-1">Sign in to your Be Visible AI account</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
          {message && (
            <div className="mb-6 p-3 bg-brand-50 border border-brand-100 rounded-xl text-sm text-brand-600">
              {message}
            </div>
          )}

          <form onSubmit={handleSubmit(handleSignIn)} className="space-y-5">
            {/* Email */}
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-slate-700">Email</label>
              <input
                id="email"
                type="email"
                placeholder="you@example.com"
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-brown/20 focus:border-brand-brown transition-all"
                {...register('email')}
              />
              {errors.email && (
                <p className="text-xs text-red-500">{errors.email.message}</p>
              )}
            </div>

            {/* Password */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-sm font-medium text-slate-700">Password</label>
                <Link
                  href="/auth/forgot-password"
                  className="text-xs font-medium text-brand-500 hover:text-brand-brown transition-colors"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-brown/20 focus:border-brand-brown transition-all pr-10"
                  {...register('password')}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-xs text-red-500">{errors.password.message}</p>
              )}
            </div>

            {/* Remember Me */}
            <div className="flex items-center gap-2">
              <input
                id="rememberMe"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-brand-brown focus:ring-brand-brown/20 accent-brand-brown"
              />
              <label htmlFor="rememberMe" className="text-sm text-slate-600 cursor-pointer">
                Remember me
              </label>
            </div>

            {/* Error */}
            {error && (
              <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600">
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 px-4 bg-brand-brown text-white font-medium text-sm rounded-xl hover:bg-brand-900 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing In...
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>
        </div>

        {/* Footer link */}
        <p className="text-center text-sm text-slate-500 mt-6">
          Don&apos;t have an account?{' '}
          <Link href="/auth/signup" className="font-medium text-brand-brown hover:text-brand-600 transition-colors">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  )
}
