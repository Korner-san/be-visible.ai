'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { RefreshCw, Loader2, AlertCircle, CheckCircle, Clock } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface SessionAttempt {
  chatgpt_account_email: string
  browserless_session_id: string | null
  proxy_used: string | null
  timestamp: string
  connection_status: string
  visual_state: string | null
  operation_type: string
  connection_error_raw: string | null
}

interface CitationTrace {
  id: string
  timestamp: string
  brandName: string
  userEmail: string
  promptSnippet: string
  responseLength: number
  citationsCount: number
  sessionId: string | null
  visualState: string | null
  status: string
  errorMessage: string | null
  batchId: string | null
  batchNumber: number | null
}

interface ScheduleItem {
  id: string
  schedule_date: string
  batch_number: number
  execution_time: string
  status: string
  batch_size: number
  account_assigned: string | null
  proxy_assigned: string | null
  account_last_visual_state: string | null
  session_id_assigned: string | null
  brand_name: string | null
  user_email: string | null
}

interface ForensicData {
  sessionMatrix: SessionAttempt[]
  citationTrace: CitationTrace[]
  schedulingQueue: ScheduleItem[]
}

const getStatusBadge = (status: string) => {
  switch (status.toLowerCase()) {
    case 'connected':
      return <Badge className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" />Connected</Badge>
    case 'error':
      return <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" />Error</Badge>
    case 'timeout':
      return <Badge variant="destructive"><Clock className="w-3 h-3 mr-1" />Timeout</Badge>
    case 'locked':
      return <Badge className="bg-orange-500"><AlertCircle className="w-3 h-3 mr-1" />Locked</Badge>
    case 'terminated':
      return <Badge variant="secondary">Terminated</Badge>
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

const getVisualStateBadge = (state: string | null) => {
  if (!state) return <Badge variant="outline">Unknown</Badge>

  switch (state) {
    case 'Logged_In':
      return <Badge className="bg-green-500">Logged In</Badge>
    case 'Sign_In_Button':
      return <Badge className="bg-red-500">Sign In Button</Badge>
    case 'Captcha':
      return <Badge className="bg-yellow-500">Captcha</Badge>
    case 'Blank':
      return <Badge variant="secondary">Blank</Badge>
    default:
      return <Badge variant="outline">{state}</Badge>
  }
}

export default function ForensicPage() {
  const [data, setData] = useState<ForensicData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  const fetchData = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch('/api/admin/forensic?table=all')
      const result = await response.json()

      if (!result.success) {
        throw new Error(result.message || 'Failed to fetch forensic data')
      }

      setData(result.data)
      setLastRefresh(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  return (
    <div className="container mx-auto py-8 px-4">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Forensic Visibility Panel</h1>
        <p className="text-muted-foreground">
          Raw operational data for Browserless automation sessions and citation extraction
        </p>
        {lastRefresh && (
          <p className="text-sm text-muted-foreground mt-2">
            Last refresh: {lastRefresh.toLocaleTimeString()}
          </p>
        )}
      </div>

      {/* Refresh Button */}
      <div className="flex justify-end mb-4">
        <Button onClick={fetchData} disabled={loading} size="sm" variant="outline">
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Loading State */}
      {loading && !data && (
        <div className="flex justify-center items-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Data Tables */}
      {data && (
        <div className="space-y-8">

          {/* Table A: Session Matrix */}
          <Card>
            <CardHeader>
              <CardTitle>Table A: Active/Recent Session Matrix</CardTitle>
              <CardDescription>
                Last 24 hours of Browserless session connection attempts (raw data)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2 font-semibold">Timestamp</th>
                      <th className="text-left p-2 font-semibold">Account</th>
                      <th className="text-left p-2 font-semibold">Session ID</th>
                      <th className="text-left p-2 font-semibold">Proxy</th>
                      <th className="text-left p-2 font-semibold">Connection Status</th>
                      <th className="text-left p-2 font-semibold">Visual State</th>
                      <th className="text-left p-2 font-semibold">Operation</th>
                      <th className="text-left p-2 font-semibold">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.sessionMatrix.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="text-center p-4 text-muted-foreground">
                          No session attempts in last 24 hours
                        </td>
                      </tr>
                    ) : (
                      data.sessionMatrix.map((session, index) => (
                        <tr key={index} className="border-b hover:bg-muted/50">
                          <td className="p-2 font-mono text-xs">
                            {new Date(session.timestamp).toLocaleString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit'
                            })}
                          </td>
                          <td className="p-2 text-xs">{session.chatgpt_account_email}</td>
                          <td className="p-2 font-mono text-xs truncate max-w-[120px]" title={session.browserless_session_id || ''}>
                            {session.browserless_session_id ? session.browserless_session_id.substring(0, 12) + '...' : 'N/A'}
                          </td>
                          <td className="p-2 text-xs font-mono">{session.proxy_used || 'N/A'}</td>
                          <td className="p-2">{getStatusBadge(session.connection_status)}</td>
                          <td className="p-2">{getVisualStateBadge(session.visual_state)}</td>
                          <td className="p-2 text-xs">{session.operation_type}</td>
                          <td className="p-2 text-xs max-w-[200px] truncate" title={session.connection_error_raw || ''}>
                            {session.connection_error_raw || '-'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Table B: Citation Trace */}
          <Card>
            <CardHeader>
              <CardTitle>Table B: Batch & Citation Forensic Trace</CardTitle>
              <CardDescription>
                Recent prompt executions with citation extraction data (last 100 results)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2 font-semibold">Timestamp</th>
                      <th className="text-left p-2 font-semibold">Batch</th>
                      <th className="text-left p-2 font-semibold">Brand</th>
                      <th className="text-left p-2 font-semibold">User</th>
                      <th className="text-left p-2 font-semibold">Prompt Snippet</th>
                      <th className="text-left p-2 font-semibold">Response</th>
                      <th className="text-left p-2 font-semibold">Citations</th>
                      <th className="text-left p-2 font-semibold">Session ID</th>
                      <th className="text-left p-2 font-semibold">Visual State</th>
                      <th className="text-left p-2 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.citationTrace.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="text-center p-4 text-muted-foreground">
                          No prompt results found
                        </td>
                      </tr>
                    ) : (
                      data.citationTrace.map((trace) => (
                        <tr key={trace.id} className="border-b hover:bg-muted/50">
                          <td className="p-2 font-mono text-xs">
                            {new Date(trace.timestamp).toLocaleString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </td>
                          <td className="p-2 text-xs">
                            {trace.batchNumber ? `#${trace.batchNumber}` : 'N/A'}
                          </td>
                          <td className="p-2 text-xs">{trace.brandName}</td>
                          <td className="p-2 text-xs">{trace.userEmail}</td>
                          <td className="p-2 text-xs max-w-[200px] truncate" title={trace.promptSnippet}>
                            {trace.promptSnippet}
                          </td>
                          <td className="p-2 text-xs">
                            {trace.responseLength > 0 ? (
                              <span className="text-green-600 font-semibold">{trace.responseLength} chars</span>
                            ) : (
                              <span className="text-red-600">0 chars</span>
                            )}
                          </td>
                          <td className="p-2 text-xs">
                            {trace.citationsCount > 0 ? (
                              <Badge className="bg-blue-500">{trace.citationsCount}</Badge>
                            ) : (
                              <Badge variant="secondary">0</Badge>
                            )}
                          </td>
                          <td className="p-2 font-mono text-xs truncate max-w-[100px]" title={trace.sessionId || ''}>
                            {trace.sessionId ? trace.sessionId.substring(0, 10) + '...' : 'N/A'}
                          </td>
                          <td className="p-2">{getVisualStateBadge(trace.visualState)}</td>
                          <td className="p-2">
                            {trace.status === 'ok' ? (
                              <Badge className="bg-green-500">OK</Badge>
                            ) : trace.status === 'error' ? (
                              <Badge variant="destructive" title={trace.errorMessage || ''}>Error</Badge>
                            ) : (
                              <Badge variant="outline">{trace.status}</Badge>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Table C: Scheduling Queue */}
          <Card>
            <CardHeader>
              <CardTitle>Table C: Scheduling Queue</CardTitle>
              <CardDescription>
                Upcoming scheduled batches (today and tomorrow). Each batch executes prompts from ONE brand only.
                Batch numbers are global across all brands.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2 font-semibold">Execution Time</th>
                      <th className="text-left p-2 font-semibold">Batch / Brand</th>
                      <th className="text-left p-2 font-semibold">Prompts</th>
                      <th className="text-left p-2 font-semibold">Status</th>
                      <th className="text-left p-2 font-semibold">User</th>
                      <th className="text-left p-2 font-semibold">Account</th>
                      <th className="text-left p-2 font-semibold">Proxy</th>
                      <th className="text-left p-2 font-semibold">Account State</th>
                      <th className="text-left p-2 font-semibold">Session ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.schedulingQueue.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="text-center p-4 text-muted-foreground">
                          No upcoming batches scheduled
                        </td>
                      </tr>
                    ) : (
                      data.schedulingQueue.map((schedule) => (
                        <tr key={schedule.id} className="border-b hover:bg-muted/50">
                          <td className="p-2 font-mono text-xs">
                            {new Date(schedule.execution_time).toLocaleString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </td>
                          <td className="p-2">
                            <div className="flex flex-col gap-1">
                              <Badge variant="outline" className="w-fit">
                                Batch #{schedule.batch_number}
                              </Badge>
                              <span className="text-xs font-semibold text-slate-900">
                                {schedule.brand_name || 'N/A'}
                              </span>
                            </div>
                          </td>
                          <td className="p-2">
                            <Badge className="bg-blue-500">
                              {schedule.batch_size} {schedule.batch_size === 1 ? 'prompt' : 'prompts'}
                            </Badge>
                          </td>
                          <td className="p-2">
                            {schedule.status === 'pending' ? (
                              <Badge variant="outline">Pending</Badge>
                            ) : schedule.status === 'running' ? (
                              <Badge className="bg-blue-500">Running</Badge>
                            ) : schedule.status === 'completed' ? (
                              <Badge className="bg-green-500">Completed</Badge>
                            ) : schedule.status === 'failed' ? (
                              <Badge variant="destructive">Failed</Badge>
                            ) : (
                              <Badge variant="secondary">{schedule.status}</Badge>
                            )}
                          </td>
                          <td className="p-2 text-xs">{schedule.user_email || 'N/A'}</td>
                          <td className="p-2 text-xs">{schedule.account_assigned || 'N/A'}</td>
                          <td className="p-2 text-xs font-mono">{schedule.proxy_assigned || 'N/A'}</td>
                          <td className="p-2">{getVisualStateBadge(schedule.account_last_visual_state)}</td>
                          <td className="p-2 font-mono text-xs truncate max-w-[100px]" title={schedule.session_id_assigned || ''}>
                            {schedule.session_id_assigned ? schedule.session_id_assigned.substring(0, 10) + '...' : 'N/A'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

        </div>
      )}
    </div>
  )
}
