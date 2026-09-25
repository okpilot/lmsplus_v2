/**
 * Red Team Spec: Anonymous Table-Level DML Denied on Every Public Table (Vector FQ)
 *
 * Attack: an unauthenticated (anon-key, no JWT) PostgREST caller sends a direct
 * INSERT, UPDATE or DELETE against a public table or view, attempting to write
 * data with no session at all — no RLS predicate to satisfy, just the anon key.
 *
 * Defense (mig `20260925000200`): anon's INSERT/UPDATE/DELETE/TRUNCATE grant is
 * revoked on every table in `public` (`ON ALL TABLES` also covers the view
 * `active_flagged_questions`), plus the matching default privileges for future
 * postgres-owned tables. The rejection fires at the privilege layer — BEFORE RLS
 * is evaluated — so it carries Postgres error 42501 ("permission denied for
 * table/view …"), never the RLS-violation 42501 ("new row violates row-level
 * security policy …") or a silent 0-row UPDATE/DELETE. Asserting the message,
 * not just the code, is what tells the two apart: RLS alone (pre-migration state)
 * also raises 42501 on INSERT and silently no-ops UPDATE/DELETE — a code-only
 * assertion would pass on either layer.
 *
 * The table set is derived at runtime from the PostgREST OpenAPI root, never
 * hardcoded — a table added after this spec was written is covered automatically.
 *
 * SELECT is a positive control: anon keeps SELECT (RLS still governs what rows
 * are visible), so a `.select().limit(0)` must succeed with no error.
 *
 * Status: Expected to PASS (defense should hold). A failing assertion means an
 * anonymous caller can still write to that table.
 */

import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321'
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!ANON_KEY) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is required')
if (!SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')

// A syntactically valid, non-existent UUID. Every table's primary/foreign key
// column in this schema is `uuid`-typed, so one constant filter value avoids a
// type-cast error (invalid input syntax) that would otherwise fire before the
// privilege check does, masking the assertion under test.
const NIL_UUID = '00000000-0000-0000-0000-000000000000'

type TableSpec = { name: string; filterCol: string }

/**
 * Fetch the current public-schema table/view set from the PostgREST OpenAPI
 * root, never hardcoded. For each, pick a `uuid`-typed filter column
 * (preferring `id`) so UPDATE/DELETE probes can target a row without a
 * type-cast error masking the privilege check.
 */
async function deriveTableSpecs(): Promise<TableSpec[]> {
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

// Unauthenticated client — anon key only, no sign-in, no JWT.
const unauthClient = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

test.describe('Red Team: Anonymous Table-Level DML Denied on Every Public Table', () => {
  let tables: TableSpec[]

  // Non-vacuity for every test below (code-style.md §7): an empty or partial
  // table set would let each loop pass without probing a table.
  test.beforeAll(async () => {
    tables = await deriveTableSpecs()
    const names = tables.map((t) => t.name)
    expect(names).toContain('users')
    expect(names).toContain('questions')
    expect(names).toContain('audit_events')
  })

  test('anonymous caller can still read every public table (SELECT positive control)', async () => {
    for (const { name, filterCol } of tables) {
      const { error } = await unauthClient.from(name).select(filterCol).limit(0)
      expect.soft(error, `SELECT on "${name}" must succeed — anon keeps SELECT`).toBeNull()
    }
  })

  test('anonymous caller cannot insert into any public table', async () => {
    for (const { name } of tables) {
      const { error } = await unauthClient.from(name).insert({})
      expect.soft(error?.code, `INSERT on "${name}" must be rejected`).toBe('42501')
      expect
        .soft(error?.message ?? '', `INSERT on "${name}" error message`)
        .toMatch(/permission denied for (table|view)/i)
    }
  })

  test('anonymous caller cannot update any public table', async () => {
    for (const { name, filterCol } of tables) {
      const { error } = await unauthClient
        .from(name)
        .update({ [filterCol]: NIL_UUID })
        .eq(filterCol, NIL_UUID)
      expect.soft(error?.code, `UPDATE on "${name}" must be rejected`).toBe('42501')
      expect
        .soft(error?.message ?? '', `UPDATE on "${name}" error message`)
        .toMatch(/permission denied for (table|view)/i)
    }
  })

  test('anonymous caller cannot delete from any public table', async () => {
    for (const { name, filterCol } of tables) {
      const { error } = await unauthClient.from(name).delete().eq(filterCol, NIL_UUID)
      expect.soft(error?.code, `DELETE on "${name}" must be rejected`).toBe('42501')
      expect
        .soft(error?.message ?? '', `DELETE on "${name}" error message`)
        .toMatch(/permission denied for (table|view)/i)
    }
  })
})
