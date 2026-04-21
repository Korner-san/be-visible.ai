import React, { useState } from 'react'
import { Globe, Languages, Loader2, AlertCircle } from 'lucide-react'
import type { FormData } from './types'
import { LANGUAGES, REGIONS } from './types'

interface LeftAProps {
  onSubmit: (data: FormData) => void
  isLoading: boolean
  error: string | null
}

export const LeftA: React.FC<LeftAProps> = ({ onSubmit, isLoading, error }) => {
  const [brandName, setBrandName] = useState('')
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [language, setLanguage] = useState('English')
  const [region, setRegion] = useState('United States')
  const [validationError, setValidationError] = useState<string | null>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setValidationError(null)

    const trimmedUrl = websiteUrl.trim()
    const trimmedName = brandName.trim()

    if (!trimmedName) { setValidationError('Brand name is required.'); return }
    if (!trimmedUrl) { setValidationError('Website URL is required.'); return }

    let url = trimmedUrl
    if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url

    onSubmit({ brandName: trimmedName, websiteUrl: url, language, region })
  }

  const displayError = error || validationError

  return (
    <div className="flex flex-col h-full px-10 py-12">
      {/* Logo */}
      <div className="flex items-center gap-2.5 mb-12">
        <div className="w-9 h-9 bg-brand-brown rounded-lg flex items-center justify-center shadow-sm flex-shrink-0">
          <span className="text-white font-bold text-base">B</span>
        </div>
        <span className="font-semibold text-slate-900 text-base tracking-tight">be-visible.ai</span>
      </div>

      {/* Heading */}
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-slate-900 leading-tight tracking-tight">
          Set up your brand
        </h1>
        <p className="text-slate-500 text-sm mt-2.5 leading-relaxed">
          We'll scan your website and generate 50 AI search prompts across 5 competitive topics — so you can start tracking your visibility today.
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-5 flex-1">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700">Brand name</label>
          <input
            type="text"
            placeholder="Acme Inc."
            value={brandName}
            onChange={e => setBrandName(e.target.value)}
            disabled={isLoading}
            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-brown/20 focus:border-brand-brown transition-all disabled:opacity-50"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700">Website URL</label>
          <input
            type="text"
            placeholder="https://www.example.com"
            value={websiteUrl}
            onChange={e => setWebsiteUrl(e.target.value)}
            disabled={isLoading}
            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-brown/20 focus:border-brand-brown transition-all disabled:opacity-50"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
              <Languages size={13} className="text-slate-400" /> Language
            </label>
            <select
              value={language}
              onChange={e => setLanguage(e.target.value)}
              disabled={isLoading}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-brown/20 focus:border-brand-brown transition-all disabled:opacity-50 cursor-pointer appearance-none"
            >
              {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
              <Globe size={13} className="text-slate-400" /> Region
            </label>
            <select
              value={region}
              onChange={e => setRegion(e.target.value)}
              disabled={isLoading}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-brown/20 focus:border-brand-brown transition-all disabled:opacity-50 cursor-pointer appearance-none"
            >
              {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>

        {displayError && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-xl">
            <AlertCircle size={15} className="text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-600 leading-relaxed">{displayError}</p>
          </div>
        )}

        <div className="mt-auto pt-4">
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 px-6 bg-brand-brown text-white rounded-xl font-semibold text-sm hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <><Loader2 size={15} className="animate-spin" /> Scanning…</>
            ) : (
              'Scan my brand →'
            )}
          </button>
          <p className="text-xs text-slate-400 text-center mt-3">
            Takes 20–30 seconds · Up to 5 scans per brand
          </p>
        </div>
      </form>
    </div>
  )
}
