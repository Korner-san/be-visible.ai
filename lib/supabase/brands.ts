// Brand operations for Supabase integration
import { createClient } from './client'
import type { Brand, BrandInsert, BrandUpdate } from '@/types/database'

export class BrandService {
  private supabase = createClient()

  // Get all brands for the current user
  async getUserBrands(userId: string): Promise<Brand[]> {
    const { data, error } = await this.supabase
      .from('brands')
      .select('*')
      .eq('owner_user_id', userId)
      .order('created_at', { ascending: false })
    
    if (error) {
      console.error('Error fetching user brands:', error)
      throw new Error(`Failed to fetch brands: ${error.message}`)
    }
    
    return data || []
  }

  // Create a new brand
  async createBrand(brandData: {
    owner_user_id: string
    name: string
    domain: string
  }): Promise<Brand> {
    const { data, error } = await this.supabase
      .from('brands')
      .insert({
        owner_user_id: brandData.owner_user_id,
        name: brandData.name,
        domain: brandData.domain
      })
      .select()
      .single()
    
    if (error) {
      console.error('Error creating brand:', error)
      throw new Error(`Failed to create brand: ${error.message}`)
    }
    
    return data
  }

  // Update a brand
  async updateBrand(brandId: string, updates: Partial<Pick<Brand, 'name' | 'domain'>>): Promise<Brand> {
    const { data, error } = await this.supabase
      .from('brands')
      .update(updates)
      .eq('id', brandId)
      .select()
      .single()
    
    if (error) {
      console.error('Error updating brand:', error)
      throw new Error(`Failed to update brand: ${error.message}`)
    }
    
    return data
  }

  // Delete a brand
  async deleteBrand(brandId: string): Promise<void> {
    const { error } = await this.supabase
      .from('brands')
      .delete()
      .eq('id', brandId)
    
    if (error) {
      console.error('Error deleting brand:', error)
      throw new Error(`Failed to delete brand: ${error.message}`)
    }
  }

  // Get brand by ID
  async getBrand(brandId: string): Promise<Brand | null> {
    const { data, error } = await this.supabase
      .from('brands')
      .select('*')
      .eq('id', brandId)
      .single()
    
    if (error) {
      if (error.code === 'PGRST116') {
        return null // Brand not found
      }
      console.error('Error fetching brand:', error)
      throw new Error(`Failed to fetch brand: ${error.message}`)
    }
    
    return data
  }

  // Check if user has any brands (including demos)
  async hasUserBrands(userId: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('brands')
      .select('id')
      .eq('user_id', userId)
      .limit(1)
    
    if (error) {
      console.error('BrandService: Error checking user brands:', error)
      return false
    }
    
    return (data?.length || 0) > 0
  }

  // Check if user has any REAL brands (excluding demos) - for onboarding status
  async hasUserRealBrands(userId: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('brands')
      .select('id, name, is_demo')
      .eq('owner_user_id', userId)
    
    if (error) {
      console.error('BrandService: Error checking user real brands:', error)
      return false
    }
    
    // If no brands at all, definitely needs onboarding
    if (!data || data.length === 0) {
      return false
    }
    
    // Filter out demo brands using the is_demo flag
    const realBrands = data.filter(brand => !brand.is_demo)
    
    // User has completed onboarding if they have ANY non-demo brands
    return realBrands.length > 0
  }

  // Get user's first brand (for default selection)
  async getUserFirstBrand(userId: string): Promise<Brand | null> {
    const { data, error } = await this.supabase
      .from('brands')
      .select('*')
      .eq('owner_user_id', userId)
      .order('created_at', { ascending: true })
      .limit(1)
      .single()
    
    if (error) {
      if (error.code === 'PGRST116') {
        return null // No brands found
      }
      console.error('Error fetching first brand:', error)
      return null
    }
    
    return data
  }

  // Validate domain format
  async validateDomain(domain: string): Promise<boolean> {
    try {
      const { data, error } = await this.supabase
        .rpc('validate_domain_format', { domain_input: domain })
      
      if (error) {
        console.error('Error validating domain:', error)
        return false
      }
      
      return data || false
    } catch (error) {
      console.error('Error validating domain:', error)
      return false
    }
  }

  // Normalize domain
  async normalizeDomain(domain: string): Promise<string> {
    try {
      const { data, error } = await this.supabase
        .rpc('normalize_domain', { domain_input: domain })
      
      if (error) {
        console.error('Error normalizing domain:', error)
        return domain
      }
      
      return data || domain
    } catch (error) {
      console.error('Error normalizing domain:', error)
      return domain
    }
  }
}

// Export singleton instance
export const brandService = new BrandService()

// Legacy Brand interface compatibility (for gradual migration)
export interface LegacyBrand {
  id: string
  name: string
  domain: string
  isActive: boolean
}

// Demo brand is now managed in the database and store

// Convert Supabase Brand to Legacy Brand format
export const convertToLegacyBrand = (brand: Brand, isActive: boolean = false): LegacyBrand => ({
  id: brand.id,
  name: brand.name || 'Unnamed Brand',
  domain: brand.domain || '',
  isActive,
  isDemo: brand.is_demo,
  // Preserve onboarding status for client-side logic
  onboarding_completed: brand.onboarding_completed,
  first_report_status: brand.first_report_status
} as any)

// Convert Legacy Brand to Supabase Brand format
export const convertFromLegacyBrand = (
  legacyBrand: Omit<LegacyBrand, 'id'>, 
  userId: string
): BrandInsert => ({
  user_id: userId,
  name: legacyBrand.name,
  domain: legacyBrand.domain
})
