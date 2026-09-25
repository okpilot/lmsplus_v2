import { createServerSupabaseClient } from '@repo/db/server'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { safeNextPath } from '@/lib/auth/safe-next-path'
import {
  expireTempPassword,
  readTempPasswordState,
  type TempPasswordState,
} from '@/lib/auth/temp-password'
import { buildConsentCookieValue, checkConsentStatus } from '@/lib/consent/check-consent'
import { CONSENT_COOKIE } from '@/lib/consent/versions'
import { rpc } from '@/lib/supabase-rpc'

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  const next = safeNextPath(new URL(request.url).searchParams.get('next'))

  // Best-effort audit — don't block login if it fails
  const { error } = await rpc(supabase, 'record_login', {})
  if (error) {
    console.error('[login-complete] record_login RPC failed:', error.message)
  }

  let tempPasswordState: TempPasswordState
  try {
    tempPasswordState = await readTempPasswordState(supabase, user.id)
  } catch (err) {
    console.error(
      '[login-complete] temp password state read error:',
      err instanceof Error ? err.message : String(err),
    )
    await supabase.auth.signOut()
    return NextResponse.redirect(new URL('/?error=auth_failed', request.url))
  }

  if (tempPasswordState === 'expired') {
    await expireTempPassword(supabase, user.id)
    return NextResponse.redirect(new URL('/?error=temp_password_expired', request.url))
  }

  const consentStatus = await checkConsentStatus(supabase)

  if (tempPasswordState === 'active') {
    const setPasswordUrl = new URL('/auth/set-password', request.url)
    if (next) setPasswordUrl.searchParams.set('next', next)
    const setPasswordResponse = NextResponse.redirect(setPasswordUrl)
    if (consentStatus === 'satisfied') setConsentCookie(setPasswordResponse)
    return setPasswordResponse
  }

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

function setConsentCookie(res: NextResponse): void {
  res.cookies.set(CONSENT_COOKIE, buildConsentCookieValue(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 31_536_000, // 1 year — cookie is a cache; version bump invalidates
    path: '/',
  })
}
