import { createServerSupabaseClient } from '@repo/db/server'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { safeNextPath } from '@/lib/auth/safe-next-path'
import { checkConsentStatus } from '@/lib/consent/check-consent'
import { setConsentCookie } from '@/lib/consent/consent-cookie'

/**
 * Silently re-derives consent state for a request the proxy's consent gate
 * bounced here — a missing, stale-version, or another-user's cookie left on a
 * shared browser. A user who already consented in the DB is redirected on
 * with a cookie refreshed to their own id; one who hasn't goes to /consent.
 */
export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/', request.url))

  const next = safeNextPath(new URL(request.url).searchParams.get('next'))

  const consentStatus = await checkConsentStatus(supabase)
  if (consentStatus === 'required') {
    const consentUrl = new URL('/consent', request.url)
    if (next) consentUrl.searchParams.set('next', next)
    return NextResponse.redirect(consentUrl)
  }

  const dashboardUrl = new URL(next ?? '/app/dashboard', request.url)
  const redirectResponse = NextResponse.redirect(dashboardUrl)
  setConsentCookie(redirectResponse.cookies, user.id)
  return redirectResponse
}

/**
 * The proxy's consent gate redirects with `NextResponse.redirect` (307,
 * method-preserving) — a Server Action POST hitting a stale-cookie `/app`
 * page replays here as a POST. Without this export the route 405s and the
 * action never reaches its destination; with it, the 307 back to `next`
 * replays the POST with the freshly-set cookie.
 */
export const POST = GET
