import { createServerSupabaseClient } from '@repo/db/server'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getCallerProfile } from '@/lib/auth/get-caller-profile'
import { verifySessionUser } from '@/lib/auth/verify-session-user'

function redirectTo(request: NextRequest, path: string, error?: string) {
  const url = new URL(path, request.url)
  if (error) url.searchParams.set('error', error)
  const response = NextResponse.redirect(url)
  response.headers.set('Cache-Control', 'no-store')
  return response
}

/** Ends the session of a deactivated caller only; an active caller is sent back to the app. */
export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const sessionUser = await verifySessionUser(supabase)
  if (!sessionUser) return redirectTo(request, '/')

  const { data: profile, error } = await getCallerProfile(sessionUser.id)

  if (error) {
    console.error('[auth/signout] profile lookup failed:', error.message)
    return redirectTo(request, '/', 'profile_lookup_failed')
  }
  if (profile) return redirectTo(request, '/app/dashboard')

  const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' })
  if (signOutError) console.error('[auth/signout] signOut failed:', signOutError.message)
  return redirectTo(request, '/', 'account_inactive')
}
