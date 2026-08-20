import { createServerSupabaseClient } from '@repo/db/server'
import { redirect } from 'next/navigation'
import { cache } from 'react'

type AdminAuth = {
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>
  userId: string
  organizationId: string
}

/**
 * Resolve the calling admin's identity, org and Supabase client, or redirect.
 *
 * Wrapped in React `cache()` for per-request memoization (#1169). A single admin
 * render consults this gate repeatedly — `/app/admin/internal-exams` calls it 5
 * times (the page gate plus four queries `Promise.all`d in
 * `_components/internal-exams-content.tsx`), `/app/admin/dashboard` 4 times via
 * its four Suspense children — and each call re-ran the whole body: build a
 * client, await `getUser()`, await the `users` SELECT. Measured 2026-08-20 on
 * Next 16.3.0 (dev server): body executions per render fall 5 -> 1 and 4 -> 1.
 *
 * What this does NOT save is HTTP round trips. Measured the same day at the
 * API gateway, the
 * `/auth/v1/user` and `/rest/v1/users` counts are identical with and without the
 * wrap: Next already dedupes identical GETs within one render. So the saving is
 * redundant work and allocation, not network traffic — #1169's premise that
 * "every call performs a real network round-trip" does not hold as written.
 *
 * Scope, precisely, because this is an authorization gate: the memo lives in a
 * Map allocated per RSC flight request, so it cannot cross requests. In a Server
 * Action there is no resolvable React flight request — Next runs the action body
 * under its own `workUnitAsyncStorage`, not React's `requestStorage` — so the
 * cache lookup falls back to a throwaway Map and the body re-executes on every
 * call. (Not because the dispatcher is absent: it is installed process-globally
 * and never cleared.) So every MUTATION still re-verifies its caller on every
 * call; only the render path is memoized.
 */
export const requireAdmin = cache(async (): Promise<AdminAuth> => {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    // `/` is the login page: it renders `app/_components/login-form.tsx`, and
    // `proxy.ts` sends unauthenticated `/app/*` traffic here too. The previous
    // target `/auth/login` is not a route at all — there is no `login/` directory
    // under `app/auth/` — so this redirect used to land on a 404.
    redirect('/')
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
    // `/app/dashboard`, not `/app`: since #1170 `/app` is itself only a redirect
    // to `/app/dashboard`, so bouncing there would add a hop for the same
    // destination. Kept in step with the proxy's admin-block bounce so both
    // layers land the user in the same place.
    redirect('/app/dashboard')
  }

  return { supabase, userId: user.id, organizationId: profile.organization_id }
})
