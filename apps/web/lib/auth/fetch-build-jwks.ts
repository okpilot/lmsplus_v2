import { toBuildJwks } from './build-jwks'

const TIMEOUT_MS = 5000

/** Build-time fetch of the project JWKS; returns '' (and warns) on any failure so the build never breaks. */
export async function fetchBuildJwks(supabaseUrl: string | undefined): Promise<string> {
  if (!supabaseUrl) {
    console.warn('[fetchBuildJwks] skipped: NEXT_PUBLIC_SUPABASE_URL is not set')
    return ''
  }
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/.well-known/jwks.json`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) {
      console.warn('[fetchBuildJwks] skipped: response status', res.status)
      return ''
    }
    const jwks = toBuildJwks(await res.json())
    if (!jwks) {
      console.warn('[fetchBuildJwks] skipped: unexpected JWKS shape')
      return ''
    }
    return JSON.stringify(jwks)
  } catch (err) {
    console.warn('[fetchBuildJwks] skipped: fetch failed', err instanceof Error ? err.message : err)
    return ''
  }
}
