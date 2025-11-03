'use client'

import React from 'react'
import { Check, ChevronDown } from 'lucide-react'
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
import { Lock } from 'lucide-react'

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
  const allSelected = selectedCount === ACTIVE_PROVIDERS.length

  const handleSelectAll = () => {
    selectAllModels()
  }

  const getButtonLabel = () => {
    if (allSelected) {
      return 'All Models'
    } else if (selectedCount === 1) {
      return PROVIDER_DISPLAY_NAMES[selectedModels[0]]
    } else {
      return `${selectedCount} Models`
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="w-full sm:w-[200px] justify-between"
        >
          <span className="flex items-center gap-2">
            <span className="text-sm font-medium">{getButtonLabel()}</span>
            {!allSelected && (
              <span className="text-xs text-muted-foreground">
                ({selectedCount}/{ACTIVE_PROVIDERS.length})
              </span>
            )}
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
          <Check className={`mr-2 h-4 w-4 ${allSelected ? 'opacity-100' : 'opacity-0'}`} />
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
              <Check className={`mr-2 h-4 w-4 ${isSelected ? 'opacity-100' : 'opacity-0'}`} />
              {PROVIDER_DISPLAY_NAMES[provider]}
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
                <Lock className="mr-2 h-3 w-3" />
                {PROVIDER_DISPLAY_NAMES[provider]}
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

