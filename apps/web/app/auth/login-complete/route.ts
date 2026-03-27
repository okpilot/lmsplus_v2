import { createServerSupabaseClient } from '@repo/db/server'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
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

  // Best-effort audit — don't block login if it fails
  const { error } = await rpc(supabase, 'record_login', {})
  if (error) {
    console.error('[login-complete] record_login RPC failed:', error.message)
  }

  const consentStatus = await checkConsentStatus(supabase)

  if (consentStatus === 'required') {
    return NextResponse.redirect(new URL('/consent', request.url))
  }

  // Consent satisfied — set cookie to skip proxy DB checks
  const dashboardUrl = new URL('/app/dashboard', request.url)
  const redirectResponse = NextResponse.redirect(dashboardUrl)
  redirectResponse.cookies.set(CONSENT_COOKIE, buildConsentCookieValue(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 86400, // 24 hours
    path: '/',
  })
  return redirectResponse
}
