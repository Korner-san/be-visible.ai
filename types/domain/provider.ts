/**
 * Provider type definitions
 * Single source of truth for all AI model providers
 */

export type Provider = 'perplexity' | 'google_ai_overview' | 'chatgpt' | 'claude'

export const PROVIDERS: readonly Provider[] = [
  'perplexity',
  'google_ai_overview',
  'chatgpt',
  'claude'
] as const

export const PROVIDER_DISPLAY_NAMES: Record<Provider, string> = {
  perplexity: 'Perplexity',
  google_ai_overview: 'Google AI Overview',
  chatgpt: 'ChatGPT',
  claude: 'Claude'
}

// CHATGPT-ONLY MODE: Only ChatGPT is active for Basic plan ($30)
// Perplexity and Google AI Overview are reserved for Advanced/Business/Corporate plans
export const ACTIVE_PROVIDERS: readonly Provider[] = [
  'chatgpt'
] as const

// Future Advanced plan providers (currently locked in UI)
export const LOCKED_PROVIDERS: readonly Provider[] = [
  'perplexity',
  'google_ai_overview'
] as const

export type ProviderStatus = 'not_started' | 'running' | 'complete' | 'failed' | 'expired' | 'skipped'

export type ProviderResultStatus = 'ok' | 'no_result' | 'error'

/**
 * Provider response interfaces
 */
export interface BaseProviderResponse {
  provider: Provider
  responseText: string
  responseTimeMs: number
  citations: ProviderCitation[]
  error?: string
}

export interface ProviderCitation {
  url: string
  title?: string
  snippet?: string
  domain?: string
}

/**
 * Provider-specific data structure (for provider_data JSONB column)
 */
export interface ProviderData {
  raw_response?: any // Original API response
  model?: string // Model version used
  tokens?: {
    input: number
    output: number
    total: number
  }
  metadata?: Record<string, any> // Provider-specific metadata
}

/**
 * Utility functions
 */
export const isActiveProvider = (provider: string): provider is Provider => {
  return ACTIVE_PROVIDERS.includes(provider as Provider)
}

export const getProviderDisplayName = (provider: Provider): string => {
  return PROVIDER_DISPLAY_NAMES[provider] || provider
}

export const parseProviders = (providersParam: string | null | undefined): Provider[] => {
  if (!providersParam) return [...ACTIVE_PROVIDERS]
  
  const parsed = providersParam.split(',').filter(p => 
    PROVIDERS.includes(p as Provider)
  ) as Provider[]
  
  return parsed.length > 0 ? parsed : [...ACTIVE_PROVIDERS]
}

