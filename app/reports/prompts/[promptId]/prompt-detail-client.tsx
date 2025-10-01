'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ArrowLeft, ExternalLink, TrendingUp, Bot, BarChart3, MessageSquare, Link as LinkIcon, Calendar, ChevronLeft, ChevronRight } from "lucide-react"
import Link from "next/link"
import { createClient } from '@/lib/supabase/client'

interface PromptDetailClientProps {
  prompt: any
  initialResults: any[]
  initialCitations: any[]
}

export default function PromptDetailClient({ prompt, initialResults, initialCitations }: PromptDetailClientProps) {
  const [currentPage, setCurrentPage] = useState(1)
  const [loading, setLoading] = useState(false)
  
  const CITATIONS_PER_PAGE = 15

  // Use all results (global date filter is handled by the parent)
  const filteredResults = initialResults
  const filteredCitations = initialCitations

  const totalMentions = filteredResults.filter(r => r.brand_mentioned).length
  const totalRuns = filteredResults.length
  
  // Pagination calculations
  const totalPages = Math.ceil(filteredCitations.length / CITATIONS_PER_PAGE)
  const startIndex = (currentPage - 1) * CITATIONS_PER_PAGE
  const paginatedCitations = filteredCitations.slice(startIndex, startIndex + CITATIONS_PER_PAGE)

  // Get mentions data for dot chart (brand + competitors)
  const mentionsData = filteredResults.reduce((acc: any[], result) => {
    // Add brand mention
    if (result.brand_mentioned) {
      const existing = acc.find(item => item.brand === prompt.brands.name)
      if (existing) {
        existing.mentions += 1
      } else {
        acc.push({ brand: prompt.brands.name, mentions: 1, color: '#3b82f6' })
      }
    }
    
    // Add competitor mentions
    if (result.competitor_mentions) {
      result.competitor_mentions.forEach((comp: any) => {
        const existing = acc.find(item => item.brand === comp.name)
        if (existing) {
          existing.mentions += comp.count
        } else {
          acc.push({ brand: comp.name, mentions: comp.count, color: '#ef4444' })
        }
      })
    }
    
    return acc
  }, [])

  return (
    <div className="p-8">
      {/* Header with Back Button */}
      <div className="mb-6">
        <div className="flex items-center space-x-4 mb-4">
          <Link href="/reports/prompts">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Prompts
            </Button>
          </Link>
        </div>
        
        <nav className="text-sm text-slate-500">
          <span>Reports</span>
          <span className="mx-2">/</span>
          <span>Prompts</span>
          <span className="mx-2">/</span>
          <span className="text-slate-900 font-medium">{prompt.source_template_code}</span>
        </nav>
      </div>


      <div className="max-w-7xl mx-auto">
        {/* Prompt Header */}
        <div className="mb-8">
          <div className="flex items-center space-x-3 mb-4">
            <Badge variant="outline" className="bg-emerald-600 text-white border-transparent">
              {prompt.source_template_code}
            </Badge>
            <Badge variant="secondary">
              {prompt.status === 'active' ? 'Active' : 'Inactive'}
            </Badge>
            {prompt.category && (
              <Badge variant="outline">
                {prompt.category}
              </Badge>
            )}
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-3">
            {prompt.category || 'Brand Visibility'} Analysis
          </h1>
          <p className="text-gray-600 flex items-center space-x-4">
            <span>Brand: {prompt.brands.name}</span>
            <span>•</span>
            <span className="flex items-center">
              <Calendar className="w-4 h-4 mr-1" />
              Created {new Date(prompt.created_at).toLocaleDateString()}
            </span>
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Prompt & AI Response */}
          <div className="lg:col-span-2 space-y-6">
            {/* Active Prompt */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <MessageSquare className="w-5 h-5 mr-2" />
                  Active Prompt
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-slate-50 border border-slate-200 p-4 rounded-lg">
                  <p className="text-gray-800 leading-relaxed font-medium">
                    {prompt.improved_prompt || prompt.raw_prompt}
                  </p>
                </div>
                {prompt.improved_prompt && prompt.improved_prompt !== prompt.raw_prompt && (
                  <details className="mt-4">
                    <summary className="text-sm text-gray-500 cursor-pointer hover:text-gray-700">
                      View original template
                    </summary>
                    <div className="mt-2 p-3 bg-gray-50 border border-gray-200 rounded text-sm text-gray-600">
                      {prompt.raw_prompt}
                    </div>
                  </details>
                )}
              </CardContent>
            </Card>

            {/* Most Recent Response */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Bot className="w-5 h-5 mr-2" />
                  Most Recent Response
                </CardTitle>
              </CardHeader>
              <CardContent>
                {filteredResults.length > 0 ? (
                  <div className="space-y-4">
                    {filteredResults.slice(0, 1).map((result) => (
                      <div key={result.id} className="border border-gray-200 rounded-lg p-6">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center">
                            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mr-3">
                              <Bot className="w-4 h-4 text-blue-600" />
                            </div>
                            <div>
                              <h4 className="font-medium text-gray-900">Perplexity AI</h4>
                              <p className="text-sm text-gray-500">
                                {new Date(result.daily_reports.report_date).toLocaleDateString()} 
                                {result.brand_mentioned && (
                                  <span className="ml-2 text-green-600">• Brand mentioned</span>
                                )}
                              </p>
                            </div>
                          </div>
                          {result.brand_mentioned && result.brand_position && (
                            <Badge variant="outline" className="bg-green-50">
                              Position: {result.brand_position}
                            </Badge>
                          )}
                        </div>
                        <div className="text-gray-800 text-sm leading-relaxed">
                          {result.perplexity_response || (
                            <span className="text-gray-500">No response available</span>
                          )}
                        </div>
                        {result.competitor_mentions && result.competitor_mentions.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            <span className="text-xs text-gray-600">Competitors mentioned:</span>
                            {result.competitor_mentions.map((comp: any, i: number) => (
                              <Badge key={i} variant="secondary" className="text-xs">
                                {comp.name} ({comp.count})
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="border border-dashed border-gray-300 rounded-lg p-6 text-center">
                    <div className="text-gray-500 text-sm">
                      No responses found for the selected date range.
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Citations with Pagination */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center">
                    <LinkIcon className="w-5 h-5 mr-2" />
                    Response Citations ({filteredCitations.length} total)
                  </div>
                  {totalPages > 1 && (
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <span className="text-sm text-gray-600">
                        Page {currentPage} of {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        disabled={currentPage === totalPages}
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {paginatedCitations.length > 0 ? (
                    <>
                      <div className="space-y-3">
                        {paginatedCitations.map((citation, index) => (
                          <div key={index} className="flex items-start space-x-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50">
                            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                              <ExternalLink className="w-4 h-4 text-blue-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center space-x-2 mb-1">
                                <h4 className="font-medium text-gray-900 text-sm truncate">
                                  {citation.title || 'Untitled'}
                                </h4>
                                <Badge variant="outline" className="text-xs flex-shrink-0">
                                  {citation.result_date}
                                </Badge>
                              </div>
                              <p className="text-xs text-gray-600 mb-2 truncate">
                                {citation.url}
                              </p>
                              <div className="flex items-center space-x-2">
                                <Badge variant="secondary" className="text-xs">
                                  {citation.domain || new URL(citation.url).hostname}
                                </Badge>
                                {citation.content_type && (
                                  <Badge variant="outline" className="text-xs">
                                    {citation.content_type}
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <Button variant="ghost" size="sm" asChild>
                              <a href={citation.url} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            </Button>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="text-gray-500 text-sm text-center py-8">
                      <LinkIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                      <p className="mb-2">No citations found for the selected date range</p>
                      <p className="text-xs">Try expanding your date range or run more reports</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Analytics & Charts */}
          <div className="space-y-6">
            {/* Visibility Score */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <TrendingUp className="w-5 h-5 mr-2" />
                  Visibility Score
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center">
                  <div className="text-3xl font-bold text-emerald-600 mb-2">
                    {totalRuns > 0 ? Math.round((totalMentions / totalRuns) * 100) : 0}%
                  </div>
                  <p className="text-sm text-gray-500 mb-4">Brand mention rate</p>
                  
                  {/* Mentions Over Time */}
                  {filteredResults.length > 0 && (
                    <div className="space-y-2">
                      {Array.from(new Set(filteredResults.map(r => r.daily_reports.report_date)))
                        .sort()
                        .slice(-7)
                        .map(date => {
                          const dayResults = filteredResults.filter(r => r.daily_reports.report_date === date)
                          const dayMentions = dayResults.filter(r => r.brand_mentioned).length
                          const mentionRate = dayResults.length > 0 ? (dayMentions / dayResults.length) * 100 : 0
                          return (
                            <div key={date} className="flex items-center justify-between text-xs">
                              <span className="text-gray-600">
                                {new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </span>
                              <div className="flex items-center space-x-2">
                                <div className="w-16 h-2 bg-gray-200 rounded-full">
                                  <div 
                                    className="h-2 bg-emerald-500 rounded-full" 
                                    style={{ width: `${mentionRate}%` }}
                                  ></div>
                                </div>
                                <span className="text-gray-500 w-8 text-right">
                                  {Math.round(mentionRate)}%
                                </span>
                              </div>
                            </div>
                          )
                        })}
                    </div>
                  )}
                  
                  <div className="mt-4 text-xs text-gray-500">
                    {totalRuns > 0 ? `${totalMentions} mentions in ${totalRuns} runs` : 'No data for selected range'}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Mentions Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <BarChart3 className="w-5 h-5 mr-2" />
                  Brand vs Competitors
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {mentionsData.length > 0 ? (
                    mentionsData.map((item, index) => (
                      <div key={index} className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <div 
                            className="w-3 h-3 rounded-full border-2"
                            style={{ backgroundColor: 'white', borderColor: item.color }}
                          ></div>
                          <span className="text-sm text-gray-600">{item.brand}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <div className="w-20 h-2 bg-gray-200 rounded-full">
                            <div 
                              className="h-2 rounded-full" 
                              style={{ 
                                backgroundColor: item.color,
                                width: `${Math.min(100, (item.mentions / Math.max(...mentionsData.map(d => d.mentions))) * 100)}%` 
                              }}
                            ></div>
                          </div>
                          <span className="text-xs text-gray-500 w-8 text-right">{item.mentions}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center text-gray-500 text-sm py-4">
                      No mentions found for selected date range
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Analysis Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Analysis Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Total Runs</span>
                    <span className="text-sm font-medium">{totalRuns}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Mentions</span>
                    <span className="text-sm font-medium text-emerald-600">{totalMentions}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Citations</span>
                    <span className="text-sm font-medium">{filteredCitations.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Date Range</span>
                    <span className="text-sm font-medium">
                      {dateRange.start} to {dateRange.end}
                    </span>
                  </div>
                  {filteredResults.length > 0 && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Avg Position</span>
                        <span className="text-sm font-medium">
                          {filteredResults.filter(r => r.brand_mentioned && r.brand_position).length > 0
                            ? Math.round(
                                filteredResults
                                  .filter(r => r.brand_mentioned && r.brand_position)
                                  .reduce((sum, r) => sum + r.brand_position, 0) /
                                filteredResults.filter(r => r.brand_mentioned && r.brand_position).length
                              )
                            : 'N/A'
                          }
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Competitors</span>
                        <span className="text-sm font-medium">
                          {Array.from(new Set(
                            filteredResults.flatMap(r => 
                              (r.competitor_mentions || []).map((c: any) => c.name)
                            )
                          )).length}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
