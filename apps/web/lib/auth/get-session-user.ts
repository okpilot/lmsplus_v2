import { createServerSupabaseClient } from '@repo/db/server'
import { cache } from 'react'

export type SessionUser = { id: string; email: string | null }

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>

/**
 * The caller's identity. Reads the cookie session once (`getSession`, untrusted until verified),
 * then verifies its access token: `getClaims(token)` checks signature + expiry locally against the
 * cached JWKS, no Auth round trip. If that fails it falls back to `getUser(token)` (one Auth round
 * trip) so it never disagrees with the proxy's `getUser()` — a disagreement loops `/app` <-> `/`.
 * Server-side revocation is checked by the proxy's `getUser()`. Memoized per render; a Server
 * Action re-verifies on every call. Returns null when there is no valid session.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase.auth.getSession()
  if (error) {
    console.error('[getSessionUser] getSession failed:', error.message)
    return null
  }
  const token = data.session?.access_token
  if (!token) return null
  try {
    const { data: verified, error: claimsError } = await supabase.auth.getClaims(token)
    if (!claimsError) {
      if (!verified) return null
      const { sub, email } = verified.claims
      if (typeof sub !== 'string' || sub === '') return null
      return { id: sub, email: typeof email === 'string' ? email : null }
    }
    console.error('[getSessionUser] getClaims failed:', claimsError.message)
  } catch (err) {
    console.error('[getSessionUser] getClaims failed:', err instanceof Error ? err.message : err)
  }
  return fetchVerifiedUser(supabase, token)
})

async function fetchVerifiedUser(
  supabase: SupabaseClient,
  token: string,
): Promise<SessionUser | null> {
  const { data, error } = await supabase.auth.getUser(token)
  if (error) {
    console.error('[getSessionUser] getUser failed:', error.message)
    return null
  }
  if (!data.user) return null
  return { id: data.user.id, email: data.user.email ?? null }
}
