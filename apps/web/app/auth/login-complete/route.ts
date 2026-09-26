import { createServerSupabaseClient } from '@repo/db/server'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { safeNextPath } from '@/lib/auth/safe-next-path'
import {
  readTempPasswordState,
  signOutExpiredTempPassword,
  type TempPasswordState,
} from '@/lib/auth/temp-password'
import { buildConsentCookieValue, checkConsentStatus } from '@/lib/consent/check-consent'
import { CONSENT_COOKIE } from '@/lib/consent/versions'
import { rpc } from '@/lib/supabase-rpc'

type Supabase = Awaited<ReturnType<typeof createServerSupabaseClient>>

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/', request.url))

  const next = safeNextPath(new URL(request.url).searchParams.get('next'))

  // Best-effort audit — don't block login if it fails
  const { error } = await rpc(supabase, 'record_login', {})
  if (error) console.error('[login-complete] record_login RPC failed:', error.message)

  const tempPasswordRedirect = await tempPasswordGate({ supabase, request, userId: user.id, next })
  if (tempPasswordRedirect) return tempPasswordRedirect

  const consentStatus = await checkConsentStatus(supabase)
  if (consentStatus === 'required') {
    const consentUrl = new URL('/consent', request.url)
    if (next) consentUrl.searchParams.set('next', next)
    return NextResponse.redirect(consentUrl)
  }

  // Consent satisfied — set cookie to skip proxy DB checks
  const dashboardUrl = new URL(next ?? '/app/dashboard', request.url)
  const redirectResponse = NextResponse.redirect(dashboardUrl)
  setConsentCookie(redirectResponse)
  return redirectResponse
}

/**
 * Handles the temporary-password branch of login-complete: signs out and bounces
 * to an error page on a state-read failure, refuses an expired temp password
 * with a global sign-out, or routes an active one to set-password (with
 * consent already evaluated, carrying the consent cookie through when
 * satisfied). Returns `null` to fall through to the ordinary consent/dashboard
 * flow.
 */
async function tempPasswordGate(opts: {
  supabase: Supabase
  request: NextRequest
  userId: string
  next: string | null
}): Promise<NextResponse | null> {
  const { supabase, request, userId, next } = opts

  let tempPasswordState: TempPasswordState
  try {
    tempPasswordState = await readTempPasswordState(supabase, userId)
  } catch (err) {
    console.error(
      '[login-complete] temp password state read error:',
      err instanceof Error ? err.message : String(err),
    )
    await supabase.auth.signOut({ scope: 'local' })
    return NextResponse.redirect(new URL('/?error=auth_failed', request.url))
  }

  if (tempPasswordState === 'expired') {
    await signOutExpiredTempPassword(supabase)
    return NextResponse.redirect(new URL('/?error=temp_password_expired', request.url))
  }

  if (tempPasswordState !== 'active') return null

  const consentStatus = await checkConsentStatus(supabase)
  const setPasswordUrl = new URL('/auth/set-password', request.url)
  if (next) setPasswordUrl.searchParams.set('next', next)
  const setPasswordResponse = NextResponse.redirect(setPasswordUrl)
  if (consentStatus === 'satisfied') setConsentCookie(setPasswordResponse)
  return setPasswordResponse
}

function setConsentCookie(res: NextResponse): void {
  res.cookies.set(CONSENT_COOKIE, buildConsentCookieValue(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 31_536_000, // 1 year — cookie is a cache; version bump invalidates
    path: '/',
  })
}
