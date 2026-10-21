import type { SupabaseClient } from '@supabase/supabase-js'

type ClaimsOptions = NonNullable<Parameters<SupabaseClient['auth']['getClaims']>[1]>
type BuildJwks = NonNullable<ClaimsOptions['jwks']>

function isUsableKey(k: unknown): boolean {
  if (typeof k !== 'object' || k === null) return false
  const { kid, kty } = k as { kid?: unknown; kty?: unknown }
  return typeof kid === 'string' && kid !== '' && typeof kty === 'string'
}

/** A non-empty `{ keys }` JWKS when every key carries a non-empty `kid` and a `kty`; undefined otherwise. */
export function toBuildJwks(value: unknown): BuildJwks | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const { keys } = value as { keys?: unknown }
  if (!Array.isArray(keys) || keys.length === 0 || !keys.every(isUsableKey)) return undefined
  return { keys } as BuildJwks
}

/** Parses the JWKS inlined at build; undefined when absent or malformed. */
export function parseBuildJwks(raw: string | undefined): BuildJwks | undefined {
  if (!raw) return undefined
  try {
    return toBuildJwks(JSON.parse(raw))
  } catch {
    return undefined
  }
}

export const BUILD_JWKS = parseBuildJwks(process.env.SUPABASE_BUILD_JWKS)
