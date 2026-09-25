import { createMiddlewareSupabaseClient } from '@repo/db/middleware'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { safeNextPath } from '@/lib/auth/safe-next-path'
import { checkTempPasswordGate } from '@/lib/auth/temp-password-gate'
import {
  CONSENT_COOKIE,
  CURRENT_PRIVACY_VERSION,
  CURRENT_TOS_VERSION,
} from '@/lib/consent/versions'

/** Sets `next` on a redirect target when a validated path is present, otherwise leaves the URL bare. */
function withNext(url: URL, next: string | null): URL {
  if (next) url.searchParams.set('next', next)
  return url
}

// next.config.ts `headers()` does NOT apply to non-routed responses
// emitted from Edge Middleware (3xx redirects, 4xx/5xx errors). Mirror
// the static security headers onto each response this file BUILDS. Every
// redirect exit funnels through `redirectWithCookies`, which calls this
// once on their behalf; the 503 calls it directly. Keep that funnel — a
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

/** 503 for a failed authorization read on /app, carrying the session cookies and security headers. */
function serviceUnavailable(response: NextResponse): NextResponse {
  const unavailable = new NextResponse('Service unavailable', { status: 503 })
  for (const cookie of response.cookies.getAll()) {
    unavailable.cookies.set(cookie)
  }
  forwardAntiCacheHeaders(response, unavailable)
  applySecurityHeaders(unavailable)
  return unavailable
}

export async function proxy(request: NextRequest): Promise<Response> {
  // Cast needed: @playwright/test causes a duplicate next.js install with incompatible internal types
  const { supabase, response } = createMiddlewareSupabaseClient(
    request as unknown as Parameters<typeof createMiddlewareSupabaseClient>[0],
  )

  // Refresh session — must run on every request to keep tokens valid
  // On auth error, treat as unauthenticated — proxy must not crash
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError) {
    console.error('[proxy] getUser error:', authError.message)
  }

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

  // Temporary-password gate (Decision 100); runs before consent.
  if (pathname.startsWith('/app') && user) {
    const gateResponse = await checkTempPasswordGate({
      supabase,
      userId: user.id,
      requestUrl: request.url,
      nextPath: safeNextPath(pathname + request.nextUrl.search),
      buildServiceUnavailable: () => serviceUnavailable(response),
      redirectWithCookies,
    })
    if (gateResponse) return gateResponse
  }

  // Consent gate: authenticated /app/* users without valid consent → /consent
  if (pathname.startsWith('/app') && user) {
    const consentCookie = request.cookies.get(CONSENT_COOKIE)?.value
    const expected = `${CURRENT_TOS_VERSION}:${CURRENT_PRIVACY_VERSION}`
    if (consentCookie !== expected) {
      const next = safeNextPath(pathname + request.nextUrl.search)
      return redirectWithCookies(withNext(new URL('/consent', request.url), next))
    }
  }

  // Block non-admin users from /app/admin/* routes
  const isAdminRoute = pathname === '/app/admin' || pathname.startsWith('/app/admin/')
  if (isAdminRoute && user) {
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      // Explicit parity with requireAdmin()'s deleted_at-filtered read. RLS already
      // enforces this — `users_select` is `USING (id = auth.uid() AND deleted_at IS
      // NULL)` (mig 20260312000012:14-16) and this client uses the anon key — so a
      // soft-deleted admin was never passing Layer 1. Stated in the query so the
      // guarantee does not rest silently on one policy in another file.
      .is('deleted_at', null)
      .maybeSingle<{ role: string }>()

    if (profileError) {
      console.error('[proxy] admin role lookup error:', profileError.message)
      return serviceUnavailable(response)
    }

    // Bounce to the student dashboard rather than emitting a bare 403 body: the
    // 403 rendered a plain, unstyled "Forbidden" with no layout and no way back
    // (#1167). The gate itself is unchanged — a non-admin still never reaches an
    // /app/admin route — only what they see when blocked.
    //
    // Target is `/app/dashboard`, NOT `/app`: since #1170 `/app` is itself only a
    // redirect to `/app/dashboard`, so bouncing there would add a hop to reach the
    // same place. (Before #1170 it was worse — `/app` had no page at all and
    // rendered a bare 404.) `/app/dashboard` is the same destination the
    // authenticated-root redirect below uses.
    //
    // No redirect loop: /app/dashboard is not an admin route, and the consent
    // gate above has already run for this request.
    if (profile?.role !== 'admin') {
      return redirectWithCookies(new URL('/app/dashboard', request.url))
    }
  }

  // Pin quiz session to current deployment so mid-quiz deploys don't break Server Actions
  if (pathname.startsWith('/app/quiz/session') && user) {
    const deploymentId = process.env.VERCEL_DEPLOYMENT_ID
    if (deploymentId && !request.cookies.get('__vdpl')) {
      response.cookies.set('__vdpl', deploymentId, {
        path: '/',
        httpOnly: true,
        sameSite: 'strict',
        secure: process.env.NODE_ENV === 'production',
      })
    }
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
  matcher: ['/', '/app/:path*', '/auth/login-complete', '/auth/set-password', '/consent'],
}
