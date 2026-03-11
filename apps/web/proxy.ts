import { createMiddlewareSupabaseClient } from '@repo/db/middleware'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

export async function proxy(request: NextRequest): Promise<Response> {
  // Cast needed: @playwright/test causes a duplicate next.js install with incompatible internal types
  const { supabase, response } = createMiddlewareSupabaseClient(
    request as unknown as Parameters<typeof createMiddlewareSupabaseClient>[0],
  )

  // Refresh session — must run on every request to keep tokens valid
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname, searchParams } = request.nextUrl

  // Forward auth code from magic link to callback route (PKCE flow)
  const code = searchParams.get('code')
  if (pathname === '/' && code) {
    const callbackUrl = new URL('/auth/callback', request.url)
    callbackUrl.searchParams.set('code', code)
    const redirect = NextResponse.redirect(callbackUrl)
    for (const cookie of response.cookies.getAll()) {
      redirect.cookies.set(cookie)
    }
    return redirect
  }

  // Protect /app/* routes — redirect to login if not authenticated
  if (pathname.startsWith('/app') && !user) {
    const redirect = NextResponse.redirect(new URL('/', request.url))
    for (const cookie of response.cookies.getAll()) {
      redirect.cookies.set(cookie)
    }
    return redirect
  }

  // Redirect authenticated users away from login page to dashboard
  if (pathname === '/' && user) {
    const redirect = NextResponse.redirect(new URL('/app/dashboard', request.url))
    for (const cookie of response.cookies.getAll()) {
      redirect.cookies.set(cookie)
    }
    return redirect
  }

  return response
}

export const config = {
  matcher: ['/', '/app/:path*'],
}
