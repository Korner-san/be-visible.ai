import { type NextRequest } from 'next/server'
import { createClient } from './server'
import { createServiceClient } from './service'
import type { User } from '@supabase/supabase-js'

/**
 * Get authenticated user from either:
 * 1. Bearer token in Authorization header (Vite app — stores session in localStorage)
 * 2. Cookie-based session (Next.js SSR pages)
 */
export async function getAuthUser(request: NextRequest): Promise<User | null> {
  // Try Bearer token first (Vite app sends this)
  const authHeader = request.headers.get('Authorization')
  const token = authHeader?.replace('Bearer ', '').trim()
  if (token) {
    const serviceClient = createServiceClient()
    const { data: { user } } = await serviceClient.auth.getUser(token)
    if (user) return user
  }

  // Fallback to cookie-based auth (Next.js pages)
  const cookieClient = await createClient()
  const { data: { user } } = await cookieClient.auth.getUser()
  return user || null
}
