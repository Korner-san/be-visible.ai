import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { generateRawKey, hashKey } from '@/lib/api-key-auth'

// GET — list the current user's API keys (metadata only, never the raw key)
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const svc = createServiceClient()
  const { data, error } = await svc
    .from('user_api_keys')
    .select('id, label, created_at, last_used_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ ok: false, error: 'db_error' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, keys: data || [] })
}

// POST — create a new API key; returns raw key exactly once
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  let label = 'Default'
  try {
    const body = await request.json()
    if (body?.label && typeof body.label === 'string') {
      label = body.label.slice(0, 64)
    }
  } catch {}

  const rawKey = generateRawKey()
  const keyHash = hashKey(rawKey)

  const svc = createServiceClient()
  const { data, error } = await svc
    .from('user_api_keys')
    .insert({ user_id: user.id, key_hash: keyHash, label })
    .select('id, label, created_at')
    .single()

  if (error) {
    return NextResponse.json({ ok: false, error: 'db_error' }, { status: 500 })
  }

  // Raw key returned ONCE — never stored, never retrievable again
  return NextResponse.json({ ok: true, key: rawKey, id: data.id, label: data.label, createdAt: data.created_at })
}

// DELETE — revoke an API key by id
export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  let keyId: string | null = null
  try {
    const body = await request.json()
    keyId = body?.id ?? null
  } catch {}

  if (!keyId) {
    return NextResponse.json({ ok: false, error: 'id_required' }, { status: 400 })
  }

  const svc = createServiceClient()
  const { error } = await svc
    .from('user_api_keys')
    .delete()
    .eq('id', keyId)
    .eq('user_id', user.id) // only delete own keys

  if (error) {
    return NextResponse.json({ ok: false, error: 'db_error' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
