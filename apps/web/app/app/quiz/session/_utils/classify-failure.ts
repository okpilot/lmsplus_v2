import { createClient } from '@repo/db/client'
import { isAuthRetryableFetchError } from '@supabase/supabase-js'
import { withTimeout } from '@/lib/utils/with-timeout'
import { isSignInError } from '../../actions/progress-error-messages'

export type FailureKind = 'offline' | 'signed-out' | 'server'

export const PROBE_TIMEOUT_MS = 3000

function isSignInResult(input: unknown): boolean {
  if (typeof input !== 'object' || input === null) return false
  const r = input as { success?: unknown; error?: unknown }
  return r.success === false && typeof r.error === 'string' && isSignInError(r.error)
}

async function probe(): Promise<FailureKind> {
  const { data, error } = await createClient().auth.getUser()
  if (error)
    return isAuthRetryableFetchError(error) || error.status === 0 ? 'offline' : 'signed-out'
  return data.user ? 'server' : 'signed-out'
}

/**
 * Decides why a Server Action call failed. `input` is the thrown value or the malformed or
 * failed result. Offline browser → offline; otherwise a bounded browser-side auth probe:
 * fetch failure or timeout → offline, no user → signed-out, user present → server.
 */
export async function classifyFailure(input: unknown): Promise<FailureKind> {
  if (isSignInResult(input)) return 'signed-out'
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 'offline'
  const guarded = probe().catch((err): FailureKind => {
    console.warn('[classify-failure] auth probe threw (best-effort):', err)
    return 'server'
  })
  return withTimeout(guarded, PROBE_TIMEOUT_MS, 'offline')
}
