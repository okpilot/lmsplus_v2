import { createMiddlewareSupabaseClient } from '@repo/db/middleware'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import {
  CONSENT_COOKIE,
  CURRENT_PRIVACY_VERSION,
  CURRENT_TOS_VERSION,
} from '@/lib/consent/versions'

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
    return redirect
  }

  // Recovery sessions can only access /auth/reset-password — block everything else
  const recoveryPending = request.cookies.get('__recovery_pending')?.value === '1'
  if (recoveryPending && user) {
    return redirectWithCookies(new URL('/auth/reset-password', request.url))
  }

  // Protect /app/* routes — redirect to login if not authenticated
  if (pathname.startsWith('/app') && !user) {
    return redirectWithCookies(new URL('/', request.url))
  }

  // Consent gate: authenticated /app/* users without valid consent → /consent
  if (pathname.startsWith('/app') && user) {
    const consentCookie = request.cookies.get(CONSENT_COOKIE)?.value
    const expected = `${CURRENT_TOS_VERSION}:${CURRENT_PRIVACY_VERSION}`
    if (consentCookie !== expected) {
      return redirectWithCookies(new URL('/consent', request.url))
    }
  }

  // Block non-admin users from /app/admin/* routes
  const isAdminRoute = pathname === '/app/admin' || pathname.startsWith('/app/admin/')
  if (isAdminRoute && user) {
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .maybeSingle<{ role: string }>()

    if (profileError) {
      console.error('[proxy] admin role lookup error:', profileError.message)
      const unavailable = new NextResponse('Service unavailable', { status: 503 })
      for (const cookie of response.cookies.getAll()) {
        unavailable.cookies.set(cookie)
      }
      return unavailable
    }

    if (profile?.role !== 'admin') {
      const forbidden = new NextResponse('Forbidden', { status: 403 })
      for (const cookie of response.cookies.getAll()) {
        forbidden.cookies.set(cookie)
      }
      return forbidden
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

  // Redirect authenticated users away from login page to dashboard
  // But preserve error messages (e.g. expired recovery links)
  if (pathname === '/' && user && !request.nextUrl.searchParams.has('error')) {
    return redirectWithCookies(new URL('/app/dashboard', request.url))
  }

  return response
}

export const config = {
  matcher: ['/', '/app/:path*', '/auth/login-complete', '/consent'],
}
