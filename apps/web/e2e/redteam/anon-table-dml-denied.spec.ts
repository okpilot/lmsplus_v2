/**
 * Red Team Spec: Anonymous Table-Level DML Denied on Every Public Table (Vector FQ)
 *
 * Attack: an unauthenticated (anon-key, no JWT) PostgREST caller sends a direct
 * SELECT, INSERT, UPDATE or DELETE against a public table or view, attempting
 * to read or write data with no session at all — no RLS predicate to satisfy,
 * just the anon key.
 *
 * Defense (mig `20260925000300`): anon holds NO privilege of any kind on any
 * table in `public` — `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon`
 * (superseding the narrower `20260925000200`, which revoked only INSERT/
 * UPDATE/DELETE and left SELECT), plus the matching default privileges for
 * future postgres-owned tables. The rejection fires at the privilege layer —
 * BEFORE RLS is evaluated — so it carries Postgres error 42501 ("permission
 * denied for table/view …"), never the RLS-violation 42501 ("new row violates
 * row-level security policy …") or a silent 0-row SELECT/UPDATE/DELETE.
 * Asserting the message, not just the code, is what tells the two apart: RLS
 * alone (pre-migration state) also raises 42501 on INSERT and silently
 * no-ops SELECT/UPDATE/DELETE — a code-only assertion would pass on either
 * layer.
 *
 * The table set is derived at runtime from the PostgREST OpenAPI root, never
 * hardcoded — a table added after this spec was written is covered
 * automatically. The service-role client (unaffected by the revoke) is the
 * positive control: it can still read, proving each table is reachable and
 * the denial above is a privilege gap, not an unrelated outage.
 *
 * Status: Expected to PASS (defense should hold). A failing assertion means an
 * anonymous caller can still read or write that table.
 */

import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { deriveTableSpecs, NIL_UUID, type TableSpec } from './helpers/table-specs'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321'
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!ANON_KEY) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is required')
if (!SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')

// Unauthenticated client — anon key only, no sign-in, no JWT.
const unauthClient = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// Service-role client — bypasses RLS and privilege revokes; positive control
// proving each table is reachable (not merely absent/renamed).
const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
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

  test('service-role positive control can still read every public table', async () => {
    for (const { name, filterCol } of tables) {
      const { error } = await serviceClient.from(name).select(filterCol).limit(0)
      expect.soft(error, `service-role SELECT on "${name}" must succeed`).toBeNull()
    }
  })

  test('anonymous caller cannot select from any public table', async () => {
    for (const { name } of tables) {
      const { error } = await unauthClient.from(name).select('*').limit(1)
      expect.soft(error?.code, `SELECT on "${name}" must be rejected`).toBe('42501')
      expect
        .soft(error?.message ?? '', `SELECT on "${name}" error message`)
        .toMatch(/permission denied for (table|view)/i)
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
