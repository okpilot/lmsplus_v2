import { createServerSupabaseClient } from '@repo/db/server'
import { redirect } from 'next/navigation'

type AdminAuth = {
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>
  userId: string
  organizationId: string
}

export async function requireAdmin(): Promise<AdminAuth> {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    redirect('/auth/login')
  }

  // `.is('deleted_at', null)` is defence in depth, not decoration: the RLS
  // policy `users_select` already scopes this read to a live row, but callers
  // like softDeleteQuestion now write through the service-role client, so RLS
  // is no longer a second check on their path. Without this filter, "a
  // soft-deleted admin cannot mutate data" would rest on a single policy in a
  // different query.
  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('role, organization_id')
    .eq('id', user.id)
    .is('deleted_at', null)
    .maybeSingle<{ role: string; organization_id: string }>()

  if (profileError) {
    console.error('[requireAdmin] Profile query error:', profileError.message)
    throw new Error('Service error: could not verify admin role')
  }

  if (profile?.role !== 'admin') {
    // `/app/dashboard`, not `/app`: there is no `app/app/page.tsx` and no custom
    // `not-found.tsx`, so `/app` renders the built-in 404 (#1167). Kept in step
    // with the proxy's admin-block bounce so both layers land the user in the
    // same place.
    redirect('/app/dashboard')
  }

  return { supabase, userId: user.id, organizationId: profile.organization_id }
}
