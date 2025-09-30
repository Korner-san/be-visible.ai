"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Sparkles } from 'lucide-react'
import { useBrandsStore } from '@/store/brands'

interface Brand {
  id: string
  name: string
  domain: string
  is_demo: boolean
  brand_prompts: Array<{
    id: string
    source_template_code: string
    raw_prompt: string
    improved_prompt: string | null
    status: string
    created_at: string
  }>
}

interface ReportsPromptsClientProps {
  brands: Brand[]
}

export default function ReportsPromptsClient({ brands }: ReportsPromptsClientProps) {
  const { activeBrandId } = useBrandsStore()
  
  // Filter brands to show only the active brand
  const activeBrand = brands.find(brand => brand.id === activeBrandId)
  const isDemoMode = activeBrand?.is_demo || false

  if (!activeBrand || !activeBrand.brand_prompts || activeBrand.brand_prompts.length === 0) {
    return (
      <div className="p-8">
        {/* Breadcrumbs */}
        <div className="mb-6">
          <nav className="text-sm text-slate-500">
            <span>Reports</span>
            <span className="mx-2">/</span>
            <span className="text-slate-900 font-medium">Prompts</span>
          </nav>
        </div>

        <div className="max-w-4xl mx-auto p-6">
          <Card>
            <CardHeader>
              <CardTitle>No Selected Prompts Found</CardTitle>
              <CardDescription>
                Complete the onboarding process to see your selected prompts here.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      {/* Breadcrumbs */}
      <div className="mb-6">
        <nav className="text-sm text-slate-500">
          <span>Reports</span>
          <span className="mx-2">/</span>
          <span className="text-slate-900 font-medium">Prompts</span>
        </nav>
      </div>

      {/* Demo Brand Alert */}
      {isDemoMode && (
        <Alert className="mb-6 border-amber-200 bg-amber-50">
          <Sparkles className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800">
            <strong>Demo Report:</strong> Viewing selected prompts for {activeBrand.name}. 
            Switch to your brand to see your actual selected prompts.
          </AlertDescription>
        </Alert>
      )}

      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Selected Prompts
          </h1>
          <p className="text-gray-600">
            These are the prompts currently being used to power your brand analysis reports.
          </p>
        </div>

        <div className="mb-8">
          <div className="mb-4">
            <h2 className="text-xl font-semibold text-gray-800">{activeBrand.name}</h2>
            <p className="text-gray-600">{activeBrand.domain}</p>
            <p className="text-sm text-gray-500 mt-1">
              {activeBrand.brand_prompts.length} selected prompts
            </p>
          </div>

          <div className="space-y-2">
            {activeBrand.brand_prompts.map((prompt) => (
              <Card 
                key={prompt.id} 
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => window.location.href = `/reports/prompts/${prompt.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0 mr-4">
                      <div className="flex items-center space-x-2 mb-2">
                        <Badge variant="outline" className="bg-green-500 text-white text-xs">
                          {prompt.source_template_code}
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                          Active
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-800 font-medium mb-1" 
                         style={{
                           display: '-webkit-box',
                           WebkitLineClamp: 2,
                           WebkitBoxOrient: 'vertical',
                           overflow: 'hidden'
                         }}>
                        {prompt.improved_prompt || prompt.raw_prompt}
                      </p>
                      <p className="text-xs text-gray-500">
                        Created {new Date(prompt.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex-shrink-0">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
