import type { CookieOptions } from '@supabase/ssr'
import { createServerClient } from '@supabase/ssr'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import type { Database } from './database'

export function createMiddlewareSupabaseClient(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')

  const response = NextResponse.next({ request })

  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(
        cookiesToSet: Array<{
          name: string
          value: string
          options: CookieOptions
        }>,
        // @supabase/ssr 0.10 passes anti-cache headers (Cache-Control/Expires/Pragma)
        // alongside auth cookies — forwarding them stops a CDN/edge from caching a
        // response that carries one user's session token and serving it to another.
        headers?: Record<string, string>,
      ) {
        // Write onto the SAME response the caller holds. setAll fires lazily during
        // auth.getClaims() → getSession() (via verifySessionUser in apps/web/proxy.ts), after
        // createMiddlewareSupabaseClient returns; reassigning `response` would orphan it,
        // dropping refreshed cookies and anti-cache headers. Mutating in place keeps it live.
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value)
        }
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options)
        }
        for (const [key, value] of Object.entries(headers ?? {})) {
          response.headers.set(key, value)
        }
      },
    },
  })

  return { supabase, response }
}
