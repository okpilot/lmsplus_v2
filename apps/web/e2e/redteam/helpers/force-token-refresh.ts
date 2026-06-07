import type { BrowserContext } from '@playwright/test'

/**
 * Test seam for Vector CK2 (#781): force @supabase/ssr to treat the stored
 * session as expired so the NEXT request through proxy.ts triggers a REAL
 * token refresh.
 *
 * Why this works (traced to the installed deps, not from memory):
 *   - The app's browser client (`packages/db/src/client.ts` → createBrowserClient)
 *     persists the session as a cookie named `sb-<ref>-auth-token`. For the local
 *     stack (`NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321`) supabase-js derives
 *     the storageKey as `sb-${hostname.split('.')[0]}-auth-token` =
 *     `sb-localhost-auth-token` (SupabaseClient.ts L324). It may be split into
 *     `.0`, `.1`, … chunks when the encoded value exceeds MAX_CHUNK_SIZE (3180).
 *   - The default `cookieEncoding` is `base64url`, so the value is
 *     `base64-<base64url(JSON.stringify(session))>` (@supabase/ssr cookies.js L190).
 *   - On the next request, proxy.ts calls `supabase.auth.getUser()` →
 *     `_getUser` → `_useSession` → `__loadSession`, which computes
 *     `hasExpired = expires_at*1000 - Date.now() < EXPIRY_MARGIN_MS` where
 *     `EXPIRY_MARGIN_MS = 90_000` (auth-js GoTrueClient.ts L2841, constants.ts).
 *     Pushing `expires_at` 200s into the past makes `hasExpired` true →
 *     `_callRefreshToken(refresh_token)` runs → the SSR `setAll(cookies, headers)`
 *     writes the refreshed auth cookies AND the anti-cache headers
 *     (Cache-Control/Expires/Pragma) onto the response.
 *
 * This is a TEST-ONLY cookie rewrite. No production code is touched. We only
 * change `expires_at`/`expires_in`; the (still-valid) refresh_token is preserved
 * so the server-side refresh succeeds.
 */

type PlaywrightCookie = Awaited<ReturnType<BrowserContext['cookies']>>[number]

/** Matches the base auth cookie and any `.N` chunk; excludes `-code-verifier`. */
const AUTH_TOKEN_COOKIE_RE = /^sb-.+-auth-token(?:\.\d+)?$/
const BASE64_PREFIX = 'base64-'
/** @supabase/ssr chunker MAX_CHUNK_SIZE (dist/main/utils/chunker.js). */
const MAX_CHUNK_SIZE = 3180
/**
 * Push expires_at this many seconds into the past — comfortably beyond auth-js
 * EXPIRY_MARGIN_MS (90s) so __loadSession treats the access token as expired.
 */
const PAST_EXPIRY_OFFSET_S = 200

export type AuthSessionSummary = {
  accessToken: string
  refreshToken: string
  /** Unix seconds. */
  expiresAt: number
}

/** Strip a trailing `.N` chunk suffix to recover the base storage key. */
export function baseKeyOf(cookieName: string): string {
  return cookieName.replace(/\.\d+$/, '')
}

/**
 * Reconstruct the full cookie value the way @supabase/ssr's combineChunks does:
 * prefer the un-chunked cookie under the base key; otherwise concatenate the
 * `.0`, `.1`, … chunks in index order.
 */
export function reconstructCookieValue(authCookies: PlaywrightCookie[], baseKey: string): string {
  const whole = authCookies.find((c) => c.name === baseKey)
  if (whole) return whole.value

  const chunks = authCookies
    .filter((c) => c.name.startsWith(`${baseKey}.`))
    .map((c) => ({ index: Number(c.name.slice(baseKey.length + 1)), value: c.value }))
    .filter((c) => Number.isInteger(c.index))
    .sort((a, b) => a.index - b.index)

  if (chunks.length === 0) {
    throw new Error(`forceTokenRefresh: found auth cookie name(s) but no value for "${baseKey}"`)
  }
  return chunks.map((c) => c.value).join('')
}

/** Decode `base64-<base64url(json)>` (or a plain JSON value) to the session object. */
export function decodeSession(rawValue: string): Record<string, unknown> {
  const json = rawValue.startsWith(BASE64_PREFIX)
    ? Buffer.from(rawValue.slice(BASE64_PREFIX.length), 'base64url').toString('utf-8')
    : rawValue

  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch (error) {
    throw new Error(
      `forceTokenRefresh: auth cookie did not decode to JSON: ${(error as Error).message}`,
    )
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>).access_token !== 'string' ||
    typeof (parsed as Record<string, unknown>).refresh_token !== 'string'
  ) {
    throw new Error('forceTokenRefresh: decoded auth cookie missing access_token/refresh_token')
  }
  return parsed as Record<string, unknown>
}

