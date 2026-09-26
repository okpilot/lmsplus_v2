import { buildConsentCookieValue } from '@/lib/consent/check-consent'
import { CONSENT_COOKIE } from '@/lib/consent/versions'

/** Minimal cookie-store shape shared by `NextResponse['cookies']` and the `next/headers` store. */
type CookieStore = {
  set(
    name: string,
    value: string,
    options: {
      httpOnly: boolean
      secure: boolean
      sameSite: 'lax'
      maxAge: number
      path: string
    },
  ): unknown
}

/** Sets the `__consent` cookie bound to `userId` — shared by every write site so the options never drift apart. */
export function setConsentCookie(store: CookieStore, userId: string): void {
  store.set(CONSENT_COOKIE, buildConsentCookieValue(userId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 31_536_000, // 1 year — cookie is a cache; version bump invalidates
    path: '/',
  })
}
