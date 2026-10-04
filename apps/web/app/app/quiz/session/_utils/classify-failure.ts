import { createClient } from '@repo/db/client'
import { type AuthError, isAuthRetryableFetchError } from '@supabase/supabase-js'
import { withTimeout } from '@/lib/utils/with-timeout'

export type FailureKind = 'offline' | 'signed-out' | 'server'

type Decision = FailureKind | 'unknown'

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

async function probe(): Promise<Decision> {
  const { data, error } = await createClient().auth.getUser()
  if (error) {
    if (error.status === 0) return 'offline'
    // The Auth server answered with a 5xx: the link is up, so this is undecided, not offline.
    if (isAuthRetryableFetchError(error)) return 'unknown'
    return isSignedOutError(error) ? 'signed-out' : 'server'
  }
  return data.user ? 'server' : 'signed-out'
}

/**
 * Decides why a Server Action call failed. Offline browser → offline; otherwise a bounded
 * browser-side auth probe: fetch failure (no response, status 0) → offline; an Auth 5xx → undecided; missing session, 401/403 or a dead refresh
 * token → signed-out; no user and no error → signed-out; anything else → server. A probe that
 * times out is undecided, not offline: undecided → server when `responded`, else offline.
 * The server's own SIGN_IN result is not trusted by itself — the browser probe decides.
 * `thrown` is the error the Server Action call threw, passed on a job's first attempts (with-reconnect bounds them): a
 * TypeError (what a failed `fetch` throws) is offline without probing, since the link may have
 * recovered before the probe runs. Later attempts omit it so a client-bug TypeError cannot loop
 * silently forever. A server-answered error is a plain Error and keeps the probe path.
 * `responded` is true when the server answered: the call returned a value, or threw an error
 * that is not a TypeError (a 5xx). An undecided probe then → server, passing the server's own
 * answer through: no resend of an answer the server already gave, and no sign-out on a server
 * SIGN_IN that a transient auth failure can also produce. A definite offline (offline browser,
 * auth fetch with no response) stays offline whatever `responded` is.
 */
export async function classifyFailure(thrown?: unknown, responded = false): Promise<FailureKind> {
  if (thrown instanceof TypeError) return 'offline'
  const kind = await decide()
  if (kind === 'unknown') return responded ? 'server' : 'offline'
  return kind
}

/** True only on definite evidence the link is down (offline browser or auth fetch failure). */
export async function linkIsDown(): Promise<boolean> {
  return (await decide()) === 'offline'
}

async function decide(): Promise<Decision> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 'offline'
  const guarded = probe().catch((err): Decision => {
    console.warn('[classify-failure] auth probe threw (best-effort):', err)
    return 'server'
  })
  return withTimeout<Decision>(guarded, PROBE_TIMEOUT_MS, 'unknown')
}
