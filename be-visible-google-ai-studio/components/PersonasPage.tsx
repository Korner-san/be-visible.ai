import React, { useEffect, useMemo, useState } from 'react'
import { Loader2, Plus, UserRound } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

interface Persona {
  id: string
  name: string
  description: string
  created_at: string
}

interface PersonasPageProps {
  brandId: string | null
}

const STARTER_LIMIT = 3
const STARTER_PLANS = new Set(['starter', 'basic', 'free_trial'])

export const PersonasPage: React.FC<PersonasPageProps> = ({ brandId }) => {
  const { user } = useAuth()
  const [personas, setPersonas] = useState<Persona[]>([])
  const [subscriptionPlan, setSubscriptionPlan] = useState<string>('basic')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isStarterPlan = useMemo(() => {
    return STARTER_PLANS.has((subscriptionPlan || 'basic').toLowerCase())
  }, [subscriptionPlan])

  const remaining = Math.max(STARTER_LIMIT - personas.length, 0)
  const limitReached = isStarterPlan && remaining === 0

  useEffect(() => {
    if (!brandId || !user?.id) return

    let cancelled = false
    setLoading(true)
    setError(null)

    Promise.all([
      supabase
        .from('brand_personas')
        .select('id, name, description, created_at')
        .eq('brand_id', brandId)
        .eq('is_active', true)
        .order('created_at', { ascending: true }),
      supabase
        .from('users')
        .select('subscription_plan')
        .eq('id', user.id)
        .single(),
    ]).then(([personasResult, userResult]) => {
      if (cancelled) return

      if (personasResult.error) {
        setError(personasResult.error.message)
      } else {
        setPersonas((personasResult.data || []) as Persona[])
      }

      if (userResult.data?.subscription_plan) {
        setSubscriptionPlan(userResult.data.subscription_plan)
      }

      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [brandId, user?.id])

  const nextPersonaName = () => {
    const usedNumbers = personas
      .map(persona => Number((persona.name.match(/^Persona\s+(\d+)$/i) || [])[1]))
      .filter(Number.isFinite)

    for (let i = 1; i <= personas.length + 1; i += 1) {
      if (!usedNumbers.includes(i)) return `Persona ${i}`
    }

    return `Persona ${personas.length + 1}`
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = description.trim()
    if (!trimmed || !brandId || !user?.id || limitReached) return

    setSaving(true)
    setError(null)

    const { data, error: insertError } = await supabase
      .from('brand_personas')
      .insert({
        brand_id: brandId,
        owner_user_id: user.id,
        name: nextPersonaName(),
        description: trimmed,
      })
      .select('id, name, description, created_at')
      .single()

    if (insertError) {
      setError(insertError.message)
    } else if (data) {
      setPersonas(prev => [...prev, data as Persona])
      setDescription('')
    }

    setSaving(false)
  }

  if (!brandId) {
    return (
      <div className="py-24 text-center">
        <p className="text-sm font-semibold text-slate-500">Select a brand to manage personas.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="py-32 flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-brand-brown/40" />
      </div>
    )
  }

  return (
    <div className="max-w-3xl space-y-6 animate-fadeIn pb-24">
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <UserRound size={18} className="text-brand-brown" />
              <h2 className="text-xl font-black text-slate-900 tracking-tight">Personas</h2>
            </div>
            <p className="text-sm text-slate-500 leading-relaxed max-w-2xl">
              Describe the user persona you want us to simulate. We will use this to understand the type of person that should interact with ChatGPT and ask your brand-related prompts.
            </p>
          </div>
          {isStarterPlan && (
            <div className="shrink-0 rounded-xl bg-slate-50 border border-slate-100 px-4 py-3 text-right">
              <p className="text-xs font-black text-slate-900">Starter limit</p>
              <p className="text-[11px] font-semibold text-slate-400">
                {personas.length} saved · {remaining} remaining
              </p>
            </div>
          )}
        </div>

        <form onSubmit={handleSave} className="mt-6 space-y-3">
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            disabled={saving || limitReached}
            rows={5}
            placeholder="Example: A first-time home buyer in Tel Aviv comparing new apartment projects, worried about budget, delivery timelines, and developer reputation."
            className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-slate-700 outline-none transition-all placeholder:text-slate-300 focus:border-brand-brown focus:bg-white focus:ring-2 focus:ring-brand-brown/10 disabled:cursor-not-allowed disabled:opacity-60"
          />

          {error && (
            <p className="text-xs font-semibold text-rose-600">{error}</p>
          )}

          {limitReached && (
            <p className="text-xs font-semibold text-slate-500">
              Starter subscriptions can save up to 3 personas. Upgrade your subscription to add more.
            </p>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving || limitReached || description.trim().length === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-brown px-5 py-3 text-xs font-black tracking-widest text-white shadow-lg shadow-brand-brown/10 transition-all hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
            >
              {saving ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : <><Plus size={15} /> Save persona</>}
            </button>
          </div>
        </form>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-sm font-black text-slate-800">Saved personas</h3>
        </div>

        {personas.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="text-sm font-semibold text-slate-400">No personas saved yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {personas.map(persona => (
              <div key={persona.id} className="px-6 py-5">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-brown/5 text-brand-brown">
                    <UserRound size={17} />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm font-black text-slate-900">{persona.name}</h4>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-500">
                      {persona.description}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
