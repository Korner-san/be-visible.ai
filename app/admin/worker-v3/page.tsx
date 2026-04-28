'use client'

import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { AlertCircle, CheckCircle, Clock, Database, Loader2, RefreshCw } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface WorkerV3Batch {
  id: string
  item_kind: string
  schedule_date: string
  execution_time: string
  chatgpt_account_id: string | null
  batch_number: number | null
  batch_size: number
  priority: number
  status: string
  is_retry: boolean
  started_at: string | null
  completed_at: string | null
  error_message: string | null
}

interface WorkerV3Item {
  id: string
  batch_id: string
  item_index: number
  item_kind: string
  schedule_date: string
  brand_id: string
  prompt_id: string
  daily_report_id: string | null
  onboarding_wave: number | null
  is_retry: boolean
  status: string
  chatgpt_status: string
  google_ai_overview_status: string
  claude_status: string
  error_message: string | null
}

interface WorkerV3Lease {
  id: string
  account_id: string
  owner_type: string
  owner_id: string
  heartbeat_at: string
  expires_at: string
  released_at: string | null
}

interface WorkerV3Data {
  tableState: Record<string, boolean>
  batches: WorkerV3Batch[]
  items: WorkerV3Item[]
  leases: WorkerV3Lease[]
  modelExecutions: unknown[]
  eodRuns: unknown[]
  counts: Record<string, number>
}

function statusBadge(status: string) {
  const normalized = (status || 'unknown').toLowerCase()

  if (['completed', 'healthy', 'success'].includes(normalized)) {
    return <Badge className="bg-green-600"><CheckCircle className="mr-1 h-3 w-3" />{status}</Badge>
  }
  if (['running', 'leased'].includes(normalized)) {
    return <Badge className="bg-blue-600"><Clock className="mr-1 h-3 w-3" />{status}</Badge>
  }
  if (['failed', 'cancelled'].includes(normalized)) {
    return <Badge variant="destructive"><AlertCircle className="mr-1 h-3 w-3" />{status}</Badge>
  }
  return <Badge variant="outline">{status || 'unknown'}</Badge>
}

function shortId(id: string | null | undefined) {
  if (!id) return '-'
  return id.slice(0, 8)
}

function formatDate(value: string | null | undefined) {
  if (!value) return '-'
  return new Date(value).toLocaleString()
}

