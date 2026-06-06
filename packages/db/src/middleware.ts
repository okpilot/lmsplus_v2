import type { CookieOptions } from '@supabase/ssr'
import { createServerClient } from '@supabase/ssr'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import type { Database } from './types'

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
        // Write onto the SAME response object the caller already holds. setAll fires
        // lazily during auth.getUser() — AFTER createMiddlewareSupabaseClient has
        // returned — so reassigning `response` to a fresh NextResponse here would
        // orphan it, silently dropping both the refreshed session cookies and the
        // anti-cache headers below. Mutating in place keeps the reference live.
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
