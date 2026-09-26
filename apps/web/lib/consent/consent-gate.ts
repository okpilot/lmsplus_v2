import { buildConsentCookieValue } from '@/lib/consent/check-consent'

/**
 * Runs the consent gate for an authenticated `/app` request. Extracted out of
 * `proxy.ts` to keep it under its file-size cap — pure gate logic, no
 * proxy-specific cookie/header plumbing.
 *
 * A cookie not bound to THIS user's id (missing, stale version, or another
 * user's cookie left on a shared browser) is sent to `/auth/consent-refresh`,
 * which re-derives from DB state instead of always showing `/consent` again.
 *
 * Returns a Response to return immediately from the proxy, or `null` to fall
 * through to the next gate.
 */
export function checkConsentGate(opts: {
  userId: string
  cookieValue: string | undefined
  nextPath: string | null
  requestUrl: string
  redirectWithCookies: (url: URL) => Response
}): Response | null {
  const { userId, cookieValue, nextPath, requestUrl, redirectWithCookies } = opts

  if (cookieValue === buildConsentCookieValue(userId)) return null

  const url = new URL('/auth/consent-refresh', requestUrl)
  if (nextPath) url.searchParams.set('next', nextPath)
  return redirectWithCookies(url)
}
