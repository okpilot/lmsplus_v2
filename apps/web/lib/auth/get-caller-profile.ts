import { createServerSupabaseClient } from '@repo/db/server'
import { cache } from 'react'

export type CallerProfile = {
  full_name: string | null
  email: string
  role: string
  organization_id: string
}

// Keyed by userId; RLS `users_select` (id = auth.uid() AND deleted_at IS NULL) limits it to the
// caller's own row. `.is('deleted_at', null)` is defence in depth: requireAdmin's callers (e.g.
// softDeleteQuestion) write through the service-role client, so RLS is no second check on their
// path, and "a soft-deleted admin cannot mutate data" must not rest on a single policy in a
// different query.
// Render path only: cache() does not memoize in Server Actions, so each action call reads again.
export const getCallerProfile = cache(async (userId: string) => {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('users')
    .select('full_name, email, role, organization_id')
    .eq('id', userId)
    .is('deleted_at', null)
    .maybeSingle<CallerProfile>()
  return { data, error }
})
