import { createServerSupabaseClient } from '@repo/db/server'
import { redirect } from 'next/navigation'
import { cache } from 'react'
import { getCallerProfile } from './get-caller-profile'
import { verifySessionUser } from './verify-session-user'

type AdminAuth = {
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>
  userId: string
  organizationId: string
}

/**
 * Resolve the calling admin's identity, org and Supabase client, or redirect.
 *
 * Identity: `verifySessionUser()` (local JWT check; a signed-out or banned admin's
 * unexpired token passes for the access-token lifetime). Role and org: the
 * `deleted_at`-filtered `users` read, so a soft-deleted admin is rejected at once.
 *
 * `cache()` memoizes per RSC flight request (#1169). A Server Action has no
 * resolvable flight request, so the body re-runs on every mutation.
 */
export const requireAdmin = cache(async (): Promise<AdminAuth> => {
  const supabase = await createServerSupabaseClient()
  const user = await verifySessionUser(supabase)

  if (!user) {
    // `/` is the login page: it renders `app/_components/login-form.tsx`, and
    // `proxy.ts` sends unauthenticated `/app/*` traffic here too. The previous
    // target `/auth/login` is not a route at all — there is no `login/` directory
    // under `app/auth/` — so this redirect used to land on a 404.
    redirect('/')
  }

  const { data: profile, error: profileError } = await getCallerProfile(user.id)

  if (profileError) {
    console.error('[requireAdmin] Profile query error:', profileError.message)
    throw new Error('Service error: could not verify admin role')
  }

  if (profile?.role !== 'admin') {
    // `/app/dashboard`, not `/app`: since #1170 `/app` is itself only a redirect
    // to `/app/dashboard`, so bouncing there would add a hop for the same
    // destination.
    redirect('/app/dashboard')
  }

  return { supabase, userId: user.id, organizationId: profile.organization_id }
})