export default function WorkerV3AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState(false)
  const [data, setData] = useState<WorkerV3Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  const missingTables = useMemo(() => {
    if (!data?.tableState) return []
    return Object.entries(data.tableState)
      .filter(([, exists]) => !exists)
      .map(([table]) => table)
  }, [data])

  async function fetchData() {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch('/api/admin/worker-v3', {
        headers: {
          'x-worker-v3-password': password || localStorage.getItem('worker_v3_password') || '',
        },
      })
      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.message || result.errors?.join(', ') || 'Failed to fetch worker v3 data')
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
    const stored = localStorage.getItem('worker_v3_authenticated')
    if (stored === 'true') {
      setIsAuthenticated(true)
      fetchData()
    } else {
      setLoading(false)
    }
  }, [])

  function handlePasswordSubmit(event: FormEvent) {
    event.preventDefault()
    if (password !== 'Korneret') {
      setPasswordError(true)
      setPassword('')
      return
    }

    localStorage.setItem('worker_v3_authenticated', 'true')
    localStorage.setItem('worker_v3_password', password)
    setPasswordError(false)
    setIsAuthenticated(true)
    fetchData()
  }

  if (!isAuthenticated) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="mx-auto mt-20 max-w-md">
          <Card>
            <CardHeader>
              <CardTitle className="text-center">Worker V3</CardTitle>
              <CardDescription className="text-center">
                This read-only admin view is password protected.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                <Input
                  type="password"
                  placeholder="Enter password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className={passwordError ? 'border-red-500' : ''}
                  autoFocus
                />
                {passwordError && (
                  <p className="text-sm text-red-500">Incorrect password. Please try again.</p>
                )}
                <Button type="submit" className="w-full">Open</Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Worker V3</h1>
          <p className="text-muted-foreground">Read-only shadow visibility for the new worker tables.</p>
        </div>
        <Button onClick={fetchData} variant="outline" size="sm" disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Worker V3 data unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {missingTables.length > 0 && (
        <Alert className="mb-6">
          <Database className="h-4 w-4" />
          <AlertTitle>V3 tables not fully installed</AlertTitle>
          <AlertDescription>
            Missing tables: {missingTables.join(', ')}. Apply the v3 additive migrations before expecting data here.
          </AlertDescription>
        </Alert>
      )}

      <div className="mb-6 grid gap-4 md:grid-cols-5">
        {['batches', 'items', 'leases', 'modelExecutions', 'eodRuns'].map((key) => (
          <Card key={key}>
            <CardHeader className="pb-2">
              <CardDescription>{key}</CardDescription>
              <CardTitle className="text-2xl">{data?.counts?.[key] ?? 0}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Browser Runs</CardTitle>
          <CardDescription>One row is one planned or running 5-prompt Browserless session.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading worker v3 runs
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Run</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Retry</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.batches || []).map((batch) => (
                  <TableRow key={batch.id}>
                    <TableCell>{batch.batch_number ?? shortId(batch.id)}</TableCell>
                    <TableCell>{batch.item_kind}</TableCell>
                    <TableCell>{formatDate(batch.execution_time)}</TableCell>
                    <TableCell>{shortId(batch.chatgpt_account_id)}</TableCell>
                    <TableCell>{statusBadge(batch.status)}</TableCell>
                    <TableCell>{batch.batch_size}</TableCell>
                    <TableCell>{batch.is_retry ? 'yes' : 'no'}</TableCell>
                  </TableRow>
                ))}
                {data?.batches?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-muted-foreground">No v3 browser runs found.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Prompt Items</CardTitle>
          <CardDescription>Each item owns its brand/report/provider state inside a browser run.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Run</TableHead>
                <TableHead>#</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead>Prompt</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>ChatGPT</TableHead>
                <TableHead>Google</TableHead>
                <TableHead>Claude</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.items || []).slice(0, 100).map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{shortId(item.batch_id)}</TableCell>
                  <TableCell>{item.item_index}</TableCell>
                  <TableCell>{shortId(item.brand_id)}</TableCell>
                  <TableCell>{shortId(item.prompt_id)}</TableCell>
                  <TableCell>{statusBadge(item.status)}</TableCell>
                  <TableCell>{statusBadge(item.chatgpt_status)}</TableCell>
                  <TableCell>{statusBadge(item.google_ai_overview_status)}</TableCell>
                  <TableCell>{statusBadge(item.claude_status)}</TableCell>
                </TableRow>
              ))}
              {data?.items?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-muted-foreground">No v3 prompt items found.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account Leases</CardTitle>
          <CardDescription>Active and recent account ownership records used to prevent Browserless collisions.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Heartbeat</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Released</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.leases || []).map((lease) => (
                <TableRow key={lease.id}>
                  <TableCell>{shortId(lease.account_id)}</TableCell>
                  <TableCell>{lease.owner_type}:{shortId(lease.owner_id)}</TableCell>
                  <TableCell>{formatDate(lease.heartbeat_at)}</TableCell>
                  <TableCell>{formatDate(lease.expires_at)}</TableCell>
                  <TableCell>{lease.released_at ? formatDate(lease.released_at) : 'active'}</TableCell>
                </TableRow>
              ))}
              {data?.leases?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">No v3 leases found.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {lastRefresh && (
        <p className="mt-4 text-sm text-muted-foreground">Last refreshed: {lastRefresh.toLocaleString()}</p>
      )}
    </div>
  )
}
