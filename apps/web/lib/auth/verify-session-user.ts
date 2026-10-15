import type { SupabaseClient } from '@supabase/supabase-js'

export type SessionUser = { id: string; email: string | null }

/** The auth surface this helper needs; the server and middleware clients both satisfy it. */
type AuthClient = {
  auth: Pick<SupabaseClient['auth'], 'getSession' | 'getClaims'>
}

/**
 * The caller's identity. Reads the cookie session once (`getSession`, which refreshes an expiring
 * token; untrusted until verified), then verifies its access token with `getClaims(token)`: for an
 * asymmetric signing key it checks signature + expiry locally against the cached JWKS (no Auth
 * round trip); for a symmetric key getClaims itself calls `getUser(token)`. Revocation is
 * therefore bounded by the access-token lifetime. Returns null when there is no valid session.
 */
export async function verifySessionUser(supabase: AuthClient): Promise<SessionUser | null> {
  const { data, error } = await supabase.auth.getSession()
  if (error) {
    console.error('[verifySessionUser] getSession failed:', error.message)
    return null
  }
  const token = data.session?.access_token
  if (!token) return null
  try {
    const { data: verified, error: claimsError } = await supabase.auth.getClaims(token)
    if (claimsError) {
      console.error('[verifySessionUser] getClaims failed:', claimsError.message)
      return null
    }
    if (!verified) return null
    const { sub, email, role } = verified.claims
    if (role !== 'authenticated') return null
    if (typeof sub !== 'string' || sub === '') return null
    return { id: sub, email: typeof email === 'string' ? email : null }
  } catch (err) {
    console.error('[verifySessionUser] getClaims failed:', err instanceof Error ? err.message : err)
    return null
  }
}
