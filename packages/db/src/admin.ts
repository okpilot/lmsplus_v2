import { createClient } from '@supabase/supabase-js'
import type { Database } from './types'

// Guard: this module must never be imported in client-side code
if (typeof (globalThis as Record<string, unknown>).window !== 'undefined') {
  throw new Error('admin client must not be used in the browser')
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('Missing Supabase env vars')

export const adminClient = createClient<Database>(url, key)
