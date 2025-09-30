// Supabase database helper functions and utilities
import { createClient } from './client'
import { createServerClient } from './server'
import type { 
  Database, 
  Brand, 
  BrandInsert, 
  BrandUpdate,
  User,
  UserInsert,
  UserUpdate,
  DailyReport,
  DailyReportInsert,
  DailyReportUpdate,
  SubscriptionPlan,
  ReportSummary
} from '@/types/database'

// Client-side database operations
export class DatabaseClient {
  private supabase = createClient()

  // User operations
  async getUser(userId: string): Promise<User | null> {
    const { data, error } = await this.supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single()
    
    if (error) {
      console.error('Error fetching user:', error)
      return null
    }
    return data
  }

  async updateUser(userId: string, updates: UserUpdate): Promise<User | null> {
    const { data, error } = await this.supabase
      .from('users')
      .update(updates)
      .eq('id', userId)
      .select()
      .single()
    
    if (error) {
      console.error('Error updating user:', error)
      return null
    }
    return data
  }

  // Brand operations
  async getUserBrands(userId: string): Promise<Brand[]> {
    const { data, error } = await this.supabase
      .from('brands')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    
    if (error) {
      console.error('Error fetching brands:', error)
      return []
    }
    return data || []
  }

  async createBrand(brandData: BrandInsert): Promise<Brand | null> {
    const { data, error } = await this.supabase
      .from('brands')
      .insert(brandData)
      .select()
      .single()
    
    if (error) {
      console.error('Error creating brand:', error)
      return null
    }
    return data
  }

  async updateBrand(brandId: string, updates: BrandUpdate): Promise<Brand | null> {
    const { data, error } = await this.supabase
      .from('brands')
      .update(updates)
      .eq('id', brandId)
      .select()
      .single()
    
    if (error) {
      console.error('Error updating brand:', error)
      return null
    }
    return data
  }

  async deleteBrand(brandId: string): Promise<boolean> {
    const { error } = await this.supabase
      .from('brands')
      .delete()
      .eq('id', brandId)
    
    if (error) {
      console.error('Error deleting brand:', error)
      return false
    }
    return true
  }

  // Daily reports operations
  async getBrandReports(
    brandId: string, 
    startDate?: string, 
    endDate?: string
  ): Promise<DailyReport[]> {
    let query = this.supabase
      .from('daily_reports')
      .select('*')
      .eq('brand_id', brandId)
      .order('report_date', { ascending: false })
    
    if (startDate) {
      query = query.gte('report_date', startDate)
    }
    if (endDate) {
      query = query.lte('report_date', endDate)
    }
    
    const { data, error } = await query
    
    if (error) {
      console.error('Error fetching brand reports:', error)
      return []
    }
    return data || []
  }

  async getLatestBrandReport(brandId: string): Promise<DailyReport | null> {
    const { data, error } = await this.supabase
      .rpc('get_latest_brand_report', { brand_uuid: brandId })
    
    if (error) {
      console.error('Error fetching latest brand report:', error)
      return null
    }
    return data
  }

  async createDailyReport(reportData: DailyReportInsert): Promise<DailyReport | null> {
    const { data, error } = await this.supabase
      .from('daily_reports')
      .insert(reportData)
      .select()
      .single()
    
    if (error) {
      console.error('Error creating daily report:', error)
      return null
    }
    return data
  }

  async getBrandReportsSummary(
    brandId: string, 
    startDate: string, 
    endDate: string
  ): Promise<ReportSummary | null> {
    const { data, error } = await this.supabase
      .rpc('get_brand_reports_summary', {
        brand_uuid: brandId,
        start_date: startDate,
        end_date: endDate
      })
    
    if (error) {
      console.error('Error fetching reports summary:', error)
      return null
    }
    return data?.[0] || null
  }

  // Subscription plans operations
  async getSubscriptionPlans(): Promise<SubscriptionPlan[]> {
    const { data, error } = await this.supabase
      .from('subscription_plans')
      .select('*')
      .eq('is_active', true)
      .order('price_monthly', { ascending: true })
    
    if (error) {
      console.error('Error fetching subscription plans:', error)
      return []
    }
    return data || []
  }

  async getSubscriptionPlan(planId: string): Promise<SubscriptionPlan | null> {
    const { data, error } = await this.supabase
      .from('subscription_plans')
      .select('*')
      .eq('id', planId)
      .single()
    
    if (error) {
      console.error('Error fetching subscription plan:', error)
      return null
    }
    return data
  }

  // Utility functions
  async getUserBrandCount(userId: string): Promise<number> {
    const { data, error } = await this.supabase
      .rpc('get_user_brand_count', { user_uuid: userId })
    
    if (error) {
      console.error('Error getting user brand count:', error)
      return 0
    }
    return data || 0
  }

  async validateDomain(domain: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .rpc('validate_domain_format', { domain_input: domain })
    
    if (error) {
      console.error('Error validating domain:', error)
      return false
    }
    return data || false
  }

  async normalizeDomain(domain: string): Promise<string> {
    const { data, error } = await this.supabase
      .rpc('normalize_domain', { domain_input: domain })
    
    if (error) {
      console.error('Error normalizing domain:', error)
      return domain
    }
    return data || domain
  }
}

// Server-side database operations (for API routes)
export class ServerDatabaseClient {
  private supabase

  constructor(request: Request) {
    this.supabase = createServerClient(request)
  }

  // Same methods as DatabaseClient but using server client
  // Add server-specific operations here as needed
}

// Export singleton instance for client-side use
export const db = new DatabaseClient()

// Type exports for convenience
export type { Database, Brand, User, DailyReport, SubscriptionPlan, ReportSummary }
