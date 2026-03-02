'use client'

import { useEffect, useState, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { Loader2, X } from 'lucide-react'

const POLL_INTERVAL_MS = 5 * 60 * 1000  // 5 minutes

// Only show on the 5 main report tab pages
const REPORT_TAB_PATHS = [
  '/reports/visibility',
  '/reports/citations',
  '/reports/competitors',
  '/reports/improve',
  '/reports/prompts',
]

export function PartialReportBanner() {
  const pathname = usePathname()
  const [visible, setVisible] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  // Only render on the specific report tab pages
  const isReportPage = REPORT_TAB_PATHS.some(p => pathname === p || pathname?.startsWith(p + '/'))

  const check = useCallback(async () => {
    if (dismissed || !isReportPage) return
    try {
      const res = await fetch('/api/onboarding/status')
      if (!res.ok) return
      const data = await res.json()
      if (!data.success) return

      const { firstReportStatus, isPartial } = data

      // Show when Phase 2 is running (phase1_complete + isPartial)
      // Auto-hide when succeeded or is_partial becomes false
      setVisible(firstReportStatus === 'phase1_complete' && isPartial === true)
    } catch {
      // Ignore transient errors — keep current visibility state
    }
  }, [dismissed, isReportPage])

  useEffect(() => {
    check()
    const interval = setInterval(check, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [check])

  if (!isReportPage || !visible || dismissed) return null

  return (
    <div className="w-full bg-amber-50 border-b border-amber-200 px-5 py-2.5 flex items-center justify-between gap-4">
      <div className="flex items-center gap-2.5 text-sm text-amber-800">
        <Loader2 className="w-4 h-4 flex-shrink-0 animate-spin text-amber-600" />
        <span>
          We&rsquo;re still working on your report &mdash; more data is being added in the background and will appear automatically.
        </span>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="flex-shrink-0 text-amber-500 hover:text-amber-800 transition-colors"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
