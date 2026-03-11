import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './types'

export function createClient() {
  // .env.local guarantees these are set at build time
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')

  return createBrowserClient<Database>(url, key)
}
