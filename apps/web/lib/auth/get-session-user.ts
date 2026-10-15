import { createServerSupabaseClient } from '@repo/db/server'
import { cache } from 'react'

export type SessionUser = { id: string; email: string | null }

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>

/**
 * The caller's identity from a verified JWT (`getClaims`): signature + expiry checked locally
 * against the cached JWKS on asymmetric keys, no Auth round trip. If `getClaims()` fails it
 * falls back to `getUser()` (one Auth round trip) so it never disagrees with the proxy's
 * `getUser()` — a disagreement loops `/app` <-> `/`. Server-side revocation is checked by the
 * proxy's `getUser()`. Memoized per render; a Server Action re-verifies on every call.
 * Returns null when there is no valid session.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createServerSupabaseClient()
  try {
    const { data, error } = await supabase.auth.getClaims()
    if (!error) {
      if (!data) return null
      const { sub, email } = data.claims
      if (typeof sub !== 'string' || sub === '') return null
      return { id: sub, email: typeof email === 'string' ? email : null }
    }
    console.error('[getSessionUser] getClaims failed:', error.message)
  } catch (err) {
    console.error('[getSessionUser] getClaims failed:', err instanceof Error ? err.message : err)
  }
  return fetchVerifiedUser(supabase)
})

async function fetchVerifiedUser(supabase: SupabaseClient): Promise<SessionUser | null> {
  const { data, error } = await supabase.auth.getUser()
  if (error) {
    console.error('[getSessionUser] getUser failed:', error.message)
    return null
  }
  if (!data.user) return null
  return { id: data.user.id, email: data.user.email ?? null }
}
