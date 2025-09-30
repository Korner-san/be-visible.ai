'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Loader2, Search, Filter, CheckCircle, XCircle, Archive, RefreshCw, Sparkles } from 'lucide-react'
import { useBrandsStore } from '@/store/brands'
import type { BrandPrompt, Brand } from '@/types/database'

interface PromptsManagementClientProps {
  brands: Brand[]
}

type PromptStatus = 'active' | 'inactive'
type FilterStatus = 'all' | PromptStatus

const statusConfig = {
  active: { label: 'Active', color: 'bg-emerald-600', icon: CheckCircle },
  inactive: { label: 'Not Active', color: 'bg-slate-500', icon: RefreshCw }
}

const getCategoryColor = (category: string | null): string => {
  const colors: { [key: string]: string } = {
    'Brand Awareness': 'bg-blue-500',
    'Product Information': 'bg-green-500',
    'Value Proposition': 'bg-purple-500',
    'Competitive Analysis': 'bg-red-500',
    'Public Perception': 'bg-yellow-500',
    'Problem Resolution': 'bg-indigo-500',
    'Task Assistance': 'bg-pink-500',
    'Goal Achievement': 'bg-teal-500',
    'Feature Recognition': 'bg-orange-500',
    'Use Case Application': 'bg-cyan-500',
    'Competitive Alternatives': 'bg-rose-500',
    'Direct Comparison': 'bg-amber-500',
    'Competitive Advantage': 'bg-violet-500',
    'Industry Leadership': 'bg-emerald-500',
    'Category Recommendation': 'bg-lime-500',
    'Brand Challenges': 'bg-red-600',
    'Customer Concerns': 'bg-orange-600',
    'Purchase Decision': 'bg-blue-600',
    'Requirement Matching': 'bg-green-600',
    'USP Handling': 'bg-purple-600',
    'Pricing Information': 'bg-gray-600'
  }
  return colors[category || ''] || 'bg-gray-500'
}

