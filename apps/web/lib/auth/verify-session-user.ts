import type { SupabaseClient } from '@supabase/supabase-js'

export type SessionUser = { id: string; email: string | null }

/** The auth surface this helper needs; the server and middleware clients both satisfy it. */
type AuthClient = {
  auth: Pick<SupabaseClient['auth'], 'getClaims'>
}

/**
 * The caller's identity. `getClaims()` reads the cookie session (refreshing an expiring token),
 * then verifies its access token: for an asymmetric signing key it checks signature + expiry
 * locally against the cached JWKS (no Auth round trip, refetched on a miss or expiry); for a
 * symmetric or missing `alg`, a header without `kid`, a `kid` absent from the JWKS, or no
 * WebCrypto, getClaims itself calls `getUser`. Revocation is therefore bounded by the
 * access-token lifetime. Returns null when there is no valid session.
 */
export async function verifySessionUser(supabase: AuthClient): Promise<SessionUser | null> {
  try {
    const { data: verified, error: claimsError } = await supabase.auth.getClaims()
    if (claimsError) {
      console.error('[verifySessionUser] getClaims failed:', claimsError.message)
      return null
    }
    if (!verified) return null
    const { sub, email, role, is_anonymous } = verified.claims
    if (role !== 'authenticated' || is_anonymous === true) return null
    if (typeof sub !== 'string' || sub === '') return null
    return { id: sub, email: typeof email === 'string' ? email : null }
  } catch (err) {
    console.error('[verifySessionUser] getClaims failed:', err instanceof Error ? err.message : err)
    return null
  }
}
