/**
 * Shared table-set derivation for red-team specs that probe every public
 * table/view via direct PostgREST DML (Vectors FQ, FR).
 *
 * The table set is derived at runtime from the PostgREST OpenAPI root, never
 * hardcoded — a table added after a spec was written is covered automatically.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')

// A syntactically valid, non-existent UUID. Every table's primary/foreign key
// column in this schema is `uuid`-typed, so one constant filter value avoids a
// type-cast error (invalid input syntax) that would otherwise fire before the
// privilege check does, masking the assertion under test.
export const NIL_UUID = '00000000-0000-0000-0000-000000000000'

export type TableSpec = { name: string; filterCol: string }

/**
 * Fetch the current public-schema table/view set from the PostgREST OpenAPI
 * root. For each, pick a `uuid`-typed filter column (preferring `id`) so
 * UPDATE/DELETE probes can target a row without a type-cast error masking
 * the privilege check.
 */
export async function deriveTableSpecs(): Promise<TableSpec[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
    headers: {
      apikey: SERVICE_ROLE_KEY as string,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      Accept: 'application/openapi+json',
    },
  })
  if (!res.ok) throw new Error(`OpenAPI root fetch failed: ${res.status} ${res.statusText}`)
  const body = (await res.json()) as {
    definitions?: Record<string, { properties?: Record<string, { format?: string }> }>
  }
  const definitions = body.definitions ?? {}

  return Object.entries(definitions).map(([name, def]) => {
    const props = def.properties ?? {}
    const filterCol =
      'id' in props
        ? 'id'
        : (Object.entries(props).find(([, v]) => v.format === 'uuid')?.[0] ?? 'id')
    return { name, filterCol }
  })
}
