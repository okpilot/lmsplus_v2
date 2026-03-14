import { createMiddlewareSupabaseClient } from '@repo/db/middleware'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

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

  const { pathname, searchParams } = request.nextUrl

  function redirectWithCookies(url: URL) {
    const redirect = NextResponse.redirect(url)
    for (const cookie of response.cookies.getAll()) {
      redirect.cookies.set(cookie)
    }
    return redirect
  }

  // Forward auth code from magic link to callback route (PKCE flow).
  // This branch MUST run before the authenticated-user redirect below:
  // when a magic link is clicked, user is null (code not yet exchanged),
  // so we capture the code and forward it to /auth/callback before any
  // user-presence check would redirect away and discard the code.
  const code = searchParams.get('code')
  if (pathname === '/' && code) {
    const callbackUrl = new URL('/auth/callback', request.url)
    callbackUrl.searchParams.set('code', code)
    return redirectWithCookies(callbackUrl)
  }

  // Protect /app/* routes — redirect to login if not authenticated
  if (pathname.startsWith('/app') && !user) {
    return redirectWithCookies(new URL('/', request.url))
  }

  // Redirect authenticated users away from login page to dashboard
  if (pathname === '/' && user) {
    return redirectWithCookies(new URL('/app/dashboard', request.url))
  }

  return response
}

export const config = {
  matcher: ['/', '/app/:path*'],
}
