"use client"

import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useBrandsStore } from "@/store/brands"
import { useAuth } from "@/contexts/AuthContext"
import { ChevronDown, Plus, Sparkles, Clock, CheckCircle, AlertCircle, XCircle } from "lucide-react"
import Link from "next/link"
import { useEffect } from "react"

// Helper functions for brand status display
const getStatusInfo = (status?: string) => {
  switch (status) {
    case 'queued':
      return { 
        label: 'Queued', 
        icon: Clock, 
        className: 'bg-blue-100 text-blue-700',
        description: 'Report generation queued'
      }
    case 'running':
      return { 
        label: 'Running', 
        icon: Clock, 
        className: 'bg-yellow-100 text-yellow-700',
        description: 'Generating report...'
      }
    case 'succeeded':
      return { 
        label: 'Ready', 
        icon: CheckCircle, 
        className: 'bg-green-100 text-green-700',
        description: 'Report ready'
      }
    case 'failed':
      return { 
        label: 'Failed', 
        icon: XCircle, 
        className: 'bg-red-100 text-red-700',
        description: 'Report generation failed'
      }
    default:
      return { 
        label: 'Idle', 
        icon: AlertCircle, 
        className: 'bg-gray-100 text-gray-700',
        description: 'Not started'
      }
  }
}

export const BrandSelector = () => {
  const { user } = useAuth()
  const { brands, activeBrandId, setActiveBrand, loadUserBrands, isLoading, isDemoMode } = useBrandsStore()
  
  const activeBrand = brands.find(brand => brand.id === activeBrandId)

  // Load user brands when component mounts or user changes
  useEffect(() => {
    if (user?.id) {
      loadUserBrands(user.id)
    }
  }, [user?.id, loadUserBrands])

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="w-full justify-between" disabled={isLoading}>
          <div className="flex items-center space-x-2 truncate">
            {activeBrand?.isDemo && (
              <Sparkles className="h-3 w-3 text-amber-500 flex-shrink-0" />
            )}
            <span className="truncate">
              {isLoading ? 'Loading...' : activeBrand?.name || 'Select Brand'}
            </span>
            {activeBrand?.isDemo ? (
              <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded text-nowrap">
                Demo
              </span>
            ) : activeBrand?.first_report_status && (
              <span className={`text-xs px-1.5 py-0.5 rounded text-nowrap ${getStatusInfo(activeBrand.first_report_status).className}`}>
                {getStatusInfo(activeBrand.first_report_status).label}
              </span>
            )}
          </div>
          <ChevronDown className="h-4 w-4 ml-2 flex-shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {brands.map((brand) => {
          const statusInfo = getStatusInfo(brand.first_report_status)
          const StatusIcon = statusInfo.icon
          
          return (
            <DropdownMenuItem
              key={brand.id}
              onClick={() => setActiveBrand(brand.id)}
              className={activeBrandId === brand.id ? 'bg-slate-100 dark:bg-slate-800' : ''}
            >
              <div className="flex items-center justify-between w-full">
                <div className="flex flex-col items-start min-w-0 flex-1">
                  <div className="flex items-center space-x-2 w-full">
                    {brand.isDemo && (
                      <Sparkles className="h-3 w-3 text-amber-500 flex-shrink-0" />
                    )}
                    <span className="font-medium truncate">{brand.name}</span>
                  </div>
                  <div className="flex items-center space-x-2 w-full">
                    <span className="text-xs text-slate-500 truncate">{brand.domain}</span>
                    {brand.isDemo && (
                      <span className="text-xs text-slate-400">(read-only)</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center space-x-2 ml-2 flex-shrink-0">
                  {brand.isDemo ? (
                    <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                      Demo
                    </span>
                  ) : brand.first_report_status && (
                    <div className="flex items-center space-x-1">
                      <StatusIcon className="h-3 w-3" />
                      <span className={`text-xs px-1.5 py-0.5 rounded ${statusInfo.className}`}>
                        {statusInfo.label}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </DropdownMenuItem>
          )
        })}
        
        {brands.length === 0 && !isLoading && (
          <DropdownMenuItem disabled>
            <span className="text-slate-500">No brands found</span>
          </DropdownMenuItem>
        )}
        
        <DropdownMenuSeparator />
        
        {isDemoMode && (
          <>
            <DropdownMenuItem asChild>
              <Link href="/onboarding" className="flex items-center text-emerald-600">
                <Plus className="h-4 w-4 mr-2" />
                Create your first brand
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        
        <DropdownMenuItem asChild>
          <Link href="/setup/brands" className="flex items-center">
            <Plus className="h-4 w-4 mr-2" />
            Manage brands
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}