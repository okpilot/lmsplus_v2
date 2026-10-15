import { createServerSupabaseClient } from '@repo/db/server'
import { cache } from 'react'

export type SessionUser = { id: string; email: string | null }

/**
 * The caller's identity from a verified JWT (`getClaims`): signature + expiry checked locally
 * against the cached JWKS on asymmetric keys, no Auth round trip. Server-side revocation is
 * checked once per request by the proxy's `getUser()`. Memoized per render; a Server Action
 * re-verifies on every call. Returns null when there is no valid session.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase.auth.getClaims()
  if (error || !data) return null
  const { sub, email } = data.claims
  if (typeof sub !== 'string' || sub === '') return null
  return { id: sub, email: typeof email === 'string' ? email : null }
})
