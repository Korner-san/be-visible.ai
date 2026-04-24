export interface BusinessProfile {
  businessName: string
  description: string
  industry: string
  geographicScope: {
    type: 'local' | 'national' | 'global'
    primaryRegion: string
    secondaryRegions: string[]
    isLocalNiche: boolean
  }
  brandIdentity: string[]
  productsServices: string[]
  audienceDistribution: {
    simpleSeeker: number
    informedShopper: number
    evaluativeResearcher: number
  }
  suggestedCompetitors: Array<{ name: string; domain: string }>
  outputLanguage: string
  userRegion: string
}

export interface OnboardingV2Props {
  existingBrandId: string | null
  onComplete: () => void
  onNavigate?: (tab: string) => void
}

export type OnboardingState = 'A' | 'B_LOADING' | 'B_READY' | 'C' | 'LAUNCHING'

export interface FormData {
  brandName: string
  websiteUrl: string
  language: string
  region: string
}

export const LANGUAGES = [
  'English', 'Hebrew', 'Spanish', 'French', 'German',
  'Portuguese', 'Arabic', 'Italian', 'Dutch', 'Russian',
  'Japanese', 'Chinese (Simplified)', 'Korean',
]

export const REGIONS = [
  'United States', 'United Kingdom', 'Canada', 'Australia',
  'Germany', 'France', 'Spain', 'Italy', 'Israel', 'India',
  'Japan', 'Brazil', 'Mexico', 'Netherlands', 'Global',
]
