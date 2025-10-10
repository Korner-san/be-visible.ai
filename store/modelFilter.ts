import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Provider, ACTIVE_PROVIDERS } from '@/types/domain/provider'

interface ModelFilterState {
  selectedModels: Provider[]
  
  // Actions
  setSelectedModels: (models: Provider[]) => void
  toggleModel: (model: Provider) => void
  selectAllModels: () => void
  isModelSelected: (model: Provider) => boolean
  getSelectedCount: () => number
  getModelsForAPI: () => string
}

/**
 * Global Model Filter Store
 * Persists selection across page navigation and refreshes
 */
export const useModelFilterStore = create<ModelFilterState>()(
  persist(
    (set, get) => ({
      // Default: all active providers selected
      selectedModels: [...ACTIVE_PROVIDERS],

      setSelectedModels: (models) => {
        // Ensure at least one model is always selected
        if (models.length === 0) {
          console.warn('⚠️ [Model Filter] Cannot deselect all models, keeping current selection')
          return
        }
        
        // Only allow active providers
        const validModels = models.filter(m => ACTIVE_PROVIDERS.includes(m))
        
        if (validModels.length === 0) {
          console.warn('⚠️ [Model Filter] No valid models provided, keeping current selection')
          return
        }
        
        set({ selectedModels: validModels })
      },

      toggleModel: (model) => {
        const { selectedModels } = get()
        
        // Check if model is currently selected
        const isCurrentlySelected = selectedModels.includes(model)
        
        // Prevent deselecting the last model
        if (isCurrentlySelected && selectedModels.length === 1) {
          console.warn('⚠️ [Model Filter] Cannot deselect the last model')
          return
        }
        
        // Toggle the model
        const newSelection = isCurrentlySelected
          ? selectedModels.filter(m => m !== model)
          : [...selectedModels, model]
        
        set({ selectedModels: newSelection })
      },

      selectAllModels: () => {
        set({ selectedModels: [...ACTIVE_PROVIDERS] })
      },

      isModelSelected: (model) => {
        return get().selectedModels.includes(model)
      },

      getSelectedCount: () => {
        return get().selectedModels.length
      },

      getModelsForAPI: () => {
        const { selectedModels } = get()
        return selectedModels.join(',')
      }
    }),
    {
      name: 'model-filter-storage', // localStorage key
      // Only persist selectedModels
      partialize: (state) => ({ selectedModels: state.selectedModels })
    }
  )
)

/**
 * Hook for components to easily access model filter
 */
export const useModelFilter = () => {
  const store = useModelFilterStore()
  
  return {
    selectedModels: store.selectedModels,
    setSelectedModels: store.setSelectedModels,
    toggleModel: store.toggleModel,
    selectAllModels: store.selectAllModels,
    isModelSelected: store.isModelSelected,
    getSelectedCount: store.getSelectedCount,
    getModelsForAPI: store.getModelsForAPI
  }
}

