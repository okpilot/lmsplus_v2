import { createServerSupabaseClient } from '@repo/db/server'
import type { User } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'

/**
 * Require an authenticated user in a Server Component or Server Action.
 * Redirects to `/auth/login` if the session is missing or invalid.
 */
export async function requireAuthUser(): Promise<User> {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) redirect('/auth/login')
  return user
}
