import { createServerSupabaseClient } from '@repo/db/server'
import { redirect } from 'next/navigation'
import { readTempPasswordState } from './temp-password'
import { verifySessionUser } from './verify-session-user'

/**
 * Shared guard for the set-password page: redirects to `/` when there is no
 * authenticated user, or to `nextPath` (falling back to the dashboard) when
 * the caller's temp-password state is not `'active'`.
 */
export async function requireActiveTempPassword(nextPath: string | null): Promise<void> {
  const supabase = await createServerSupabaseClient()
  const user = await verifySessionUser(supabase)
  if (!user) redirect('/')

  const state = await readTempPasswordState(supabase, user.id)
  if (state !== 'active') redirect(nextPath ?? '/app/dashboard')
}
