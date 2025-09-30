import { create } from 'zustand'
import { brandService, convertToLegacyBrand, type LegacyBrand } from '@/lib/supabase/brands'
import { useAuth } from '@/contexts/AuthContext'
import type { Brand as SupabaseBrand } from '@/types/database'

// Global demo brand - single read-only demo for all users
export const DEMO_BRAND: Brand = {
  id: '00000000-0000-0000-0000-000000000001',
  name: 'TechFlow Solutions',
  domain: 'techflow-demo.ai',
  isActive: true,
  isDemo: true
}

// Keep legacy interface for compatibility
export interface Brand {
  id: string
  name: string
  domain: string
  isActive: boolean
  isDemo?: boolean // New field to mark demo brands
  // Additional fields for brand selector display
  onboarding_completed?: boolean
  first_report_status?: 'idle' | 'queued' | 'running' | 'succeeded' | 'failed'
}

interface BrandsState {
  brands: Brand[]
  activeBrandId: string | null
  isLoading: boolean
  error: string | null
  
  // Actions
  setActiveBrand: (brandId: string) => void
  addBrand: (brand: Omit<Brand, 'id' | 'isDemo'>) => Promise<void>
  removeBrand: (brandId: string) => Promise<void>
  updateBrand: (brandId: string, updates: Partial<Brand>) => Promise<void>
  loadUserBrands: (userId: string) => Promise<void>
  refreshBrands: () => Promise<void>
  
  // Demo/Real brand management
  setDemoMode: (enabled: boolean) => void
  isDemoMode: boolean
}

