/**
 * Supabase Client for Worker
 * Uses service role key to bypass RLS for cron jobs
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { Database } from '../../types/database'

let supabaseServiceClient: SupabaseClient<Database> | null = null

export const createServiceClient = () => {
  if (supabaseServiceClient) {
    return supabaseServiceClient
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Missing Supabase environment variables')
  }

  supabaseServiceClient = createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })

  return supabaseServiceClient
}


