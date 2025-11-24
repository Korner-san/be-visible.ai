'use client'

import React from 'react'
import { ChevronDown, MessageSquare, Search, Globe, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useModelFilter } from '@/store/modelFilter'
import { PROVIDER_DISPLAY_NAMES, ACTIVE_PROVIDERS, LOCKED_PROVIDERS, Provider } from '@/types/domain/provider'

// Icon mapping for each provider
const PROVIDER_ICONS: Record<Provider, React.ReactNode> = {
  chatgpt: <MessageSquare className="h-4 w-4" />,
  perplexity: <Search className="h-4 w-4" />,
  google_ai_overview: <Globe className="h-4 w-4" />
}

export const GlobalModelFilter: React.FC = () => {
  const {
    selectedModels,
    toggleModel,
    selectAllModels,
    isModelSelected,
    isModelLocked,
    getSelectedCount
  } = useModelFilter()

  const selectedCount = getSelectedCount()
  const totalProviders = ACTIVE_PROVIDERS.length + LOCKED_PROVIDERS.length
  const allSelected = selectedCount === ACTIVE_PROVIDERS.length

  const handleSelectAll = () => {
    selectAllModels()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="w-full sm:w-[180px] justify-between"
        >
          <span className="flex items-center gap-1.5">
            {/* Show icons for selected models */}
            {selectedModels.slice(0, 3).map((provider) => (
              <span key={provider} title={PROVIDER_DISPLAY_NAMES[provider]}>
                {PROVIDER_ICONS[provider]}
              </span>
            ))}
            {/* Show +X if more than displayed */}
            {selectedCount > 3 && (
              <span className="text-xs text-muted-foreground">+{selectedCount - 3}</span>
            )}
            {/* Show count */}
            <span className="text-xs text-muted-foreground ml-1">
              ({selectedCount}/{totalProviders})
            </span>
          </span>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[200px]">
        <DropdownMenuLabel>AI Models</DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        <DropdownMenuCheckboxItem
          checked={allSelected}
          onCheckedChange={handleSelectAll}
          className="font-medium"
        >
          Select All
        </DropdownMenuCheckboxItem>
        
        <DropdownMenuSeparator />
        
        {/* Active providers - ChatGPT only for Basic plan */}
        {ACTIVE_PROVIDERS.map((provider) => {
          const isSelected = isModelSelected(provider)
          const isLastSelected = selectedCount === 1 && isSelected

          return (
            <DropdownMenuCheckboxItem
              key={provider}
              checked={isSelected}
              onCheckedChange={() => toggleModel(provider)}
              disabled={isLastSelected}
              className={isLastSelected ? 'opacity-50 cursor-not-allowed' : ''}
            >
              <span className="flex items-center gap-2">
                {PROVIDER_ICONS[provider]}
                {PROVIDER_DISPLAY_NAMES[provider]}
              </span>
            </DropdownMenuCheckboxItem>
          )
        })}
        
        {/* Locked providers - Visible but disabled (for Advanced plan) */}
        {LOCKED_PROVIDERS.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <div className="px-2 py-1.5 text-xs text-muted-foreground">
              Advanced Plan Required
            </div>
            {LOCKED_PROVIDERS.map((provider) => (
              <DropdownMenuCheckboxItem
                key={provider}
                checked={false}
                disabled={true}
                className="opacity-50 cursor-not-allowed"
              >
                <span className="flex items-center gap-2">
                  {PROVIDER_ICONS[provider]}
                  {PROVIDER_DISPLAY_NAMES[provider]}
                  <Lock className="ml-auto h-3 w-3" />
                </span>
              </DropdownMenuCheckboxItem>
            ))}
          </>
        )}
        
        {selectedCount === 1 && (
          <>
            <DropdownMenuSeparator />
            <div className="px-2 py-1.5 text-xs text-muted-foreground">
              At least one model must be selected
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

