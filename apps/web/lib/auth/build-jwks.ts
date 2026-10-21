import type { SupabaseClient } from '@supabase/supabase-js'

type ClaimsOptions = NonNullable<Parameters<SupabaseClient['auth']['getClaims']>[1]>
export type BuildJwks = NonNullable<ClaimsOptions['jwks']>

function hasKid(k: unknown): boolean {
  if (typeof k !== 'object' || k === null) return false
  const { kid } = k as { kid?: unknown }
  return typeof kid === 'string' && kid !== ''
}

/** A `{ keys }` JWKS when every key carries a non-empty `kid`; undefined otherwise. */
export function toBuildJwks(value: unknown): BuildJwks | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const { keys } = value as { keys?: unknown }
  if (!Array.isArray(keys) || !keys.every(hasKid)) return undefined
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
