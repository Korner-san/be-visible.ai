// @ts-nocheck
// Database type definitions for be-visible.ai Supabase schema
// Auto-generated types based on the database schema

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          subscription_plan: 'basic' | 'business' | 'custom'
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          subscription_plan?: 'basic' | 'business' | 'custom'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          subscription_plan?: 'basic' | 'business' | 'custom'
          created_at?: string
          updated_at?: string
        }
      }
      brands: {
        Row: {
          id: string
          owner_user_id: string
          name: string | null
          domain: string | null
          is_demo: boolean
          onboarding_completed: boolean
          onboarding_answers: Record<string, any> | null
          first_report_status: 'idle' | 'queued' | 'running' | 'succeeded' | 'failed'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          owner_user_id: string
          name?: string | null
          domain?: string | null
          is_demo?: boolean
          onboarding_completed?: boolean
          onboarding_answers?: Record<string, any> | null
          first_report_status?: 'idle' | 'queued' | 'running' | 'succeeded' | 'failed'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          owner_user_id?: string
          name?: string | null
          domain?: string | null
          is_demo?: boolean
          onboarding_completed?: boolean
          onboarding_answers?: Record<string, any> | null
          first_report_status?: 'idle' | 'queued' | 'running' | 'succeeded' | 'failed'
          created_at?: string
          updated_at?: string
        }
      }
      daily_reports: {
        Row: {
          id: string
          brand_id: string
          report_date: string
          report_score: number | null
          models_indexed: Record<string, any>
          bot_scans: number
          ai_sessions: number
          pages_indexed: number
          raw_ai_responses: Record<string, any>
          created_at: string
        }
        Insert: {
          id?: string
          brand_id: string
          report_date: string
          report_score?: number | null
          models_indexed?: Record<string, any>
          bot_scans?: number
          ai_sessions?: number
          pages_indexed?: number
          raw_ai_responses?: Record<string, any>
          created_at?: string
        }
        Update: {
          id?: string
          brand_id?: string
          report_date?: string
          report_score?: number | null
          models_indexed?: Record<string, any>
          bot_scans?: number
          ai_sessions?: number
          pages_indexed?: number
          raw_ai_responses?: Record<string, any>
          created_at?: string
        }
      }
      subscription_plans: {
        Row: {
          id: string
          name: string
          price_monthly: number | null
          max_brands: number
          max_queries_per_day: number
          features: Record<string, any>
          is_active: boolean
          created_at: string
        }
        Insert: {
          id: string
          name: string
          price_monthly?: number | null
          max_brands: number
          max_queries_per_day: number
          features?: Record<string, any>
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          price_monthly?: number | null
          max_brands?: number
          max_queries_per_day?: number
          features?: Record<string, any>
          is_active?: boolean
          created_at?: string
        }
      }
      prompt_templates: {
        Row: {
          id: string
          code: string
          template: string
          category: string | null
          description: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          code: string
          template: string
          category?: string | null
          description?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          code?: string
          template?: string
          category?: string | null
          description?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      brand_prompts: {
        Row: {
          id: string
          brand_id: string
          source_template_code: string
          raw_prompt: string
          improved_prompt: string | null
          status: 'draft' | 'improved' | 'selected' | 'archived' | 'inactive'
          category: string | null
          error_message: string | null
          source: 'ai_generated' | 'user_added'
          generation_metadata: Record<string, any>
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          brand_id: string
          source_template_code: string
          raw_prompt: string
          improved_prompt?: string | null
          status?: 'draft' | 'improved' | 'selected' | 'archived' | 'inactive'
          category?: string | null
          error_message?: string | null
          source?: 'ai_generated' | 'user_added'
          generation_metadata?: Record<string, any>
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          brand_id?: string
          source_template_code?: string
          raw_prompt?: string
          improved_prompt?: string | null
          status?: 'draft' | 'improved' | 'selected' | 'archived' | 'inactive'
          category?: string | null
          error_message?: string | null
          source?: 'ai_generated' | 'user_added'
          generation_metadata?: Record<string, any>
          created_at?: string
          updated_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_brand_count: {
        Args: {
          user_uuid: string
        }
        Returns: number
      }
      get_latest_brand_report: {
        Args: {
          brand_uuid: string
        }
        Returns: Database['public']['Tables']['daily_reports']['Row']
      }
      get_brand_reports_summary: {
        Args: {
          brand_uuid: string
          start_date: string
          end_date: string
        }
        Returns: {
          total_reports: number
          avg_score: number
          total_bot_scans: number
          total_ai_sessions: number
          total_pages_indexed: number
          date_range_days: number
        }[]
      }
      validate_domain_format: {
        Args: {
          domain_input: string
        }
        Returns: boolean
      }
      normalize_domain: {
        Args: {
          domain_input: string
        }
        Returns: string
      }
    }
    Enums: {
      subscription_plan_type: 'basic' | 'business' | 'custom'
    }
  }
}

// Type aliases for easier usage
export type User = Database['public']['Tables']['users']['Row']
export type UserInsert = Database['public']['Tables']['users']['Insert']
export type UserUpdate = Database['public']['Tables']['users']['Update']

export type Brand = Database['public']['Tables']['brands']['Row']
export type BrandInsert = Database['public']['Tables']['brands']['Insert']
export type BrandUpdate = Database['public']['Tables']['brands']['Update']

export type DailyReport = Database['public']['Tables']['daily_reports']['Row']
export type DailyReportInsert = Database['public']['Tables']['daily_reports']['Insert']
export type DailyReportUpdate = Database['public']['Tables']['daily_reports']['Update']

export type SubscriptionPlan = Database['public']['Tables']['subscription_plans']['Row']
export type SubscriptionPlanInsert = Database['public']['Tables']['subscription_plans']['Insert']
export type SubscriptionPlanUpdate = Database['public']['Tables']['subscription_plans']['Update']

export type PromptTemplate = Database['public']['Tables']['prompt_templates']['Row']
export type PromptTemplateInsert = Database['public']['Tables']['prompt_templates']['Insert']
export type PromptTemplateUpdate = Database['public']['Tables']['prompt_templates']['Update']

export type BrandPrompt = Database['public']['Tables']['brand_prompts']['Row']
export type BrandPromptInsert = Database['public']['Tables']['brand_prompts']['Insert']
export type BrandPromptUpdate = Database['public']['Tables']['brand_prompts']['Update']

// Extended types for application use
export interface BrandWithReports extends Brand {
  latest_report?: DailyReport
  report_count?: number
}

export interface UserWithSubscription extends User {
  subscription_details?: SubscriptionPlan
  brand_count?: number
}

export interface ReportSummary {
  total_reports: number
  avg_score: number
  total_bot_scans: number
  total_ai_sessions: number
  total_pages_indexed: number
  date_range_days: number
  trend_direction?: 'up' | 'down' | 'stable'
  score_change?: number
}

// Legacy Brand interface compatibility (from store/brands.ts)
export interface LegacyBrand {
  id: string
  name: string
  domain: string
  isActive: boolean
}

// Conversion utilities
export const convertToLegacyBrand = (brand: Brand, isActive: boolean = false): LegacyBrand => ({
  id: brand.id,
  name: brand.name,
  domain: brand.domain,
  isActive
})

export const convertFromLegacyBrand = (legacyBrand: Omit<LegacyBrand, 'id'>, userId: string): BrandInsert => ({
  owner_user_id: userId,
  name: legacyBrand.name,
  domain: legacyBrand.domain
})

// Subscription plan features type
export interface SubscriptionFeatures {
  daily_reports: boolean
  email_alerts: boolean
  api_access: boolean
  priority_support: boolean
  custom_queries: boolean
  advanced_analytics?: boolean
  white_label?: boolean
  dedicated_support?: boolean
}

// AI Models indexed type
export interface ModelsIndexed {
  gpt4?: boolean
  claude?: boolean
  perplexity?: boolean
  gemini?: boolean
  [key: string]: boolean | undefined
}

// Raw AI responses type structure
export interface RawAIResponses {
  gpt4_response?: string
  claude_response?: string
  perplexity_response?: string
  gemini_response?: string
  processing_time?: number
  query_timestamp?: string
  [key: string]: any
}
