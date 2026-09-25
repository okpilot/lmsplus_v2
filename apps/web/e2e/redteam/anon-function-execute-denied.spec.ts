/**
 * Red Team Spec: Anonymous Function EXECUTE Denied on Every Public Function (Vector FS)
 *
 * Attack: an unauthenticated (anon-key, no JWT) PostgREST caller sends a direct
 * `POST /rpc/<fn>` against a public function — including a SECURITY DEFINER
 * function that would otherwise expose correct-answer data, issue admin
 * actions, or write audit rows — attempting to reach the function body with
 * no session at all.
 *
 * Defense (mig `20260925000400`): anon (and PUBLIC) hold NO EXECUTE privilege
 * on any function in `public` — `REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA
 * public FROM PUBLIC, anon`, plus the matching default privileges for future
 * postgres-owned functions. The rejection fires at the privilege layer —
 * BEFORE the function body ever runs, so a body-raised message such as
 * `'not authenticated'`/`'not_authenticated'` is never reached — and carries
 * Postgres error 42501 ("permission denied for function …"). Asserting the
 * message, not just the code, is what tells the privilege-layer denial apart
 * from a body-raised auth guard: both surface as *some* error, but only the
 * privilege denial carries this message.
 *
 * The function set — name plus body parameter names — is derived at runtime
 * from the PostgREST OpenAPI root, never hardcoded — a function added after
 * this spec was written is covered automatically. Every parameter is called
 * with a `null` value: `null` is a syntactically valid input for any
 * PostgREST-mapped scalar/array/jsonb argument, so no type-cast error can
 * mask the privilege check the same way an invalid-UUID string could.
 *
 * The positive control (a signed-in, non-admin student calling `is_admin()`)
 * proves the denial above is a privilege gap for ANON specifically, not an
 * unrelated outage or a function that no longer exists — `authenticated`
 * keeps EXECUTE unchanged by this migration (#1367 interview: only
 * anon/PUBLIC EXECUTE is in scope).
 *
 * Status: Expected to PASS (defense should hold). A failing assertion means
 * an anonymous caller can still invoke that function.
 */

import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { deriveRpcSpecs, type RpcSpec } from './helpers/rpc-specs'
import { ATTACKER_EMAIL, ATTACKER_PASSWORD, seedRedTeamUsers } from './helpers/seed-users'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321'
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!ANON_KEY) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is required')

const FUNCTION_PERMISSION_DENIED = /permission denied for function/i

// Unauthenticated client — anon key only, no sign-in, no JWT.
const unauthClient = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

test.describe('Red Team: Anonymous Function EXECUTE Denied on Every Public Function', () => {
  let rpcs: RpcSpec[]

  // Non-vacuity for the loop below (code-style.md §7): an empty function set
  // would let the probe pass without calling anything.
  test.beforeAll(async () => {
    await seedRedTeamUsers()
    rpcs = await deriveRpcSpecs()
    expect(rpcs.length).toBeGreaterThan(0)
    expect(rpcs.map((r) => r.name)).toContain('is_admin')
  })

  test('positive control: a signed-in student can still execute is_admin() and gets false', async () => {
    const student = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)
    const { data, error } = await student.rpc('is_admin')
    expect(error).toBeNull()
    expect(data).toBe(false)
  })

  test('anonymous caller cannot execute any public function', async () => {
    for (const { name, params } of rpcs) {
      const args = Object.fromEntries(params.map((p) => [p, null]))
      const { error } = await unauthClient.rpc(name, args)
      expect.soft(error?.code, `EXECUTE on "${name}" must be rejected`).toBe('42501')
      expect
        .soft(error?.message ?? '', `EXECUTE on "${name}" error message`)
        .toMatch(FUNCTION_PERMISSION_DENIED)
    }
  })
})
