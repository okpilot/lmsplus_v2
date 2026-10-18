import { createMiddlewareSupabaseClient } from '@repo/db/middleware'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { safeNextPath } from '@/lib/auth/safe-next-path'
import { verifySessionUser } from '@/lib/auth/verify-session-user'
import { checkConsentGate } from '@/lib/consent/consent-gate'
import { CONSENT_COOKIE } from '@/lib/consent/versions'

/** Sets `next` on a redirect target when a validated path is present, otherwise leaves the URL bare. */
function withNext(url: URL, next: string | null): URL {
  if (next) url.searchParams.set('next', next)
  return url
}

// next.config.ts `headers()` does NOT apply to non-routed responses
// emitted from Edge Middleware (3xx redirects, 4xx/5xx errors). Mirror
// the static security headers onto each response this file BUILDS. Every
// redirect exit funnels through `redirectWithCookies`, which calls this
// once on their behalf. Keep that funnel — a
// hand-built NextResponse that returns without calling this ships with no
// CSP and no HSTS.
function applySecurityHeaders(res: NextResponse): void {
  res.headers.set('X-DNS-Prefetch-Control', 'on')
  res.headers.set('X-Frame-Options', 'DENY')
  res.headers.set('X-Content-Type-Options', 'nosniff')
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  res.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
  // Minimal hardened CSP for non-routed responses. No scripts execute on a
  // 3xx/4xx/5xx, so we lock default-src down to 'none' and keep
  // frame-ancestors aligned with the routed-response CSP in next.config.ts.
  res.headers.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'")
}

// @supabase/ssr writes anti-cache headers (Cache-Control/Expires/Pragma) onto the
// pass-through response when it refreshes auth cookies. Redirect and error exits build
// fresh NextResponse objects, so forward those headers too — otherwise a CDN/edge could
// cache a Set-Cookie-bearing redirect and replay one user's session token to another.
const ANTI_CACHE_HEADERS = ['cache-control', 'expires', 'pragma'] as const
function forwardAntiCacheHeaders(source: NextResponse, target: NextResponse): void {
  for (const name of ANTI_CACHE_HEADERS) {
    const value = source.headers.get(name)
    if (value !== null) target.headers.set(name, value)
  }
}

export async function proxy(request: NextRequest): Promise<Response> {
  // Cast needed: @playwright/test causes a duplicate next.js install with incompatible internal types
  const { supabase, response } = createMiddlewareSupabaseClient(
    request as unknown as Parameters<typeof createMiddlewareSupabaseClient>[0],
  )

  // Verified identity — getClaims (via the helper) calls getSession, which refreshes an expiring token. Must be the
  // first call after client creation; a null user is unauthenticated, the proxy must not crash.
  const user = await verifySessionUser(supabase)

  // Expire a leftover legacy deployment-pin cookie; nothing sets one any more.
  if (request.cookies.has('__vdpl')) response.cookies.delete('__vdpl')

  const { pathname } = request.nextUrl

  function redirectWithCookies(url: URL) {
    const redirect = NextResponse.redirect(url)
    for (const cookie of response.cookies.getAll()) {
      redirect.cookies.set(cookie)
    }
    forwardAntiCacheHeaders(response, redirect)
    applySecurityHeaders(redirect)
    return redirect
  }

  // Recovery sessions can only access /auth/reset-password — block everything else
  const recoveryPending = request.cookies.get('__recovery_pending')?.value === '1'
  if (recoveryPending && user) {
    return redirectWithCookies(new URL('/auth/reset-password', request.url))
  }

  // Protect /app/* routes — redirect to login if not authenticated, carrying the
  // originally-requested path so login can return the student to it afterwards.
  if (pathname.startsWith('/app') && !user) {
    const next = safeNextPath(pathname + request.nextUrl.search)
    return redirectWithCookies(withNext(new URL('/', request.url), next))
  }

  // Consent gate — requires auth on /app/*.
  if (pathname.startsWith('/app') && user) {
    const nextPath = safeNextPath(pathname + request.nextUrl.search)
    const consentResponse = checkConsentGate({
      userId: user.id,
      cookieValue: request.cookies.get(CONSENT_COOKIE)?.value,
      nextPath,
      requestUrl: request.url,
      redirectWithCookies,
    })
    if (consentResponse) return consentResponse
  }

  // Redirect authenticated users away from login page to dashboard, or to the
  // path they originally requested (e.g. from an emailed /app/... link).
  // But preserve error messages (e.g. expired recovery links)
  if (pathname === '/' && user && !request.nextUrl.searchParams.has('error')) {
    const next = safeNextPath(request.nextUrl.searchParams.get('next'))
    return redirectWithCookies(new URL(next ?? '/app/dashboard', request.url))
  }

  return response
}

export const config = {
  matcher: [
    '/',
    '/app/:path*',
    '/auth/login-complete',
    '/auth/set-password',
    '/auth/consent-refresh',
    '/consent',
  ],
}
