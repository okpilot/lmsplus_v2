import { createMiddlewareSupabaseClient } from '@repo/db/middleware'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

export async function proxy(request: NextRequest) {
  const { supabase, response } = createMiddlewareSupabaseClient(request)

  // Refresh session — must run on every request to keep tokens valid
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Protect /app/* routes — redirect to login if not authenticated
  if (pathname.startsWith('/app') && !user) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  // Redirect authenticated users away from login page to dashboard
  if (pathname === '/' && user) {
    return NextResponse.redirect(new URL('/app/dashboard', request.url))
  }

  return response
}

export const config = {
  matcher: ['/', '/app/:path*'],
}
