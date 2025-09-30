"use client"

import { useEffect, useState } from 'react'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useBrandsStore } from "@/store/brands"
import { useAuth } from "@/contexts/AuthContext"
import { Plus, Trash2, Edit, Sparkles, ArrowRight, Info } from "lucide-react"
import Link from 'next/link'

export default function SetupBrands() {
  const { user } = useAuth()
  const { brands, activeBrandId, setActiveBrand, addBrand, removeBrand, loadUserBrands } = useBrandsStore()
  const [needsOnboarding, setNeedsOnboarding] = useState(false)

  // Load user brands when component mounts
  useEffect(() => {
    if (user?.id) {
      loadUserBrands(user.id)
    }
  }, [user?.id, loadUserBrands])

  // Check if user needs onboarding
  useEffect(() => {
    const realBrands = brands.filter(brand => !brand.isDemo)
    const completedBrands = realBrands.filter(brand => (brand as any).onboarding_completed === true)
    setNeedsOnboarding(completedBrands.length === 0 && realBrands.length === 0)
  }, [brands])

  const handleAddBrand = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const name = formData.get('name') as string
    const domain = formData.get('domain') as string
    
    if (name && domain) {
      addBrand({ name, domain, isActive: true })
      e.currentTarget.reset()
    }
  }

  return (
    <div className="p-8">
      {/* Breadcrumbs */}
      <div className="mb-6">
        <nav className="text-sm text-slate-500">
          <span>Setup</span>
          <span className="mx-2">/</span>
          <span className="text-slate-900 font-medium">Brands</span>
        </nav>
      </div>

      {/* Onboarding CTA */}
      {needsOnboarding && (
        <Alert className="mb-6 border-blue-200 bg-blue-50">
          <Info className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-800">
            <div className="flex items-center justify-between">
              <div>
                <strong>Get started with brand monitoring:</strong> Complete the onboarding process to set up your first brand and start tracking AI visibility.
              </div>
              <Button asChild size="sm" className="ml-4">
                <Link href="/setup/onboarding">
                  Start Onboarding
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Link>
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-6">
        {/* Brands Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Your Brands</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Brand Name</TableHead>
                  <TableHead>Domain</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {brands.map((brand) => (
                  <TableRow key={brand.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {brand.isDemo && <Sparkles className="h-4 w-4 text-amber-500" />}
                        {brand.name}
                      </div>
                    </TableCell>
                    <TableCell className="text-blue-600">{brand.domain}</TableCell>
                    <TableCell>
                      {brand.isDemo ? (
                        <Badge variant="secondary" className="bg-amber-100 text-amber-700">
                          Demo
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">
                          Real
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {activeBrandId === brand.id ? (
                        <Badge variant="default" className="bg-green-100 text-green-700">Active</Badge>
                      ) : (
                        <Badge variant="secondary">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => setActiveBrand(brand.id)}
                          disabled={activeBrandId === brand.id}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => removeBrand(brand.id)}
                          disabled={activeBrandId === brand.id}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Add Brand Form */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Add Brand</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAddBrand} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="brand-name">Brand Name</Label>
                <Input id="brand-name" name="name" placeholder="e.g., Acme Corporation" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="brand-domain">Website Domain</Label>
                <Input id="brand-domain" name="domain" placeholder="e.g., acme.com" required />
              </div>
              <Button type="submit" className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Add Brand
              </Button>
              <p className="text-xs text-slate-500">Brand will be available for monitoring across all prompts</p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}