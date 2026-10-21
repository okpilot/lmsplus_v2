import { toBuildJwks } from './build-jwks'

const TIMEOUT_MS = 5000

/** Build-time fetch of the project JWKS; returns '' (and logs an error) on any failure so the build never breaks. */
export async function fetchBuildJwks(supabaseUrl: string | undefined): Promise<string> {
  if (!supabaseUrl) {
    console.error('[fetchBuildJwks] skipped: NEXT_PUBLIC_SUPABASE_URL is not set')
    return ''
  }
  try {
    const res = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/auth/v1/.well-known/jwks.json`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) {
      console.error('[fetchBuildJwks] skipped: response status', res.status)
      return ''
    }
    const jwks = toBuildJwks(await res.json())
    if (!jwks) {
      console.error('[fetchBuildJwks] skipped: unexpected JWKS shape')
      return ''
    }
    return JSON.stringify(jwks)
  } catch (err) {
    console.error(
      '[fetchBuildJwks] skipped: fetch failed',
      err instanceof Error ? err.message : err,
    )
    return ''
  }
}
