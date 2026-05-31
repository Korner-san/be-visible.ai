import { createHash } from 'crypto'
import { createServiceClient } from './supabase/service'

export interface ApiKeyIdentity {
  userId: string
  keyId: string
}

/**
 * Validates an Authorization: Bearer <token> header against user_api_keys.
 * Returns the key owner's userId, or null if the key is missing/invalid.
 * Updates last_used_at on success.
 */
export async function validateApiKey(request: Request): Promise<ApiKeyIdentity | null> {
  const authHeader = request.headers.get('authorization') || ''
  if (!authHeader.startsWith('Bearer ')) return null

  const rawKey = authHeader.slice(7).trim()
  if (!rawKey) return null

  const keyHash = createHash('sha256').update(rawKey).digest('hex')

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('user_api_keys')
    .select('id, user_id')
    .eq('key_hash', keyHash)
    .single()

  if (error || !data) return null

  // Fire-and-forget last_used_at update — don't await, don't fail the request
  supabase
    .from('user_api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id)
    .then(() => {})

  return { userId: data.user_id, keyId: data.id }
}

/**
 * Generates a new API key string (raw). Caller is responsible for hashing before storage.
 * Format: sk_bv_<32 hex chars>
 */
export function generateRawKey(): string {
  // Use Web Crypto (available in Next.js edge/node runtimes)
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
  return `sk_bv_${hex}`
}

/**
 * SHA-256 hashes a raw key for safe storage.
 */
export function hashKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex')
}
