import React, { useState, useCallback, useRef } from 'react'
import { LeftA } from './LeftA'
import { RightA } from './RightA'
import { LeftB } from './LeftB'
import { RightB } from './RightB'
import { LeftC } from './LeftC'
import { RightC } from './RightC'
import type { OnboardingV2Props, OnboardingState, FormData, BusinessProfile } from './types'
import { supabase } from '../../lib/supabase'

export const OnboardingV2: React.FC<OnboardingV2Props> = ({ onComplete, onNavigate }) => {
  const [state, setState] = useState<OnboardingState>('A')
  const [formData, setFormData] = useState<FormData>({ brandName: '', websiteUrl: '', language: 'English', region: 'United States' })
  const [profile, setProfile] = useState<BusinessProfile | null>(null)
  const [topics, setTopics] = useState<string[]>([])
  const [promptsByTopic, setPromptsByTopic] = useState<Record<string, string[]>>({})
  const [completedTopics, setCompletedTopics] = useState<string[]>([])
  const [brandId, setBrandId] = useState<string | null>(null)
  const [scanError, setScanError] = useState<string | null>(null)
  const [launchError, setLaunchError] = useState<string | null>(null)
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null)

  const handleScan = useCallback(async (data: FormData) => {
    setFormData(data)
    setScanError(null)
    setProfile(null)
    setTopics([])
    setPromptsByTopic({})
    setCompletedTopics([])
    setBrandId(null)
    setState('B_LOADING')

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const authHeader = session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {}

      const response = await fetch('/api/onboarding/generate-v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        let msg = `Server error (${response.status})`
        try {
          const errData = await response.json()
          msg = errData.error || msg
        } catch {}
        setScanError(msg)
        setState('A')
        return
      }
      if (!response.body) {
        setScanError('No response stream. Please try again.')
        setState('A')
        return
      }

      const reader = response.body.getReader()
      readerRef.current = reader
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let lineEnd: number
        while ((lineEnd = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, lineEnd).trim()
          buffer = buffer.slice(lineEnd + 1)
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6))
            if (event.type === 'profile') {
              setProfile(event.data)
            } else if (event.type === 'topics') {
              setTopics(event.data)
            } else if (event.type === 'prompts_topic') {
              const { topic, prompts } = event.data
              setPromptsByTopic(prev => ({ ...prev, [topic]: prompts }))
              setCompletedTopics(prev => [...prev, topic])
            } else if (event.type === 'done') {
              setBrandId(event.data.brandId)
              setState('B_READY')
            } else if (event.type === 'error') {
              setScanError(event.data.message)
              setState('A')
            }
          } catch {}
        }
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        setScanError(err?.message ? `Error: ${err.message}` : 'Connection interrupted. Please try again.')
        setState('A')
      }
    }
  }, [])

  const handlePromptsConfirm = useCallback((edited: Record<string, string[]>) => {
    setPromptsByTopic(edited)
    setState('C')
  }, [])

  const handleLaunch = useCallback(async (competitors: string[]) => {
    if (!brandId) return
    setState('LAUNCHING')
    setLaunchError(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const authHeader = session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {}

      const res = await fetch('/api/onboarding/complete-final', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify({
          competitors,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      })

      const data = await res.json()

      if (data.busy) {
        setLaunchError(`System is busy — estimated wait: ${data.waitMinutes} min. Try again shortly.`)
        setState('C')
        return
      }

      if (!data.success) {
        setLaunchError(data.error || 'Launch failed. Please try again.')
        setState('C')
        return
      }

      onComplete()
    } catch {
      setLaunchError('Network error during launch. Please try again.')
      setState('C')
    }
  }, [brandId, onComplete])

  const isLaunching = state === 'LAUNCHING'

  return (
    <div className="flex h-screen w-full overflow-hidden">
      {/* Left panel */}
      <div className="w-1/2 flex flex-col bg-white border-r border-gray-100 overflow-y-auto">
        {(state === 'A') && (
          <LeftA
            onSubmit={handleScan}
            isLoading={false}
            error={scanError}
          />
        )}
        {(state === 'B_LOADING') && (
          <LeftB
            profile={profile}
            topics={topics}
            promptsByTopic={promptsByTopic}
            completedTopics={completedTopics}
            isComplete={false}
            onConfirm={handlePromptsConfirm}
          />
        )}
        {(state === 'B_READY') && (
          <LeftB
            profile={profile}
            topics={topics}
            promptsByTopic={promptsByTopic}
            completedTopics={completedTopics}
            isComplete={true}
            onConfirm={handlePromptsConfirm}
          />
        )}
        {(state === 'C' || state === 'LAUNCHING') && (
          <LeftC
            suggestedCompetitors={profile?.suggestedCompetitors || []}
            onLaunch={handleLaunch}
            isLaunching={isLaunching}
            launchError={launchError}
          />
        )}
      </div>

      {/* Right panel */}
      <div className="w-1/2 flex flex-col bg-slate-900 overflow-hidden">
        {(state === 'A') && <RightA />}
        {(state === 'B_LOADING' || state === 'B_READY') && (
          <RightB
            profile={profile}
            topics={topics}
            promptsByTopic={promptsByTopic}
            completedTopics={completedTopics}
            isComplete={state === 'B_READY'}
          />
        )}
        {(state === 'C' || state === 'LAUNCHING') && (
          <RightC
            brandName={formData.brandName}
            profile={profile}
          />
        )}
      </div>
    </div>
  )
}
