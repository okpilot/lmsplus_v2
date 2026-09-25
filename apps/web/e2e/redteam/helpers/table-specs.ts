/**
 * Shared table-set derivation for red-team specs that probe every public
 * table/view via direct PostgREST DML (Vectors FQ, FR).
 *
 * The table set is derived at runtime from the PostgREST OpenAPI root, never
 * hardcoded — a table added after a spec was written is covered automatically.
 */

import { fetchOpenApiRootField } from './openapi-root'

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
  const raw = await fetchOpenApiRootField('definitions')
  const definitions = raw as Record<string, { properties?: Record<string, { format?: string }> }>

  return Object.entries(definitions).map(([name, def]) => {
    const props = def.properties ?? {}
    const filterCol =
      'id' in props
        ? 'id'
        : (Object.entries(props).find(([, v]) => v.format === 'uuid')?.[0] ?? 'id')
    return { name, filterCol }
  })
}
