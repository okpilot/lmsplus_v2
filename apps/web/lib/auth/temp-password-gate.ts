import type { createMiddlewareSupabaseClient } from '@repo/db/middleware'
import {
  expireTempPassword,
  readTempPasswordState,
  type TempPasswordState,
} from '@/lib/auth/temp-password'

type MiddlewareSupabaseClient = ReturnType<typeof createMiddlewareSupabaseClient>['supabase']

/**
 * Runs the temporary-password gate for an authenticated `/app` request.
 * Extracted out of `proxy.ts` to keep it under its file-size cap — pure
 * gate logic, no proxy-specific cookie/header plumbing.
 *
 * Returns a Response to return immediately from the proxy, or `null` to fall
 * through to the next gate (consent).
 */
export async function checkTempPasswordGate(opts: {
  supabase: MiddlewareSupabaseClient
  userId: string
  requestUrl: string
  nextPath: string | null
  buildServiceUnavailable: () => Response
  redirectWithCookies: (url: URL) => Response
}): Promise<Response | null> {
  const { supabase, userId, requestUrl, nextPath, buildServiceUnavailable, redirectWithCookies } =
    opts

  let state: TempPasswordState
  try {
    state = await readTempPasswordState(supabase, userId)
  } catch (err) {
    console.error(
      '[proxy] temp password state read error:',
      err instanceof Error ? err.message : String(err),
    )
    return buildServiceUnavailable()
  }

  if (state === 'expired') {
    await expireTempPassword(supabase, userId)
    return redirectWithCookies(new URL('/?error=temp_password_expired', requestUrl))
  }

  if (state === 'active') {
    const url = new URL('/auth/set-password', requestUrl)
    if (nextPath) url.searchParams.set('next', nextPath)
    return redirectWithCookies(url)
  }

  return null
}
