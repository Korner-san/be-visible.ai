'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, CheckCircle, Clock, Loader2, RefreshCw, Zap } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

interface ChatGPTAccount {
  email: string
  account_type: string
  status: string
  session_health_status: string
  browserless_session_expires_at: string | null
  last_connection_at: string | null
  total_connections: number
  cookie_expiration_dates: Record<string, string> | null
  last_successful_extraction_at: string | null
  last_failure_at: string | null
  last_failure_reason: string | null
  total_successful_extractions: number
  total_failures: number
  hasSession: boolean
  daysUntilExpiry: number | null
  daysSinceLastConnection: number | null
}

interface InitializationResult {
  success: boolean
  message: string
  data?: {
    email: string
    accountType: string
    sessionId: string
    sessionExpiresAt: string
    daysUntilExpiry: number
    sessionHealthStatus: string
    cookieExpirations: Record<string, string>
    totalConnections: number
  }
  error?: string
}

const getHealthBadge = (status: string) => {
  switch (status) {
    case 'healthy':
      return <Badge className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" />Healthy</Badge>
    case 'expiring_soon':
      return <Badge className="bg-yellow-500"><Clock className="w-3 h-3 mr-1" />Expiring Soon</Badge>
    case 'expired':
      return <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" />Expired</Badge>
    case 'unknown':
      return <Badge variant="secondary">Unknown</Badge>
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

const getAccountTypeBadge = (type: string) => {
  switch (type) {
    case 'plus':
      return <Badge className="bg-blue-500">Plus (Paid)</Badge>
    case 'pro':
      return <Badge className="bg-purple-500">Pro</Badge>
    case 'free':
      return <Badge variant="outline">Free</Badge>
    default:
      return <Badge variant="outline">{type}</Badge>
  }
}

export default function ChatGPTSessionsPage() {
  const [accounts, setAccounts] = useState<ChatGPTAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [initializing, setInitializing] = useState<string | null>(null)
  const [result, setResult] = useState<InitializationResult | null>(null)

  const fetchAccounts = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/admin/initialize-chatgpt-session')
      const data = await response.json()
      
      if (data.success && data.accounts) {
        setAccounts(data.accounts)
      }
    } catch (error) {
      console.error('Failed to fetch accounts:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAccounts()
  }, [])

  const handleInitialize = async (email: string) => {
    setInitializing(email)
    setResult(null)

    try {
      const response = await fetch('/api/admin/initialize-chatgpt-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      })

      const data = await response.json()
      setResult(data)

      if (data.success) {
        // Refresh accounts list
        await fetchAccounts()
      }
    } catch (error) {
      setResult({
        success: false,
        message: 'Failed to initialize session',
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    } finally {
      setInitializing(null)
    }
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">ChatGPT Session Management</h1>
        <p className="text-muted-foreground">
          Initialize and monitor 30-day persistent Browserless sessions for ChatGPT automation
        </p>
      </div>

      {result && (
        <Alert className={result.success ? 'border-green-500' : 'border-red-500'} variant={result.success ? 'default' : 'destructive'}>
          {result.success ? (
            <CheckCircle className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          <AlertTitle>{result.success ? 'Success' : 'Error'}</AlertTitle>
          <AlertDescription>
            {result.message}
            {result.data && (
              <div className="mt-4 space-y-2 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <strong>Session ID:</strong>
                    <br />
                    <code className="text-xs">{result.data.sessionId.substring(0, 32)}...</code>
                  </div>
                  <div>
                    <strong>Expires:</strong>
                    <br />
                    {new Date(result.data.sessionExpiresAt).toLocaleDateString()} ({result.data.daysUntilExpiry} days)
                  </div>
                </div>
                <div>
                  <strong>Health Status:</strong> {getHealthBadge(result.data.sessionHealthStatus)}
                </div>
              </div>
            )}
            {result.error && (
              <div className="mt-2 text-sm text-red-600">
                {result.error}
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Available Accounts ({accounts.length})</h2>
        <Button onClick={fetchAccounts} variant="outline" size="sm" disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2">
          {accounts.map((account) => (
            <Card key={account.email}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg">{account.email}</CardTitle>
                    <CardDescription className="flex gap-2 mt-2">
                      {getAccountTypeBadge(account.account_type)}
                      {getHealthBadge(account.session_health_status)}
                    </CardDescription>
                  </div>
                  <Badge variant={account.status === 'active' ? 'default' : 'secondary'}>
                    {account.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {account.hasSession ? (
                    <>
                      {/* Session Info */}
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <div className="text-muted-foreground">Session Expires</div>
                          <div className="font-medium">
                            {account.daysUntilExpiry !== null ? (
                              <span className={account.daysUntilExpiry < 7 ? 'text-yellow-600' : 'text-green-600'}>
                                {account.daysUntilExpiry} days
                              </span>
                            ) : 'N/A'}
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Last Connection</div>
                          <div className="font-medium text-xs">
                            {account.last_connection_at 
                              ? new Date(account.last_connection_at).toLocaleString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })
                              : 'Never'}
                          </div>
                        </div>
                      </div>

                      {/* Cookie Expiration Dates */}
                      {account.cookie_expiration_dates && (
                        <div className="border-t pt-3">
                          <div className="text-xs font-semibold text-muted-foreground mb-2">Cookie Expiration Dates</div>
                          <div className="space-y-1 text-xs">
                            {Object.entries(account.cookie_expiration_dates).map(([cookie, expiry]) => {
                              const expiryDate = new Date(expiry)
                              const daysUntil = Math.floor((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                              const isExpiringSoon = daysUntil < 2
                              
                              return (
                                <div key={cookie} className="flex justify-between items-center">
                                  <span className="text-muted-foreground truncate" title={cookie}>
                                    {cookie.replace('__Secure-next-auth.', '').replace('__Host-next-auth.', '')}
                                  </span>
                                  <span className={isExpiringSoon ? 'text-red-600 font-medium' : ''}>
                                    {expiryDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                    {isExpiringSoon && ' ⚠️'}
                                  </span>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {/* Extraction Statistics */}
                      <div className="border-t pt-3">
                        <div className="text-xs font-semibold text-muted-foreground mb-2">Extraction Statistics</div>
                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div>
                            <div className="text-muted-foreground">✅ Successful</div>
                            <div className="font-medium text-green-600">{account.total_successful_extractions || 0}</div>
                            {account.last_successful_extraction_at && (
                              <div className="text-muted-foreground text-[10px]">
                                {new Date(account.last_successful_extraction_at).toLocaleString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </div>
                            )}
                          </div>
                          <div>
                            <div className="text-muted-foreground">❌ Failures</div>
                            <div className="font-medium text-red-600">{account.total_failures || 0}</div>
                            {account.last_failure_at && (
                              <div className="text-muted-foreground text-[10px]">
                                {new Date(account.last_failure_at).toLocaleString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                        {account.last_failure_reason && (
                          <div className="mt-2 p-2 bg-red-50 rounded text-[10px] text-red-700">
                            <strong>Last Failure:</strong> {account.last_failure_reason}
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="pt-2 border-t">
                        <Button
                          onClick={() => handleInitialize(account.email)}
                          disabled={initializing !== null}
                          variant="outline"
                          size="sm"
                          className="w-full"
                        >
                          {initializing === account.email ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Re-initializing...
                            </>
                          ) : (
                            <>
                              <RefreshCw className="w-4 h-4 mr-2" />
                              Re-initialize Session
                            </>
                          )}
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="space-y-3">
                      <Alert>
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                          No active session. Initialize to start.
                        </AlertDescription>
                      </Alert>
                      <Button
                        onClick={() => handleInitialize(account.email)}
                        disabled={initializing !== null}
                        className="w-full"
                      >
                        {initializing === account.email ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Initializing...
                          </>
                        ) : (
                          <>
                            <Zap className="w-4 h-4 mr-2" />
                            Initialize Session
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>About Persistent Sessions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            • <strong>30-day sessions:</strong> Browserless Starter plan supports sessions that persist for 30 days
          </p>
          <p>
            • <strong>Cookie persistence:</strong> All ChatGPT cookies are preserved across reconnections
          </p>
          <p>
            • <strong>No re-login needed:</strong> Once initialized, sessions can be reconnected instantly
          </p>
          <p>
            • <strong>Idle time is free:</strong> Only charged when actively connected
          </p>
          <p>
            • <strong>Health monitoring:</strong> Sessions marked "expiring_soon" when &lt;7 days remain
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

