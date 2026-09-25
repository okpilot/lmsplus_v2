/**
 * Shared PostgREST OpenAPI root fetch for red-team helpers that derive the
 * public table set (`table-specs.ts`) and function set (`rpc-specs.ts`).
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')

/**
 * Fetch the OpenAPI root with the service-role key and return its top-level
 * `field` object. Throws on a non-OK response or when `field` is not an object.
 */
export async function fetchOpenApiRootField(field: 'definitions' | 'paths'): Promise<object> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
    headers: {
      apikey: SERVICE_ROLE_KEY as string,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      Accept: 'application/openapi+json',
    },
  })
  if (!res.ok) throw new Error(`OpenAPI root fetch failed: ${res.status} ${res.statusText}`)
  const body: unknown = await res.json()
  const raw =
    typeof body === 'object' && body !== null ? (body as Record<string, unknown>)[field] : undefined
  if (typeof raw !== 'object' || raw === null)
    throw new Error(`OpenAPI root has no ${field} object`)
  return raw
}
