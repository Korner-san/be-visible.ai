"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Badge } from "@/components/ui/badge"
import { Info, TrendingUp, TrendingDown, FileText, MessageSquare, Book, Newspaper, AlertCircle, CheckCircle2, Sparkles } from "lucide-react"
import { useTimeRangeStore } from "@/store/timeRange"
import { useBrandsStore } from "@/store/brands"
import { Alert, AlertDescription } from "@/components/ui/alert"
import SimpleBarChart from "@/components/bar-chart"

export default function ReportsContent() {
  const { range } = useTimeRangeStore()
  const { brands, activeBrandId } = useBrandsStore()
  const activeBrand = brands.find(brand => brand.id === activeBrandId)
  const isDemoMode = activeBrand?.isDemo || false

  // Content categorization data for bubble chart
  const contentCategorization = [
    { 
      category: 'Product Pages', 
      count: 127, 
      color: '#1e40af', // Dark blue
      influence: 'High'
    },
    { 
      category: 'Blog Posts', 
      count: 89, 
      color: '#16a34a', // Dark green
      influence: 'High'
    },
    { 
      category: 'Documentation', 
      count: 45, 
      color: '#ea580c', // Dark orange
      influence: 'Medium'
    },
    { 
      category: 'Press Releases', 
      count: 23, 
      color: '#dc2626', // Dark red
      influence: 'Medium'
    }
  ]

  // Existing content insights
  const existingContent = [
    { type: 'Product Descriptions', status: 'Strong', count: 47, recommendation: 'Maintain quality' },
    { type: 'Feature Explanations', status: 'Good', count: 34, recommendation: 'Add more examples' },
    { type: 'Use Case Studies', status: 'Good', count: 28, recommendation: 'Include metrics' },
    { type: 'Customer Reviews', status: 'Weak', count: 12, recommendation: 'Increase volume' },
    { type: 'Technical Specs', status: 'Strong', count: 56, recommendation: 'Keep updated' },
    { type: 'Pricing Information', status: 'Good', count: 19, recommendation: 'Add comparisons' }
  ]

  // Missing content opportunities
  const missingContent = [
    { type: 'FAQ Pages', priority: 'High', aiImpact: 'Very High', reason: 'AI models often look for direct answers to common questions' },
    { type: 'Comparison Pages', priority: 'High', aiImpact: 'High', reason: 'Users frequently ask AI to compare products and services' },
    { type: 'Tutorial Content', priority: 'Medium', aiImpact: 'Medium', reason: 'How-to content helps establish authority and expertise' },
    { type: 'Industry Reports', priority: 'Medium', aiImpact: 'Medium', reason: 'Thought leadership content influences AI recommendations' },
    { type: 'Case Studies', priority: 'Low', aiImpact: 'Medium', reason: 'Real-world examples help AI understand practical applications' },
    { type: 'Video Transcripts', priority: 'Low', aiImpact: 'Low', reason: 'AI cannot directly access video content without transcripts' }
  ]

  return (
    <TooltipProvider>
      <div className="p-8">
        {/* Breadcrumbs */}
        <div className="mb-6">
          <nav className="text-sm text-slate-500">
            <span>Reports</span>
            <span className="mx-2">/</span>
            <span className="text-slate-900 font-medium">Content</span>
          </nav>
        </div>

        {/* Demo Brand Alert */}
        {isDemoMode && (
          <Alert className="mb-6 border-amber-200 bg-amber-50">
            <Sparkles className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800">
              <strong>Demo Report:</strong> Viewing content analysis for {activeBrand?.name}. 
              Switch to your brand to see real content metrics.
            </AlertDescription>
          </Alert>
        )}

        {/* Content Categorization */}
        <div className="mb-8">
          <SimpleBarChart 
            title="Content Categorization"
            description="Content types that have the most effect on how AI models answer questions about your brand"
            data={contentCategorization}
          />
        </div>

        {/* Content Analysis Grid */}
        <div className="grid grid-cols-2 gap-6 mb-8">
          {/* Existing Content Analysis */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                Existing Content Analysis
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="h-4 w-4 text-slate-400" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Analysis of your current content and its AI visibility impact</p>
                  </TooltipContent>
                </Tooltip>
              </CardTitle>
              <p className="text-xs text-slate-500">Content currently on your website and its effectiveness for AI visibility</p>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead className="font-semibold text-slate-900 text-base">Content Type</TableHead>
                    <TableHead className="font-semibold text-slate-900 text-base">Status</TableHead>
                    <TableHead className="font-semibold text-slate-900 text-base">Count</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {existingContent.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">{item.type}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {item.status === 'Strong' ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          ) : item.status === 'Good' ? (
                            <TrendingUp className="h-4 w-4 text-blue-500" />
                          ) : (
                            <AlertCircle className="h-4 w-4 text-red-500" />
                          )}
                          <span className={`text-xs font-medium ${
                            item.status === 'Strong' ? 'text-green-800' :
                            item.status === 'Good' ? 'text-blue-800' :
                            'text-red-800'
                          }`}>
                            {item.status}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>{item.count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Missing Content Opportunities */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                Missing Content Opportunities
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="h-4 w-4 text-slate-400" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Content types that could improve your AI visibility</p>
                  </TooltipContent>
                </Tooltip>
              </CardTitle>
              <p className="text-xs text-slate-500">Content gaps that could significantly improve your AI model visibility</p>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead className="font-semibold text-slate-900 text-base">Content Type</TableHead>
                    <TableHead className="font-semibold text-slate-900 text-base">Priority</TableHead>
                    <TableHead className="font-semibold text-slate-900 text-base">AI Impact</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {missingContent.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">
                        <div>
                          <div className="flex items-center gap-2">
                            <TrendingDown className="h-4 w-4 text-orange-500" />
                            {item.type}
                          </div>
                          <p className="text-xs text-slate-500 mt-1">{item.reason}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={
                          item.priority === 'High' ? 'destructive' :
                          item.priority === 'Medium' ? 'default' :
                          'secondary'
                        }>
                          {item.priority}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={
                          item.aiImpact === 'Very High' ? 'destructive' :
                          item.aiImpact === 'High' ? 'default' :
                          item.aiImpact === 'Medium' ? 'secondary' :
                          'outline'
                        }>
                          {item.aiImpact}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* AI Visibility Recommendations */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              AI Visibility Improvement Recommendations
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-4 w-4 text-slate-400" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Actionable recommendations to improve your content's AI visibility</p>
                </TooltipContent>
              </Tooltip>
            </CardTitle>
            <p className="text-xs text-slate-500">Specific actions you can take to improve how AI models understand and recommend your content</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="border-l-4 border-green-500 bg-green-50 p-4 rounded-r-lg">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-green-800">Create Comprehensive FAQ Pages</h4>
                    <p className="text-sm text-green-700 mt-1">
                      AI models frequently look for direct answers to user questions. Adding detailed FAQ pages can significantly improve your visibility.
                    </p>
                    <p className="text-xs text-green-600 mt-2">Expected impact: +40% AI mention rate</p>
                  </div>
                </div>
              </div>

              <div className="border-l-4 border-blue-500 bg-blue-50 p-4 rounded-r-lg">
                <div className="flex items-start gap-3">
                  <TrendingUp className="h-5 w-5 text-blue-600 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-blue-800">Develop Comparison Content</h4>
                    <p className="text-sm text-blue-700 mt-1">
                      Create pages that compare your products/services with competitors. AI models use this for recommendation engines.
                    </p>
                    <p className="text-xs text-blue-600 mt-2">Expected impact: +25% competitive mentions</p>
                  </div>
                </div>
              </div>

              <div className="border-l-4 border-orange-500 bg-orange-50 p-4 rounded-r-lg">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-orange-600 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-orange-800">Optimize Existing Product Descriptions</h4>
                    <p className="text-sm text-orange-700 mt-1">
                      Your product pages are performing well, but adding more detailed technical specifications and use cases could improve AI understanding.
                    </p>
                    <p className="text-xs text-orange-600 mt-2">Expected impact: +15% accuracy in AI responses</p>
                  </div>
                </div>
              </div>

              <div className="border-l-4 border-purple-500 bg-purple-50 p-4 rounded-r-lg">
                <div className="flex items-start gap-3">
                  <Book className="h-5 w-5 text-purple-600 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-purple-800">Expand Tutorial and How-To Content</h4>
                    <p className="text-sm text-purple-700 mt-1">
                      Step-by-step guides help AI models understand practical applications of your products and services.
                    </p>
                    <p className="text-xs text-purple-600 mt-2">Expected impact: +30% in educational queries</p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  )
}