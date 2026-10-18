import { createServerSupabaseClient } from '@repo/db/server'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { safeNextPath } from '@/lib/auth/safe-next-path'
import { checkConsentStatus } from '@/lib/consent/check-consent'
import { setConsentCookie } from '@/lib/consent/consent-cookie'
import { rpc } from '@/lib/supabase-rpc'

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

  const consentStatus = await checkConsentStatus(supabase)
  if (consentStatus === 'required') {
    const consentUrl = new URL('/consent', request.url)
    if (next) consentUrl.searchParams.set('next', next)
    return NextResponse.redirect(consentUrl)
  }

  // Consent satisfied — set cookie to skip proxy DB checks
  const dashboardUrl = new URL(next ?? '/app/dashboard', request.url)
  const redirectResponse = NextResponse.redirect(dashboardUrl)
  setConsentCookie(redirectResponse.cookies, user.id)
  return redirectResponse
}
