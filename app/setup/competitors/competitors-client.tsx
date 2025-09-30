"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Plus, Trash2, Sparkles } from "lucide-react"
import { useBrandsStore } from "@/store/brands"

interface Brand {
  id: string
  name: string
  domain: string
  is_demo: boolean
  onboarding_completed: boolean
  first_report_status: string
  onboarding_answers: any
}

interface CompetitorsClientProps {
  brands: Brand[]
}

export default function CompetitorsClient({ brands }: CompetitorsClientProps) {
  const { activeBrandId } = useBrandsStore()
  const activeBrand = brands.find(brand => brand.id === activeBrandId)
  const isDemoMode = activeBrand?.is_demo || false

  // Get competitors from onboarding answers or use demo data
  const getCompetitors = () => {
    if (isDemoMode) {
      // Demo brand competitors
      return [
        { id: 1, name: 'Microsoft', domain: 'microsoft.com', status: 'Active' },
        { id: 2, name: 'Amazon Web Services', domain: 'aws.amazon.com', status: 'Active' },
        { id: 3, name: 'Google Cloud', domain: 'cloud.google.com', status: 'Monitoring' },
      ]
    }

    if (!activeBrand?.onboarding_answers?.competitors) {
      return []
    }

    // Convert onboarding competitors to table format
    return activeBrand.onboarding_answers.competitors.map((competitor: string, index: number) => ({
      id: index + 1,
      name: competitor,
      domain: `${competitor.toLowerCase().replace(/\s+/g, '')}.com`, // Generate domain from name
      status: 'Active'
    }))
  }

  const competitorsData = getCompetitors()

  return (
    <div className="p-8">
      {/* Breadcrumbs */}
      <div className="mb-6">
        <nav className="text-sm text-slate-500">
          <span>Setup</span>
          <span className="mx-2">/</span>
          <span className="text-slate-900 font-medium">Competitors</span>
        </nav>
      </div>

      {/* Demo Brand Alert */}
      {isDemoMode && (
        <Alert className="mb-6 border-amber-200 bg-amber-50">
          <Sparkles className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800">
            <strong>Demo Brand:</strong> Viewing competitors for {activeBrand?.name}. 
            Switch to your brand to see your actual competitors from onboarding.
          </AlertDescription>
        </Alert>
      )}

      {/* Active Brand Display */}
      {activeBrand && (
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">
            Competitors for {activeBrand.name}
          </h1>
          <p className="text-gray-600 mt-1">
            {isDemoMode 
              ? 'Demo competitors for illustration purposes'
              : 'Competitors identified during your onboarding process'
            }
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Competitors Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              {isDemoMode ? 'Demo Competitors' : 'Your Competitors'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {competitorsData.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Competitor Name</TableHead>
                    <TableHead>Website</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {competitorsData.map((competitor) => (
                    <TableRow key={competitor.id}>
                      <TableCell className="font-medium">{competitor.name}</TableCell>
                      <TableCell className="text-blue-600">{competitor.domain}</TableCell>
                      <TableCell>
                        <Badge 
                          variant="default" 
                          className={competitor.status === 'Active' 
                            ? "bg-green-100 text-green-700" 
                            : "bg-yellow-100 text-yellow-700"
                          }
                        >
                          {competitor.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          disabled={isDemoMode}
                          className={isDemoMode ? 'opacity-50 cursor-not-allowed' : ''}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-gray-500">
                {activeBrand ? 'No competitors found from onboarding.' : 'Select a brand to view competitors.'}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Add Competitor Form */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Add New Competitor</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="competitor-name">Competitor Name</Label>
              <Input 
                id="competitor-name" 
                placeholder="e.g., Competitor Name" 
                disabled={isDemoMode}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="competitor-domain">Website Domain</Label>
              <Input 
                id="competitor-domain" 
                placeholder="e.g., competitor.com" 
                disabled={isDemoMode}
              />
            </div>
            <Button 
              className="w-full" 
              disabled={isDemoMode}
            >
              <Plus className="h-4 w-4 mr-2" />
              {isDemoMode ? 'Demo Mode - Read Only' : 'Add Competitor'}
            </Button>
            <p className="text-xs text-slate-500">
              {isDemoMode 
                ? 'Demo mode - competitors cannot be modified'
                : 'Competitor will be monitored across all active prompts'
              }
            </p>
          </CardContent>
        </Card>
      </div>

      {!activeBrand && (
        <div className="text-center py-12">
          <p className="text-gray-500">Please select a brand from the sidebar to view competitors.</p>
        </div>
      )}
    </div>
  )
}
