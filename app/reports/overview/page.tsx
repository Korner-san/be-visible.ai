"use client"

import { useEffect, useState, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { toast } from '@/hooks/use-toast'
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Info, BarChart3, Bot, Users, Clock, FileSearch, Sparkles } from "lucide-react"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from "recharts"
import { useTimeRangeStore } from "@/store/timeRange"
import { useBrandsStore } from "@/store/brands"
import { useAuth } from "@/contexts/AuthContext"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

export default function ReportsOverview() {
  const { range } = useTimeRangeStore()
  const { user } = useAuth()
  const { brands, activeBrandId, setActiveBrand, loadUserBrands } = useBrandsStore()
  const searchParams = useSearchParams()
  const [isDemoReport, setIsDemoReport] = useState(false)
  const [showSuccessNotification, setShowSuccessNotification] = useState(false)

  // Check if this is a demo report and handle onboarding completion
  useEffect(() => {
    const demo = searchParams.get('demo')
    const brandId = searchParams.get('brand')
    const onboardingCompleted = searchParams.get('onboarding_completed')
    
    if (demo === 'true') {
      setIsDemoReport(true)
    }
    
    // Set active brand if specified in URL
    if (brandId && activeBrandId !== brandId) {
      setActiveBrand(brandId)
    }
    
    // Check if user just completed onboarding
    if (onboardingCompleted === 'true' || sessionStorage.getItem('onboarding_just_completed') === 'true') {
      setShowSuccessNotification(true)
      // Clear the session storage flag
      sessionStorage.removeItem('onboarding_just_completed')
      
      console.log('🎉 [CLIENT] Onboarding completed detected, refreshing brand data...')
      
      // Force refresh brand data after onboarding completion (no navigation)
      if (user?.id) {
        console.log('🎉 [CLIENT] Refreshing brand data after onboarding completion...')
        // Use the existing loadUserBrands from the hook
        loadUserBrands(user.id).catch(console.error)
      }
      
      // Show success toast - find the most recently onboarded brand (not demo)
      const realBrands = brands.filter(brand => !brand.isDemo)
      const newestRealBrand = realBrands.length > 0 ? realBrands[0] : null // Brands are sorted by created_at DESC
      const onboardedBrandName = newestRealBrand?.name || 'your brand'
      
      toast({
        title: "🎉 Setup Complete!",
        description: `You're viewing the Demo report while we prepare ${onboardedBrandName}. We'll notify you when it's ready.`,
        duration: 8000,
      })
    }
  }, [searchParams, activeBrandId, setActiveBrand, brands])

  const activeBrand = brands.find(brand => brand.id === activeBrandId)
  const isActiveBrandDemo = activeBrand?.isDemo || isDemoReport


  // Generate mock data based on time range
  const generateTimeSeriesData = () => {
    const now = new Date()
    let days = 7
    let interval = 'day'
    
    switch (range) {
      case '7d':
        days = 7
        interval = 'day'
        break
      case '30d':
        days = 30
        interval = 'day'
        break
      case '90d':
        days = 90
        interval = 'week'
        break
      case 'custom':
        days = 30 // Default to 30 days for custom
        interval = 'day'
        break
    }

    const data = []
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now)
      if (interval === 'day') {
        date.setDate(date.getDate() - i)
      } else {
        date.setDate(date.getDate() - (i * 7))
      }
      
      const dateStr = interval === 'day' 
        ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : `Week ${Math.ceil((days - i) / 7)}`

      data.push({
        date: dateStr,
        'GPT-4': Math.floor(Math.random() * 50) + 20,
        'Claude': Math.floor(Math.random() * 40) + 15,
        'Gemini': Math.floor(Math.random() * 35) + 10,
        'Perplexity': Math.floor(Math.random() * 30) + 8,
        'ChatGPT': Math.floor(Math.random() * 45) + 18,
      })
    }
    return data
  }

  const generateAISessionsData = () => {
    const now = new Date()
    let days = 7
    let interval = 'day'
    
    switch (range) {
      case '7d':
        days = 7
        interval = 'day'
        break
      case '30d':
        days = 30
        interval = 'day'
        break
      case '90d':
        days = 90
        interval = 'week'
        break
      case 'custom':
        days = 30
        interval = 'day'
        break
    }

    const data = []
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now)
      if (interval === 'day') {
        date.setDate(date.getDate() - i)
      } else {
        date.setDate(date.getDate() - (i * 7))
      }
      
      const dateStr = interval === 'day' 
        ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : `Week ${Math.ceil((days - i) / 7)}`

      data.push({
        date: dateStr,
        'GPT-4': Math.floor(Math.random() * 80) + 30,
        'Claude': Math.floor(Math.random() * 60) + 25,
        'Gemini': Math.floor(Math.random() * 50) + 20,
        'Perplexity': Math.floor(Math.random() * 40) + 15,
        'ChatGPT': Math.floor(Math.random() * 70) + 28,
      })
    }
    return data
  }

  // Memoize chart data to prevent flickering on re-renders
  const botScansData = useMemo(() => generateTimeSeriesData(), [range])
  const aiSessionsData = useMemo(() => generateAISessionsData(), [range])

  // Generate mock data for pages indexed table
  const generatePagesIndexedData = () => {
    const baseUrls = [
      'https://americanexpress.com/',
      'https://americanexpress.com/business/',
      'https://americanexpress.com/personal/',
      'https://americanexpress.com/small-business/',
      'https://americanexpress.com/corporate/',
      'https://americanexpress.com/credit-cards/',
      'https://americanexpress.com/rewards/',
      'https://americanexpress.com/travel/',
      'https://americanexpress.com/support/',
      'https://americanexpress.com/about/',
      'https://americanexpress.com/careers/',
      'https://americanexpress.com/news/',
      'https://americanexpress.com/security/',
      'https://americanexpress.com/terms/',
      'https://americanexpress.com/privacy/',
    ]

    const models = ['GPT-4', 'Claude', 'Gemini', 'Perplexity', 'ChatGPT']
    
    return baseUrls.map((url, index) => {
      const scannedModels = models.filter(() => Math.random() > 0.3) // 70% chance each model scanned
      const lastScanned = new Date()
      lastScanned.setDate(lastScanned.getDate() - Math.floor(Math.random() * 7)) // Random day in last week
      
      return {
        url,
        models: scannedModels,
        lastScanned: lastScanned.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        scanCount: Math.floor(Math.random() * 50) + 1
      }
    })
  }

  const pagesIndexedData = useMemo(() => generatePagesIndexedData(), [range])

  return (
    <TooltipProvider>
      <div className="p-8">
        {/* Breadcrumbs */}
        <div className="mb-6">
          <nav className="text-sm text-slate-500">
            <span>Reports</span>
            <span className="mx-2">/</span>
            <span className="text-slate-900 font-medium">Overview</span>
          </nav>
        </div>

        {/* Success Banner for completed onboarding */}
        {showSuccessNotification && (
          <Alert className="mb-6 border-green-200 bg-green-50">
            <Info className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">
              <strong>🎉 Setup Complete!</strong> You're viewing the Demo report while we prepare {(() => {
                const realBrands = brands.filter(brand => !brand.isDemo)
                const newestRealBrand = realBrands.length > 0 ? realBrands[0] : null
                return newestRealBrand?.name || 'your brand'
              })()}. 
              We'll notify you when your personalized report is ready.
              <Button 
                variant="ghost" 
                size="sm" 
                className="ml-2 text-green-700 hover:text-green-900 p-0 h-auto"
                onClick={() => setShowSuccessNotification(false)}
              >
                Dismiss
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Demo Report Alert */}
        {isActiveBrandDemo && !showSuccessNotification && (
          <Alert className="mb-6 border-amber-200 bg-amber-50">
            <Sparkles className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800">
              <strong>Demo Report:</strong> This is a demonstration report with sample data. 
              This shows what your real reports will look like once you start processing your brand data.
            </AlertDescription>
          </Alert>
        )}



      {/* KPI Grid - 4 Boxes */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bot Scans</CardTitle>
            <Tooltip>
              <TooltipTrigger>
                <Info className="h-4 w-4 text-slate-400" />
              </TooltipTrigger>
              <TooltipContent>
                <p>Number of times AI models (ChatGPT, Claude, Gemini) scanned your website</p>
              </TooltipContent>
            </Tooltip>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-300">—</div>
            <p className="text-xs text-slate-400">Coming soon</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">AI Referrals</CardTitle>
            <Tooltip>
              <TooltipTrigger>
                <Info className="h-4 w-4 text-slate-400" />
              </TooltipTrigger>
              <TooltipContent>
                <p>Number of times users visited your website from links provided by AI models</p>
              </TooltipContent>
            </Tooltip>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-300">—</div>
            <p className="text-xs text-slate-400">Coming soon</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pages Indexed</CardTitle>
            <Tooltip>
              <TooltipTrigger>
                <Info className="h-4 w-4 text-slate-400" />
              </TooltipTrigger>
              <TooltipContent>
                <p>Number of your website pages visited by AI bots</p>
              </TooltipContent>
            </Tooltip>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-300">—</div>
            <p className="text-xs text-slate-400">Coming soon</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Last Bot Activity</CardTitle>
            <Tooltip>
              <TooltipTrigger>
                <Info className="h-4 w-4 text-slate-400" />
              </TooltipTrigger>
              <TooltipContent>
                <p>When the most recent AI bot visited your website</p>
              </TooltipContent>
            </Tooltip>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-300">—</div>
            <p className="text-xs text-slate-400">Coming soon</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-2 gap-6 mb-8">
        {/* Bot Scans Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Bot Scans Over Time</CardTitle>
            <p className="text-xs text-slate-500">AI model bot scans by model type</p>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={botScansData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="date" 
                    stroke="#64748b"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis 
                    stroke="#64748b"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                    }}
                  />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="GPT-4" 
                    stroke="#3b82f6" 
                    strokeWidth={2}
                    dot={{ fill: '#3b82f6', strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 6, stroke: '#3b82f6', strokeWidth: 2 }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="Claude" 
                    stroke="#10b981" 
                    strokeWidth={2}
                    dot={{ fill: '#10b981', strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 6, stroke: '#10b981', strokeWidth: 2 }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="Gemini" 
                    stroke="#f59e0b" 
                    strokeWidth={2}
                    dot={{ fill: '#f59e0b', strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 6, stroke: '#f59e0b', strokeWidth: 2 }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="Perplexity" 
                    stroke="#8b5cf6" 
                    strokeWidth={2}
                    dot={{ fill: '#8b5cf6', strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 6, stroke: '#8b5cf6', strokeWidth: 2 }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="ChatGPT" 
                    stroke="#ef4444" 
                    strokeWidth={2}
                    dot={{ fill: '#ef4444', strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 6, stroke: '#ef4444', strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* AI Sessions Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">AI Sessions Over Time</CardTitle>
            <p className="text-xs text-slate-500">Website visits referred by AI models</p>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={aiSessionsData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="date" 
                    stroke="#64748b"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis 
                    stroke="#64748b"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                    }}
                  />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="GPT-4" 
                    stroke="#3b82f6" 
                    strokeWidth={2}
                    dot={{ fill: '#3b82f6', strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 6, stroke: '#3b82f6', strokeWidth: 2 }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="Claude" 
                    stroke="#10b981" 
                    strokeWidth={2}
                    dot={{ fill: '#10b981', strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 6, stroke: '#10b981', strokeWidth: 2 }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="Gemini" 
                    stroke="#f59e0b" 
                    strokeWidth={2}
                    dot={{ fill: '#f59e0b', strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 6, stroke: '#f59e0b', strokeWidth: 2 }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="Perplexity" 
                    stroke="#8b5cf6" 
                    strokeWidth={2}
                    dot={{ fill: '#8b5cf6', strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 6, stroke: '#8b5cf6', strokeWidth: 2 }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="ChatGPT" 
                    stroke="#ef4444" 
                    strokeWidth={2}
                    dot={{ fill: '#ef4444', strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 6, stroke: '#ef4444', strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pages Indexed Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Pages Indexed Details</CardTitle>
          <p className="text-xs text-slate-500">Website URLs scanned by AI models (based on global time range)</p>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50%]">URL</TableHead>
                  <TableHead className="w-[30%]">Models Scanned</TableHead>
                  <TableHead className="w-[10%]">Scans</TableHead>
                  <TableHead className="w-[10%]">Last Scanned</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagesIndexedData.map((page, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <FileSearch className="h-4 w-4 text-slate-400" />
                        <span className="text-sm text-slate-600 truncate max-w-md">
                          {page.url}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {page.models.map((model, modelIndex) => {
                          const colors = {
                            'GPT-4': 'bg-blue-100 text-blue-800',
                            'Claude': 'bg-green-100 text-green-800',
                            'Gemini': 'bg-yellow-100 text-yellow-800',
                            'Perplexity': 'bg-purple-100 text-purple-800',
                            'ChatGPT': 'bg-red-100 text-red-800'
                          }
                          return (
                            <Badge 
                              key={modelIndex} 
                              variant="secondary" 
                              className={`text-xs ${colors[model as keyof typeof colors] || 'bg-gray-100 text-gray-800'}`}
                            >
                              {model}
                            </Badge>
                          )
                        })}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {page.scanCount}
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {page.lastScanned}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
    </TooltipProvider>
  )
} 