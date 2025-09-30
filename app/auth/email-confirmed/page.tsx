'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckCircle } from 'lucide-react'
import Link from 'next/link'

export default function EmailConfirmedPage() {
  const [countdown, setCountdown] = useState(8)
  const router = useRouter()

  useEffect(() => {
    // Start countdown immediately
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

    return () => clearInterval(countdownInterval)
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <CheckCircle className="h-16 w-16 text-green-600" />
          </div>
          <CardTitle className="text-3xl text-green-600">Welcome!</CardTitle>
          <CardDescription className="text-lg">
            Your email has been confirmed successfully!
          </CardDescription>
        </CardHeader>

        <CardContent className="text-center space-y-4">
          <div className="space-y-2">
            <div className="text-5xl font-bold text-green-600">{countdown}</div>
            <p className="text-slate-600">Redirecting to your dashboard...</p>
          </div>
          
          <Button asChild className="w-full" size="lg">
            <Link href="/reports/overview">Go to Dashboard Now</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
