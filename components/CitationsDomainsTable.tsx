'use client'

import { useState, useEffect } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { ChevronDown, ChevronRight, ExternalLink, Loader2, ChevronLeft, Download, AlertCircle, Sparkles } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { ScopeModal } from "./ScopeModal"

// Category label formatters

const formatContentType = (category: string | null | undefined): string => {
  if (!category) return 'Not categorized yet'
  
  // Specific mappings for known categories
  const labels: Record<string, string> = {
    // New 11-category system
    'OFFICIAL_DOCS': 'Official docs',
    'HOW_TO_GUIDE': 'How-to guide',
    'COMPARISON_ANALYSIS': 'Comparison analysis',
    'PRODUCT_PAGE': 'Product page',
    'THOUGHT_LEADERSHIP': 'Thought leadership',
    'CASE_STUDY': 'Case study',
    'TECHNICAL_DEEP_DIVE': 'Technical deep dive',
    'NEWS_ANNOUNCEMENT': 'News announcement',
    'COMMUNITY_DISCUSSION': 'Community discussion',
    'VIDEO_CONTENT': 'Video content',
    'OTHER_LOW_CONFIDENCE': 'Other (low confidence)',
    
    // Old 8-category system (backward compatibility)
    'QA_BLOCK': 'Q&A or FAQ block',
    'DATA_DRIVEN_REPORT': 'Original research or data report',
    'COMPARISON_TABLE': 'Product or service comparison',
    'DOCS_PAGE': 'Official documentation',
    'FORUM_THREAD': 'Community discussion',
    'TUTORIAL_STEP_BY_STEP': 'How-to tutorial',
    'LONG_FORM_ARTICLE': 'Editorial or thought leadership article',
    
    // Older system (backward compatibility)
    'DEFINITIVE_QA_BLOCK': 'Definitive Q&A block',
    'ORIGINAL_DATA_STUDY': 'Original data study',
    'PRODUCT_COMPARISON_MATRIX': 'Product comparison matrix',
    'NARRATIVE_CASE_STUDY': 'Narrative case study',
    'OFFICIAL_DOCUMENTATION': 'Official documentation',
    'TACTICAL_GUIDE': 'Tactical guide',
    'FOUNDATIONAL_AUTHORITY': 'Foundational authority',
    'BLOG_POST': 'Blog post',
    'NEWS_ARTICLE': 'News article',
    'TUTORIAL': 'Tutorial',
    'COMPARISON_REVIEW': 'Comparison review',
    'OTHER': 'Other'
  }
  
  // Return mapped label or transform ALL_CAPS_WITH_UNDERSCORES to Title case
  if (labels[category]) {
    return labels[category]
  }
  
  // Transform: SOME_CATEGORY_NAME → "Some category name"
  return category
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

const getContentTypeDescription = (category: string | null | undefined): string => {
  if (!category) return 'This content has not been categorized yet.'
  
  const descriptions: Record<string, string> = {
    // New 11-category system
    'OFFICIAL_DOCS': 'Formal structured reference documentation or API instructions.',
    'HOW_TO_GUIDE': 'Step-by-step instructions teaching how to perform a task or achieve an outcome.',
    'COMPARISON_ANALYSIS': 'Content comparing products/services, alternatives, or presenting ranked lists.',
    'PRODUCT_PAGE': 'Landing pages or feature presentations focused on sales, conversion, or product value.',
    'THOUGHT_LEADERSHIP': 'Expert opinions, industry insight, trend discussion, strategic framing.',
    'CASE_STUDY': 'Narrative explanation showing how a real organization or person achieved a result.',
    'TECHNICAL_DEEP_DIVE': 'In-depth technical explanation, architecture design, engineering reasoning.',
    'NEWS_ANNOUNCEMENT': 'Release notes, product update announcements, company news.',
    'COMMUNITY_DISCUSSION': 'Informal discussions, Q&A threads, Reddit/HN/SO style content.',
    'VIDEO_CONTENT': 'Video-first educational or narrative media content.',
    'OTHER_LOW_CONFIDENCE': 'Use ONLY when all other categories score below 0.45.',
    
    // Old 8-category system (backward compatibility)
    'QA_BLOCK': 'Short, structured text designed to answer a single question. Commonly found in FAQ or glossary sections. Often uses schema such as "FAQPage" or "HowTo" for direct extraction by AI models.',
    'DATA_DRIVEN_REPORT': 'Content presenting proprietary data, research, or surveys. Includes numbers, charts, or visualized datasets with a clear methodology. Recognized by AI models as original and verifiable information sources.',
    'COMPARISON_TABLE': 'Content comparing multiple tools, platforms, or services. Often structured as tables, lists, or "X vs Y" style articles. Includes "Top 5", "Best of", or feature-by-feature comparisons.',
    'DOCS_PAGE': 'Technical or instructional reference material from help centers, APIs, or developer sites. Includes installation guides, configuration steps, and parameter explanations. Structured for accuracy and reusability by AI systems.',
    'FORUM_THREAD': 'Threaded conversations, forum posts, or community Q&A exchanges. Includes peer‑to‑peer troubleshooting, shared experiences, and informal advice. Reflects public opinion or real‑world problem solving.',
    'TUTORIAL_STEP_BY_STEP': 'Structured instructional guide divided into sequential steps. Each step clearly marked with ordered headings or visual markers. Explains a process, setup, or workflow from start to finish.',
    'LONG_FORM_ARTICLE': 'In‑depth, long‑form writing with analysis or commentary. May include opinions, frameworks, or explanatory narratives. Characterized by longer paragraphs and contextual depth.',
    
    // Older system (backward compatibility)
    'DEFINITIVE_QA_BLOCK': 'Highly structured, short paragraphs designed to answer a single question (often tagged with FAQ/HowTo Schema). The AI extracts this with minimal editing.',
    'ORIGINAL_DATA_STUDY': 'Content containing proprietary research, unique data sets, or survey results with a clear methodology. The AI is citing this because the fact exists nowhere else.',
    'PRODUCT_COMPARISON_MATRIX': 'Content presented in tables, bulleted lists, or side-by-side feature comparisons. Ideal for satisfying competitive consensus queries.',
    'NARRATIVE_CASE_STUDY': 'Long-form content detailing a problem, solution, and clear numerical result. These citations are used to build trust and demonstrate experience.',
    'OFFICIAL_DOCUMENTATION': 'Structured content from help centers, API docs, or knowledge bases. Cited when the AI needs authoritative, technical instructions.',
    'TACTICAL_GUIDE': 'Content providing actionable instructions, workflows, or implementation guides. Cited when users need specific how-to information.',
    'FOUNDATIONAL_AUTHORITY': 'Content that establishes fundamental concepts, definitions, or frameworks that other sources reference. Cited when the AI needs to establish baseline knowledge.',
    'BLOG_POST': 'Informative article or post typically published on a blog. May cover a variety of topics with personal insights, news, or educational content.',
    'NEWS_ARTICLE': 'Timely news coverage or press releases. Provides current information about events, announcements, or industry developments.',
    'TUTORIAL': 'Step-by-step instructional content teaching how to accomplish a specific task or use a particular tool or technology.',
    'COMPARISON_REVIEW': 'Detailed comparison of products, services, or solutions with evaluation criteria and recommendations.',
    'OTHER': 'Content that doesn\'t fit into standard categories. May include landing pages, about pages, or mixed-format content.'
  }
  
  return descriptions[category] || `${formatContentType(category)} content type.`
}

interface DomainData {
  domain: string
  urls_count: number
  mentions_count: number
  distinct_ai_responses: number
  prompt_coverage: number
  model_coverage: number
  last_seen_at: string
  content_structure_category?: string | null
}

interface URLData {
  url: string
  times_cited: number
  distinct_ai_responses: number
  prompt_coverage: number
  model_coverage: number
  first_seen_at: string
  last_seen_at: string
  content_structure_category?: string | null
}

interface CitationsDomainsTableProps {
  domains: DomainData[]
  brandId: string
  dateRange: { from: string | null; to: string | null }
  selectedModels: string[]
  isLoading?: boolean
}

// Gap domains that show the scope feature
const GAP_DOMAINS = ['reddit.com', 'youtube.com', 'medium.com']

const isGapDomain = (domain: string): boolean => {
  return GAP_DOMAINS.includes(domain.toLowerCase())
}

export const CitationsDomainsTable: React.FC<CitationsDomainsTableProps> = ({
  domains,
  brandId,
  dateRange,
  selectedModels,
  isLoading
}) => {
  const [currentPage, setCurrentPage] = useState(1)
  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(new Set())
  const [domainUrls, setDomainUrls] = useState<Record<string, URLData[]>>({})
  const [loadingDomains, setLoadingDomains] = useState<Set<string>>(new Set())

  // Scope modal state
  const [isScopeModalOpen, setIsScopeModalOpen] = useState(false)
  const [selectedScopeDomain, setSelectedScopeDomain] = useState<string>('')

  const ITEMS_PER_PAGE = 10
  
  // Export function for CSV download
  const handleExportCSV = () => {
    const headers = ['Domain', 'Unique URLs', 'Mentions', 'Prompt Coverage', 'Model Coverage', 'Last Seen']
    const csvContent = [
      headers.join(','),
      ...domains.map(domain => [
        domain.domain,
        domain.urls_count,
        domain.mentions_count,
        domain.prompt_coverage,
        domain.model_coverage,
        new Date(domain.last_seen_at).toLocaleDateString()
      ].join(','))
    ].join('\n')
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', 'citation-sources-domains-report.csv')
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }
  
  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1)
    setExpandedDomains(new Set())
  }, [selectedModels, dateRange])
  
  // Calculate pagination
  const totalPages = Math.ceil(domains.length / ITEMS_PER_PAGE)
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
  const endIndex = startIndex + ITEMS_PER_PAGE
  const paginatedDomains = domains.slice(startIndex, endIndex)

  const handleCreateScope = (domain: string, e: React.MouseEvent) => {
    e.stopPropagation() // Prevent row expansion
    setSelectedScopeDomain(domain)
    setIsScopeModalOpen(true)
  }

  const toggleDomain = async (domain: string) => {
    const isExpanded = expandedDomains.has(domain)
    
    console.log(`🔍 [Frontend Debug] Toggle domain ${domain}:`, {
      isExpanded,
      hasDomainUrls: !!domainUrls[domain],
      domainUrlsValue: domainUrls[domain]
    })
    
    if (isExpanded) {
      // Collapse
      const newExpanded = new Set(expandedDomains)
      newExpanded.delete(domain)
      setExpandedDomains(newExpanded)
    } else {
      // Expand - fetch URLs if not already loaded
      if (!domainUrls[domain]) {
        setLoadingDomains(prev => new Set(prev).add(domain))
        
        try {
          const { from, to } = dateRange
          let url = `/api/reports/citations/urls?brandId=${brandId}&domain=${encodeURIComponent(domain)}`
          if (from && to) {
            url += `&from=${from}&to=${to}`
          }
          if (selectedModels.length > 0) {
            url += `&models=${selectedModels.join(',')}`
          }
          
          const response = await fetch(url)
          const data = await response.json()
          
          if (data.success) {
            console.log(`🔍 [Frontend Debug] URLs data for ${domain}:`, data.data.urls)
            setDomainUrls(prev => ({
              ...prev,
              [domain]: data.data.urls
            }))
          }
        } catch (error) {
          console.error('Failed to fetch URLs for domain:', domain, error)
        } finally {
          setLoadingDomains(prev => {
            const newSet = new Set(prev)
            newSet.delete(domain)
            return newSet
          })
        }
      }
      
      const newExpanded = new Set(expandedDomains)
      newExpanded.add(domain)
      setExpandedDomains(newExpanded)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    )
  }

  if (domains.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500">
        <p className="text-sm">No citation data available for selected models</p>
        <p className="text-xs mt-1">Try selecting different models or date range</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-end items-center mb-4">
        <Button 
          onClick={handleExportCSV}
          variant="outline"
          size="sm"
          className="flex items-center gap-2"
        >
          <Download className="h-4 w-4" />
          Download
        </Button>
      </div>
      <div className="border rounded-lg mb-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]"></TableHead>
              <TableHead>Domain</TableHead>
              <TableHead className="text-right">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger className="cursor-help">Unique URLs</TooltipTrigger>
                    <TooltipContent>
                      <p>Number of distinct URLs from this domain that were cited by AI models.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </TableHead>
              <TableHead className="text-right">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger className="cursor-help">Mentions</TooltipTrigger>
                    <TooltipContent>
                      <p>Total number of responses from AI models where this domain was mentioned.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </TableHead>
              <TableHead className="text-right">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger className="cursor-help">Prompt Coverage</TooltipTrigger>
                    <TooltipContent>
                      <p>Number of unique prompts (out of the 15 sent daily) where the domain was cited.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </TableHead>
              <TableHead className="text-right">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger className="cursor-help">Model Coverage</TooltipTrigger>
                    <TooltipContent>
                      <p>Number of distinct AI models that cited this domain.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </TableHead>
              <TableHead>Last Seen</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedDomains.map((domain) => {
            const isExpanded = expandedDomains.has(domain.domain)
            const isLoadingUrls = loadingDomains.has(domain.domain)
            const urls = domainUrls[domain.domain] || []

            return (
              <>
                {/* Main domain row */}
                <TableRow 
                  key={domain.domain}
                  className="cursor-pointer hover:bg-slate-50"
                  onClick={() => toggleDomain(domain.domain)}
                >
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </Button>
                  </TableCell>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <span>{domain.domain}</span>
                      {isGapDomain(domain.domain) && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 flex items-center gap-1">
                                <AlertCircle className="h-3 w-3" />
                                Gap
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-xs max-w-xs">
                                Opportunity detected: AI models cite this platform but not your content.
                                Create a scope to close this visibility gap.
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant="secondary">
                      {domain.urls_count}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {domain.mentions_count}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant="outline">
                      {domain.prompt_coverage}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant="outline">
                      {domain.model_coverage}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-slate-500">
                    {new Date(domain.last_seen_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    {isGapDomain(domain.domain) && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-blue-600 border-blue-300 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-1"
                        onClick={(e) => handleCreateScope(domain.domain, e)}
                      >
                        <Sparkles className="h-3 w-3" />
                        Create Scope
                      </Button>
                    )}
                  </TableCell>
                </TableRow>

                {/* Expanded URLs rows */}
                {isExpanded && (
                  <TableRow>
                    <TableCell colSpan={8} className="bg-slate-50 p-0">
                      <div className="px-12 py-4">
                        {isLoadingUrls ? (
                          <div className="flex items-center justify-center py-4">
                            <Loader2 className="h-5 w-5 animate-spin text-blue-500 mr-2" />
                            <span className="text-sm text-slate-500">Loading URLs...</span>
                          </div>
                        ) : urls.length > 0 ? (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>URL</TableHead>
                                <TableHead className="text-right">
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger className="cursor-help">Mentions</TooltipTrigger>
                                      <TooltipContent>
                                        <p>Total number of responses from AI models where this specific URL was mentioned.</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                </TableHead>
                                <TableHead className="text-right">
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger className="cursor-help">Prompt Coverage</TooltipTrigger>
                                      <TooltipContent>
                                        <p>Number of unique prompts where this specific URL was cited.</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                </TableHead>
                                <TableHead className="text-right">
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger className="cursor-help">Model Coverage</TooltipTrigger>
                                      <TooltipContent>
                                        <p>Number of distinct AI models that cited this specific URL.</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                </TableHead>
                                <TableHead>
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger className="cursor-help">Content Type</TooltipTrigger>
                                      <TooltipContent className="max-w-xs">
                                        <p className="text-xs">Classification of this specific URL.</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                </TableHead>
                                <TableHead>Last Seen</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {urls.map((urlData, idx) => {
                                console.log(`🔍 [Frontend Debug] Rendering URL ${idx}:`, urlData)
                                return (
                                <TableRow key={idx}>
                                  <TableCell className="font-mono text-xs">
                                    <a 
                                      href={urlData.url} 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      className="text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {urlData.url.length > 80 
                                        ? urlData.url.substring(0, 80) + '...' 
                                        : urlData.url}
                                      <ExternalLink className="h-3 w-3" />
                                    </a>
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <Badge variant="secondary">
                                      {urlData.times_cited}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <Badge variant="outline">
                                      {urlData.prompt_coverage}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <Badge variant="outline">
                                      {urlData.model_coverage}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-xs">
                                    {urlData.content_structure_category ? (
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Badge variant="outline" className="text-xs cursor-help">
                                              {formatContentType(urlData.content_structure_category)}
                                            </Badge>
                                          </TooltipTrigger>
                                          <TooltipContent className="max-w-xs">
                                            <p className="text-xs">{getContentTypeDescription(urlData.content_structure_category)}</p>
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    ) : (
                                      <span className="text-slate-400 italic">Not yet</span>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-sm text-slate-500">
                                    {new Date(urlData.last_seen_at).toLocaleDateString()}
                                  </TableCell>
                                </TableRow>
                                )
                              })}
                            </TableBody>
                          </Table>
                        ) : (
                          <div className="text-center py-4 text-slate-500 text-sm">
                            No URLs found for this domain
                          </div>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </>
            )
          })}
        </TableBody>
      </Table>
    </div>

    {/* Pagination Controls */}
    {totalPages > 1 && (
      <div className="flex items-center justify-between px-2">
        <div className="text-sm text-slate-600">
          Showing {startIndex + 1}-{Math.min(endIndex, domains.length)} of {domains.length} domains (Page {currentPage} of {totalPages})
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
            className="h-8"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            disabled={currentPage === totalPages}
            className="h-8"
          >
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    )}

    {/* Scope Modal */}
    <ScopeModal
      isOpen={isScopeModalOpen}
      onClose={() => setIsScopeModalOpen(false)}
      domain={selectedScopeDomain}
    />
  </div>
  )
}

