/**
 * Supabase Client for Worker
 * Uses service role key to bypass RLS for cron jobs
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { Database } from '../types/database'

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

  console.log('🔧 [SUPABASE CLIENT] Creating Supabase client...')
  console.log('🔧 [SUPABASE CLIENT] URL:', supabaseUrl)
  console.log('🔧 [SUPABASE CLIENT] Key present:', !!supabaseServiceRoleKey)
  console.log('🔧 [SUPABASE CLIENT] Key length:', supabaseServiceRoleKey.length)

  try {
    supabaseServiceClient = createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      },
      global: {
        fetch: (...args) => {
          console.log('🌐 [SUPABASE FETCH] Request:', args[0])
          return fetch(...args).catch((error) => {
            console.error('❌ [SUPABASE FETCH] Error:', {
              message: error.message,
              code: error.code,
              cause: error.cause,
              stack: error.stack
            })
            throw error
          })
        }
      }
    })

    console.log('✅ [SUPABASE CLIENT] Client created successfully')
    return supabaseServiceClient
  } catch (error) {
    console.error('❌ [SUPABASE CLIENT] Failed to create client:', error)
    throw error
  }
}