/** Re-encode a session object back to the `base64-<base64url(json)>` cookie form. */
export function encodeSession(session: Record<string, unknown>): string {
  return BASE64_PREFIX + Buffer.from(JSON.stringify(session), 'utf-8').toString('base64url')
}

/**
 * Re-split the value into cookies the way @supabase/ssr's createChunks does.
 * The payload is `base64-` + base64url, none of whose characters are
 * percent-escaped, so `encodeURIComponent(value).length === value.length` and
 * the chunk-splitting reduces to a plain slice on MAX_CHUNK_SIZE.
 */
export function chunkValue(baseKey: string, value: string): Array<{ name: string; value: string }> {
  // Invariant: the payload is URI-safe, so plain `.slice()` matches @supabase/ssr's
  // encodeURIComponent-based chunking. If supabase ever changes cookieEncoding to a
  // form with percent-escaped characters, this assumption breaks silently — fail loud.
  if (encodeURIComponent(value).length !== value.length) {
    throw new Error(
      'forceTokenRefresh: chunkValue invariant violated — encodeURIComponent(value).length !== value.length; ' +
        'the cookie payload is no longer URI-safe, so plain slicing would misalign chunks against @supabase/ssr.',
    )
  }
  if (value.length <= MAX_CHUNK_SIZE) return [{ name: baseKey, value }]
  const chunks: Array<{ name: string; value: string }> = []
  for (let i = 0, n = 0; i < value.length; i += MAX_CHUNK_SIZE, n += 1) {
    chunks.push({ name: `${baseKey}.${n}`, value: value.slice(i, i + MAX_CHUNK_SIZE) })
  }
  return chunks
}

function findAuthCookies(cookies: PlaywrightCookie[]): PlaywrightCookie[] {
  return cookies.filter((c) => AUTH_TOKEN_COOKIE_RE.test(c.name))
}

/**
 * Clear any existing chunk cookie whose name won't be overwritten by the new
 * chunk set. The chunk count can shrink (or grow); leaving stale `.N` chunks
 * behind would corrupt the reconstructed value on the next read.
 */
async function clearStaleChunks(
  context: BrowserContext,
  authCookies: PlaywrightCookie[],
  newNames: Set<string>,
  template: PlaywrightCookie,
): Promise<void> {
  for (const cookie of authCookies) {
    if (!newNames.has(cookie.name)) {
      await context.clearCookies({
        name: cookie.name,
        domain: template.domain,
        path: template.path,
      })
    }
  }
}

/** Write the new chunk set, copying domain/path/flags from the original cookie. */
async function writeCookieChunks(
  context: BrowserContext,
  chunks: Array<{ name: string; value: string }>,
  template: PlaywrightCookie,
): Promise<void> {
  await context.addCookies(
    chunks.map(({ name, value }) => ({
      name,
      value,
      domain: template.domain,
      path: template.path,
      expires: template.expires,
      httpOnly: template.httpOnly,
      secure: template.secure,
      sameSite: template.sameSite,
    })),
  )
}

/**
 * Read and decode the current Supabase session from the context cookie jar.
 * Returns null when no auth cookie is present (e.g. unauthenticated context).
 */
export async function readAuthSession(context: BrowserContext): Promise<AuthSessionSummary | null> {
  const authCookies = findAuthCookies(await context.cookies())
  if (authCookies.length === 0) return null

  const baseKey = baseKeyOf(authCookies[0].name)
  const session = decodeSession(reconstructCookieValue(authCookies, baseKey))
  const expiresAt = session.expires_at
  return {
    accessToken: session.access_token as string,
    refreshToken: session.refresh_token as string,
    expiresAt: typeof expiresAt === 'number' ? expiresAt : Number(expiresAt),
  }
}

/**
 * Rewrite the stored Supabase session cookie so its access token is treated as
 * expired by @supabase/ssr, forcing a real refresh on the next request that
 * passes through proxy.ts. Throws loudly if no auth cookie exists — a missing
 * cookie means the test never authenticated, and a silent no-op would make the
 * downstream header assertions vacuous.
 */
export async function forceTokenRefresh(context: BrowserContext): Promise<void> {
  const authCookies = findAuthCookies(await context.cookies())
  if (authCookies.length === 0) {
    throw new Error(
      'forceTokenRefresh: no sb-*-auth-token cookie found in the context — sign in via the UI before calling.',
    )
  }

  const template = authCookies[0]
  const baseKey = baseKeyOf(template.name)
  const session = decodeSession(reconstructCookieValue(authCookies, baseKey))

  const nowS = Math.floor(Date.now() / 1000)
  session.expires_at = nowS - PAST_EXPIRY_OFFSET_S
  session.expires_in = 0

  const newChunks = chunkValue(baseKey, encodeSession(session))
  const newNames = new Set(newChunks.map((c) => c.name))

  await clearStaleChunks(context, authCookies, newNames, template)
  await writeCookieChunks(context, newChunks, template)
}
