'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface FinishingClientProps {
  brandName: string
  brandId: string
}

const POLL_INTERVAL_MS = 10_000    // 10 s between polls
const TIMEOUT_MS = 25 * 60 * 1000 // 25 min before showing timeout UI

type Status = 'working' | 'almost' | 'redirecting' | 'timeout'

export function FinishingClient({ brandName }: FinishingClientProps) {
  const router = useRouter()
  const [status, setStatus] = useState<Status>('working')
  const startTimeRef = useRef(Date.now())
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const redirectedRef = useRef(false)

  const poll = useCallback(async () => {
    if (Date.now() - startTimeRef.current > TIMEOUT_MS) {
      if (pollingRef.current) clearInterval(pollingRef.current)
      setStatus('timeout')
      return
    }

    try {
      const res = await fetch('/api/onboarding/status')
      if (!res.ok) return
      const data = await res.json()
      if (!data.success) return

      const { firstReportStatus, wave1Complete: w1, wave1Total: w1Total } = data

      if (!redirectedRef.current && (firstReportStatus === 'phase1_complete' || firstReportStatus === 'succeeded')) {
        redirectedRef.current = true
        setStatus('redirecting')
        if (pollingRef.current) clearInterval(pollingRef.current)
        router.push('/reports/visibility?onboarding_completed=true')
        return
      }

      // Wave 1 queries done, EOD calculating score (use actual wave1Total — V2=5, V1=6)
      setStatus((w1 ?? 0) >= (w1Total ?? 5) ? 'almost' : 'working')
    } catch {
      // Keep current status on transient errors
    }
  }, [router])

  useEffect(() => {
    poll()
    pollingRef.current = setInterval(poll, POLL_INTERVAL_MS)
    return () => { if (pollingRef.current) clearInterval(pollingRef.current) }
  }, [poll])

  const handleRetry = () => {
    setStatus('working')
    startTimeRef.current = Date.now()
    redirectedRef.current = false
    pollingRef.current = setInterval(poll, POLL_INTERVAL_MS)
    poll()
  }

  // ── Timeout screen ───────────────────────────────────────────────────────
  if (status === 'timeout') {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-6">
        <div className="text-center max-w-sm space-y-6">
          <div className="mx-auto w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center">
            <AlertCircle className="w-7 h-7 text-amber-500" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-semibold text-gray-900">Still working on it</h1>
            <p className="text-gray-500 text-sm">
              This is taking a bit longer than usual. Your report is still being prepared — click below to keep waiting.
            </p>
          </div>
          <Button onClick={handleRetry} className="w-full">
            Keep waiting
          </Button>
        </div>
      </div>
    )
  }

  // ── Content per status ───────────────────────────────────────────────────
  const content: Record<Exclude<Status, 'timeout'>, { heading: string; sub: string }> = {
    working: {
      heading: `We're working on your report`,
      sub: `This usually takes a few minutes. We'll take you straight to your dashboard when it's ready.`,
    },
    almost: {
      heading: `Almost there`,
      sub: `We're putting the finishing touches on your report — won't be long now.`,
    },
    redirecting: {
      heading: `Your report is ready!`,
      sub: 'Taking you to your dashboard…',
    },
  }

  const { heading, sub } = content[status]

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-6">
      <div className="text-center max-w-sm space-y-8">

        {/* Animated loader */}
        <div className="flex justify-center">
          {status === 'redirecting' ? (
            /* Solid filled circle when done */
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
          ) : (
            /* Spinning ring while working */
            <div className="relative w-16 h-16">
              <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                <circle cx="32" cy="32" r="28" fill="none" stroke="#e5e7eb" strokeWidth="4" />
                <circle
                  cx="32" cy="32" r="28"
                  fill="none"
                  stroke={status === 'almost' ? '#f59e0b' : '#6366f1'}
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray="175.9"
                  strokeDashoffset={status === 'almost' ? '44' : '110'}
                  className="transition-all duration-700"
                />
              </svg>
            </div>
          )}
        </div>

        {/* Text */}
        <div className="space-y-3">
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">
            {heading}
          </h1>
          <p className="text-gray-500 text-sm leading-relaxed">{sub}</p>
          {status !== 'redirecting' && (
            <p className="text-xs text-gray-400 pt-1">
              for <span className="font-medium text-gray-500">{brandName}</span>
            </p>
          )}
        </div>

        {/* Three pulsing dots — only during active work */}
        {(status === 'working' || status === 'almost') && (
          <div className="flex justify-center gap-1.5">
            {[0, 1, 2].map(i => (
              <span
                key={i}
                className="w-2 h-2 rounded-full bg-gray-300 animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
        )}

      </div>
    </div>
  )
}
