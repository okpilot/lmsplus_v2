import type { SupabaseClient } from '@supabase/supabase-js'

export type SessionUser = { id: string; email: string | null }

/** The auth surface this helper needs; the server and middleware clients both satisfy it. */
export type AuthClient = {
  auth: Pick<SupabaseClient['auth'], 'getSession' | 'getClaims' | 'getUser'>
}

/**
 * The caller's identity. Reads the cookie session once (`getSession`, which refreshes an expiring
 * token; untrusted until verified), then verifies its access token locally: `getClaims(token)`
 * checks signature + expiry against the cached JWKS, no Auth round trip. If that fails or yields
 * nothing it falls back to `getUser(token)` (one Auth round trip). Revocation is therefore bounded
 * by the access-token lifetime. Returns null when there is no valid session.
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
    if (!claimsError && verified) {
      const { sub, email } = verified.claims
      if (typeof sub !== 'string' || sub === '') return null
      return { id: sub, email: typeof email === 'string' ? email : null }
    }
    if (claimsError) console.error('[verifySessionUser] getClaims failed:', claimsError.message)
  } catch (err) {
    console.error('[verifySessionUser] getClaims failed:', err instanceof Error ? err.message : err)
  }
  return fetchVerifiedUser(supabase, token)
}

async function fetchVerifiedUser(supabase: AuthClient, token: string): Promise<SessionUser | null> {
  const { data, error } = await supabase.auth.getUser(token)
  if (error) {
    console.error('[verifySessionUser] getUser failed:', error.message)
    return null
  }
  if (!data.user) return null
  return { id: data.user.id, email: data.user.email ?? null }
}
