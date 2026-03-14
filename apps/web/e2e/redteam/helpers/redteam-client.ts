import { type SupabaseClient, createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321'
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!ANON_KEY) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is required')

/**
 * Create a Supabase client authenticated as a specific user.
 * Uses email/password sign-in (not service role).
 */
export async function createAuthenticatedClient(
  email: string,
  password: string,
): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`Auth failed for ${email}: ${error.message}`)
  return client
}