export const useBrandsStore = create<BrandsState>((set, get) => ({
  brands: [],
  activeBrandId: null,
  isLoading: false,
  error: null,
  isDemoMode: false,

  setActiveBrand: (brandId) => {
    // Persist active brand to localStorage for cross-session persistence
    if (typeof window !== 'undefined') {
      localStorage.setItem('activeBrandId', brandId)
    }
    set({ 
      activeBrandId: brandId,
      isDemoMode: brandId === DEMO_BRAND.id
    })
  },

  setDemoMode: (enabled) => {
    if (enabled) {
      // Switch to demo mode with single demo brand
      set({ 
        brands: [DEMO_BRAND], 
        activeBrandId: DEMO_BRAND.id,
        isDemoMode: true 
      })
    } else {
      // Switch back to real brands mode
      const { refreshBrands } = get()
      set({ isDemoMode: false })
      refreshBrands()
    }
  },

  addBrand: async (brand) => {
    const state = get()
    if (state.isDemoMode) {
      // Add to demo brands locally
      const newBrand = { ...brand, id: Date.now().toString(), isDemo: true }
      set((state) => ({ brands: [...state.brands, newBrand] }))
      return
    }

    // Add real brand via Supabase
    try {
      set({ isLoading: true, error: null })
      
      // Get current user (you'll need to pass userId to this function)
      // For now, we'll handle this in the component that calls addBrand
      throw new Error('addBrand requires userId - use addRealBrand instead')
      
    } catch (error) {
      console.error('Error adding brand:', error)
      set({ error: error instanceof Error ? error.message : 'Failed to add brand' })
      throw error
    } finally {
      set({ isLoading: false })
    }
  },

  removeBrand: async (brandId) => {
    const state = get()
    if (state.isDemoMode || brandId.startsWith('demo-')) {
      // Remove from demo brands locally
      set((state) => ({
        brands: state.brands.filter(brand => brand.id !== brandId),
        activeBrandId: state.activeBrandId === brandId ? null : state.activeBrandId
      }))
      return
    }

    // Remove real brand via Supabase
    try {
      set({ isLoading: true, error: null })
      await brandService.deleteBrand(brandId)
      
      set((state) => ({
        brands: state.brands.filter(brand => brand.id !== brandId),
        activeBrandId: state.activeBrandId === brandId ? null : state.activeBrandId
      }))
    } catch (error) {
      console.error('Error removing brand:', error)
      set({ error: error instanceof Error ? error.message : 'Failed to remove brand' })
      throw error
    } finally {
      set({ isLoading: false })
    }
  },

  updateBrand: async (brandId, updates) => {
    const state = get()
    if (state.isDemoMode || brandId.startsWith('demo-')) {
      // Update demo brand locally
      set((state) => ({
        brands: state.brands.map(brand =>
          brand.id === brandId ? { ...brand, ...updates } : brand
        )
      }))
      return
    }

    // Update real brand via Supabase
    try {
      set({ isLoading: true, error: null })
      await brandService.updateBrand(brandId, {
        name: updates.name,
        domain: updates.domain
      })
      
      set((state) => ({
        brands: state.brands.map(brand =>
          brand.id === brandId ? { ...brand, ...updates } : brand
        )
      }))
    } catch (error) {
      console.error('Error updating brand:', error)
      set({ error: error instanceof Error ? error.message : 'Failed to update brand' })
      throw error
    } finally {
      set({ isLoading: false })
    }
  },

  loadUserBrands: async (userId) => {
    try {
      set({ isLoading: true, error: null })
      
      const supabaseBrands = await brandService.getUserBrands(userId)
      const realBrands: Brand[] = supabaseBrands.map(brand => 
        convertToLegacyBrand(brand, false)
      )
      
      // Check if any brands have completed onboarding
      const completedBrands = realBrands.filter(brand => {
        // Check if brand has onboarding_completed field (this comes from Supabase)
        return (brand as any).onboarding_completed === true
      })
      
      const hasCompletedOnboarding = completedBrands.length > 0
      
      // Only show demo brand if user has completed onboarding
      // This prevents demo brand from bypassing onboarding requirement
      let allBrands: Brand[]
      let defaultBrandId: string | null = null
      
      if (hasCompletedOnboarding) {
        allBrands = [DEMO_BRAND, ...realBrands]
        
        // Brand selection priority:
        // 1. Previously selected brand (from localStorage)
        // 2. Ready brand (first_report_status = 'succeeded')
        // 3. Demo brand (fallback)
        let persistedBrandId: string | null = null
        if (typeof window !== 'undefined') {
          persistedBrandId = localStorage.getItem('activeBrandId')
        }
        
        // Check if persisted brand still exists and is valid
        if (persistedBrandId && allBrands.find(b => b.id === persistedBrandId)) {
          defaultBrandId = persistedBrandId
          if (process.env.NODE_ENV === 'development') {
            console.log('🎯 [Brand Store] Restored persisted brand:', allBrands.find(b => b.id === persistedBrandId)?.name)
          }
        } else {
          // Fallback to smart selection with priority:
          // 1. Ready brand (first_report_status = 'succeeded')
          // 2. Most recently created real brand (for fresh onboarding)
          // 3. Demo brand
          const readyBrand = completedBrands.find(brand => 
            (brand as any).first_report_status === 'succeeded'
          )
          
          if (readyBrand) {
            defaultBrandId = readyBrand.id
            if (process.env.NODE_ENV === 'development') {
              console.log('🎯 [Brand Store] default brand = Ready brand:', readyBrand.name)
            }
          } else if (realBrands.length > 0) {
            // Select most recently created real brand (for fresh onboarding)
            const newestRealBrand = realBrands[0] // Already sorted by created_at DESC
            defaultBrandId = newestRealBrand.id
            if (process.env.NODE_ENV === 'development') {
              console.log('🎯 [Brand Store] default brand = Newest real brand:', newestRealBrand.name)
            }
          } else {
            defaultBrandId = DEMO_BRAND.id
            if (process.env.NODE_ENV === 'development') {
              console.log('🎯 [Brand Store] default brand = Demo (no real brands)')
            }
          }
        }
      } else {
        // If no completed onboarding, don't show demo brand
        // Let server routing handle the redirect to onboarding
        allBrands = realBrands
        defaultBrandId = allBrands[0]?.id || null
      }
      
      set({ 
        brands: allBrands, 
        activeBrandId: defaultBrandId,
        isDemoMode: defaultBrandId === DEMO_BRAND.id
      })
    } catch (error) {
      console.error('Error loading user brands:', error)
      set({ error: error instanceof Error ? error.message : 'Failed to load brands' })
      
      // On error, don't show demo brand - let server routing handle it
      set({ 
        brands: [], 
        activeBrandId: null,
        isDemoMode: false
      })
    } finally {
      set({ isLoading: false })
    }
  },

  refreshBrands: async () => {
    const state = get()
    if (state.isDemoMode) {
      return // No need to refresh demo brands
    }
    
    // This would need userId - handle in component
    console.warn('refreshBrands called without userId - implement in component')
  }
}))

// Helper functions for components
export const addRealBrand = async (userId: string, brandData: { name: string; domain: string }) => {
  const brand = await brandService.createBrand({
    user_id: userId,
    name: brandData.name,
    domain: brandData.domain
  })
  
  // Refresh the store
  const { loadUserBrands } = useBrandsStore.getState()
  await loadUserBrands(userId)
  
  return brand
}

export const checkUserHasBrands = async (userId: string): Promise<boolean> => {
  return await brandService.hasUserBrands(userId)
}

export const checkUserHasRealBrands = async (userId: string): Promise<boolean> => {
  return await brandService.hasUserRealBrands(userId)
}

export const getUserFirstBrand = async (userId: string): Promise<SupabaseBrand | null> => {
  return await brandService.getUserFirstBrand(userId)
}