export function PromptsManagementClient({ brands }: PromptsManagementClientProps) {
  const { activeBrandId } = useBrandsStore()
  const [prompts, setPrompts] = useState<BrandPrompt[]>([])
  const [filteredPrompts, setFilteredPrompts] = useState<BrandPrompt[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedPrompts, setSelectedPrompts] = useState<Set<string>>(new Set())
  const [bulkActionLoading, setBulkActionLoading] = useState(false)

  // Load prompts when active brand changes
  useEffect(() => {
    if (activeBrandId) {
      loadPrompts(activeBrandId)
    }
  }, [activeBrandId])

  // Filter prompts when search or status filter changes
  useEffect(() => {
    let filtered = prompts

    // Filter by status
    if (statusFilter !== 'all') {
      filtered = filtered.filter(p => p.status === statusFilter)
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(p => 
        p.raw_prompt.toLowerCase().includes(query) ||
        p.improved_prompt?.toLowerCase().includes(query) ||
        p.source_template_code.toLowerCase().includes(query) ||
        p.category?.toLowerCase().includes(query)
      )
    }

    setFilteredPrompts(filtered)
  }, [prompts, statusFilter, searchQuery])

  const loadPrompts = async (brandId: string) => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/setup/prompts?brandId=${brandId}`)
      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || 'Failed to load prompts')
      }

      setPrompts(data.prompts || [])
    } catch (error) {
      console.error('Error loading prompts:', error)
      setError(error instanceof Error ? error.message : 'Failed to load prompts')
    } finally {
      setLoading(false)
    }
  }

  const handlePromptToggle = (promptId: string) => {
    const newSelected = new Set(selectedPrompts)
    if (newSelected.has(promptId)) {
      newSelected.delete(promptId)
    } else {
      newSelected.add(promptId)
    }
    setSelectedPrompts(newSelected)
  }

  const handleBulkStatusUpdate = async (newStatus: PromptStatus) => {
    if (selectedPrompts.size === 0) return

    setBulkActionLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/setup/prompts/bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId: activeBrandId,
          promptIds: Array.from(selectedPrompts),
          status: newStatus
        })
      })

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || 'Failed to update prompts')
      }

      // Reload prompts
      await loadPrompts(activeBrandId)
      setSelectedPrompts(new Set())
    } catch (error) {
      console.error('Error updating prompts:', error)
      setError(error instanceof Error ? error.message : 'Failed to update prompts')
    } finally {
      setBulkActionLoading(false)
    }
  }

  const selectedBrandData = brands.find(b => b.id === activeBrandId)
  const isDemoBrand = selectedBrandData?.is_demo === true
  const statusCounts = prompts.reduce((acc, prompt) => {
    acc[prompt.status] = (acc[prompt.status] || 0) + 1
    return acc
  }, {} as Record<PromptStatus, number>)
  
  // Calculate active prompts and limit
  const activeCount = statusCounts.active || 0
  const maxActivePrompts = 15
  const canActivateMore = activeCount < maxActivePrompts

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Manage Prompts
            </h1>
            <p className="text-gray-600">
              Manage and organize your brand's AI visibility prompts.
            </p>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-500 mb-1">Active prompts</div>
            <Badge variant={activeCount >= maxActivePrompts ? "destructive" : "default"} className="text-lg px-3 py-1">
              {activeCount}/{maxActivePrompts}
            </Badge>
          </div>
        </div>
      </div>

      {/* Brand Selector */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select Brand
        </label>
        {/* Active Brand Display */}
        <div className="flex items-center space-x-3">
          <h2 className="text-xl font-semibold text-gray-900">
            {selectedBrandData?.name || 'No Brand Selected'}
          </h2>
          {selectedBrandData && (
            <Badge variant="outline" className="text-xs">
              {selectedBrandData.first_report_status}
            </Badge>
          )}
        </div>
        {selectedBrandData && (
          <p className="text-gray-600 mt-1">{selectedBrandData.domain}</p>
        )}
      </div>

      {activeBrandId && selectedBrandData && (
        <>
          {/* Status Overview */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {Object.entries(statusConfig).map(([status, config]) => {
              const count = statusCounts[status as PromptStatus] || 0
              const Icon = config.icon
              return (
                <Card key={status}>
                  <CardContent className="p-4">
                    <div className="flex items-center space-x-3">
                      <div className={`w-3 h-3 rounded-full ${config.color}`} />
                      <div>
                        <p className="text-sm font-medium text-gray-600">{config.label}</p>
                        <p className="text-2xl font-bold text-gray-900">{count}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {/* Filters and Search */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  placeholder="Search prompts..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as FilterStatus)}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {Object.entries(statusConfig).map(([status, config]) => (
                  <SelectItem key={status} value={status}>
                    <div className="flex items-center space-x-2">
                      <div className={`w-2 h-2 rounded-full ${config.color}`} />
                      <span>{config.label}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Demo Brand Notice */}
          {isDemoBrand && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
              <div className="flex items-center">
                <Sparkles className="h-4 w-4 text-amber-600 mr-2" />
                <span className="text-sm font-medium text-amber-900">
                  Demo Brand: These prompts are read-only for demonstration purposes.
                </span>
              </div>
            </div>
          )}

          {/* Bulk Actions */}
          {selectedPrompts.size > 0 && !isDemoBrand && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-blue-900">
                  {selectedPrompts.size} prompt{selectedPrompts.size === 1 ? '' : 's'} selected
                </span>
                <div className="flex space-x-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleBulkStatusUpdate('active')}
                    disabled={bulkActionLoading || (!canActivateMore && !Array.from(selectedPrompts).some(id => prompts.find(p => p.id === id)?.status === 'active'))}
                    title={!canActivateMore ? `Maximum ${maxActivePrompts} prompts can be active` : ''}
                  >
                    <CheckCircle className="w-4 h-4 mr-1" />
                    Activate
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleBulkStatusUpdate('inactive')}
                    disabled={bulkActionLoading}
                  >
                    <RefreshCw className="w-4 h-4 mr-1" />
                    Deactivate
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelectedPrompts(new Set())}
                  >
                    Clear Selection
                  </Button>
                </div>
              </div>
            </div>
          )}

          {error && (
            <Alert variant="destructive" className="mb-6">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Prompts List */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
          ) : filteredPrompts.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-gray-500">
                  {prompts.length === 0 
                    ? 'No prompts found for this brand. Complete onboarding to generate prompts.'
                    : 'No prompts match your current filters.'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {filteredPrompts.map((prompt) => {
                const isSelected = selectedPrompts.has(prompt.id)
                const statusInfo = statusConfig[prompt.status]
                const StatusIcon = statusInfo.icon
                
                return (
                  <Card 
                    key={prompt.id}
                    className={`transition-all duration-200 ${
                      isDemoBrand 
                        ? 'opacity-90' 
                        : `cursor-pointer ${isSelected ? 'ring-2 ring-blue-500 bg-blue-50' : 'hover:shadow-md'}`
                    }`}
                    onClick={() => !isDemoBrand && handlePromptToggle(prompt.id)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3 flex-1 min-w-0">
                          <Checkbox
                            checked={isSelected}
                            disabled={isDemoBrand}
                            onChange={() => {}}
                            className="flex-shrink-0"
                          />
                          
                          <Badge variant="outline" className="text-xs flex-shrink-0">
                            {prompt.source_template_code}
                          </Badge>
                          
                          <div className="flex-1 min-w-0 mr-4">
                            <p className="text-sm text-gray-800 font-medium truncate" 
                               title={prompt.improved_prompt || prompt.raw_prompt}
                               style={{
                                 display: '-webkit-box',
                                 WebkitLineClamp: 1,
                                 WebkitBoxOrient: 'vertical',
                                 overflow: 'hidden'
                               }}>
                              {prompt.improved_prompt || prompt.raw_prompt}
                            </p>
                            {prompt.category && (
                              <div className="flex items-center space-x-1 mt-1">
                                <div className={`w-2 h-2 rounded-full ${getCategoryColor(prompt.category)}`} />
                                <span className="text-xs text-gray-500">{prompt.category}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex items-center space-x-2 flex-shrink-0">
                          <Badge 
                            variant="outline"
                            className={`${statusInfo.color} text-white border-transparent text-xs`}
                          >
                            <StatusIcon className="w-3 h-3 mr-1" />
                            {statusInfo.label}
                          </Badge>
                          
                          {prompt.error_message && (
                            <Badge variant="destructive" className="text-xs">
                              Error
                            </Badge>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </>
      )}

      {!activeBrandId && (
        <div className="text-center py-12">
          <p className="text-gray-500">Please select a brand from the sidebar to manage prompts.</p>
        </div>
      )}
    </div>
  )
}