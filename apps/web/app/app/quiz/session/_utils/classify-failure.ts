import { createClient } from '@repo/db/client'
import { type AuthError, isAuthRetryableFetchError } from '@supabase/supabase-js'
import { withTimeout } from '@/lib/utils/with-timeout'

export type FailureKind = 'offline' | 'signed-out' | 'server'

export const PROBE_TIMEOUT_MS = 3000

const SIGNED_OUT_CODES = new Set([
  'refresh_token_not_found',
  'refresh_token_already_used',
  'invalid_grant',
  'session_not_found',
])

function isSignedOutError(error: AuthError): boolean {
  if (error.name === 'AuthSessionMissingError') return true
  if (error.status === 401 || error.status === 403) return true
  return error.code !== undefined && SIGNED_OUT_CODES.has(error.code)
}

async function probe(): Promise<FailureKind> {
  const { data, error } = await createClient().auth.getUser()
  if (error) {
    if (isAuthRetryableFetchError(error) || error.status === 0) return 'offline'
    return isSignedOutError(error) ? 'signed-out' : 'server'
  }
  return data.user ? 'server' : 'signed-out'
}

/**
 * Decides why a Server Action call failed. Offline browser → offline; otherwise a bounded
 * browser-side auth probe: fetch failure or timeout → offline; missing session, 401/403 or a
 * dead refresh token → signed-out; no user and no error → signed-out; anything else → server.
 * The server's own SIGN_IN result is not trusted by itself — the browser probe decides.
 * `thrown` is the error the Server Action call threw, passed only on a job's FIRST attempt: a
 * TypeError (what a failed `fetch` throws) is offline without probing, since the link may have
 * recovered before the probe runs. Later attempts omit it so a client-bug TypeError cannot loop
 * silently forever. A server-answered error is a plain Error and keeps the probe path.
 */
export async function classifyFailure(thrown?: unknown): Promise<FailureKind> {
  if (thrown instanceof TypeError) return 'offline'
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 'offline'
  const guarded = probe().catch((err): FailureKind => {
    console.warn('[classify-failure] auth probe threw (best-effort):', err)
    return 'server'
  })
  return withTimeout(guarded, PROBE_TIMEOUT_MS, 'offline')
}
