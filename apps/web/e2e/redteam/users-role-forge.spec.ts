/**
 * Red Team Spec: users table privilege escalation via direct column UPDATE (#751, Vector CG)
 *
 * Attack: an authenticated student calls
 *   supabase.from('users').update({ role: 'admin' }).eq('id', <self>)
 * via the PostgREST API, attempting to self-promote to admin.
 *
 * Goal: verify that `trg_protect_users_sensitive_columns` (BEFORE UPDATE trigger,
 * migration 20260316000041) fires and raises an exception before any row mutation
 * can land — even though the `users_update_own` RLS policy (migration 20260326000056)
 * legitimately permits UPDATE on the student's own row (for profile edits like
 * full_name). RLS controls WHICH ROWS can be updated; the trigger controls WHICH
 * COLUMNS can be changed.
 *
 * Defense: `protect_users_sensitive_columns()` function (mig 20260316000041, line 18):
 *   IF NEW.role IS DISTINCT FROM OLD.role THEN
 *     RAISE EXCEPTION 'Cannot modify role column — requires service role';
 *   END IF;
 * Identical guard exists for organization_id (line 21) and deleted_at (line 25).
 * Service-role connections are exempt (line 12), so seed helpers still work.
 *
 * Non-vacuity (code-style.md §7): the spec pre-reads the student's own row via admin
 * client to assert `role === 'student'` BEFORE the forge; re-reads AFTER to assert
 * `role` is still 'student'. The pre-read also confirms the row exists, so
 * "0 rows touched" cannot be a false-negative from a missing row.
 *
 * Status: Expected to PASS (defense should hold). A failing assertion means
 * privilege escalation works.
 */

import { expect, test } from '@playwright/test'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { ATTACKER_EMAIL, ATTACKER_PASSWORD, seedRedTeamUsers } from './helpers/seed'

test.describe('Red Team: users Role Forge (privilege escalation via direct UPDATE)', () => {
  let studentClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let adminClient: ReturnType<typeof getAdminClient>
  let studentUserId: string

  test.beforeAll(async () => {
    const seed = await seedRedTeamUsers()
    studentUserId = seed.attackerUserId
    adminClient = getAdminClient()
    studentClient = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)
  })

  // No afterAll: seedRedTeamUsers() creates persistent red-team fixture users — the same
  // users used across all redteam specs. users rows are never cleaned up between specs
  // (they're idempotent seed data). The trigger ensures no column mutation lands, so no
  // row state needs restoring.

  test('Vector CG (#751): a student cannot self-promote to admin via direct UPDATE', async () => {
    // Non-vacuity pre-read: confirm the student row EXISTS and role is 'student' before
    // the forge. Without this, "role is still 'student' after" passes vacuously if the
    // row were missing or if admin already had the role. (code-style.md §7)
    const { data: before, error: beforeErr } = await adminClient
      .from('users')
      .select('role')
      .eq('id', studentUserId)
      .single<{ role: string }>()
    expect(beforeErr).toBeNull()
    expect(before?.role).toBe('student')

    // Forge attempt: student tries to escalate their own role to 'admin'.
    // users_update_own RLS (mig 20260326000056) permits UPDATE on the student's own row
    // for legitimate profile edits, so row-level gating does NOT block this.
    // The BEFORE UPDATE trigger trg_protect_users_sensitive_columns (mig 20260316000041,
    // line 17-19) fires first and RAISEs for any role column change.
    const { error } = await studentClient
      .from('users')
      .update({ role: 'admin' })
      .eq('id', studentUserId)
    expect(error).not.toBeNull()
    // PostgREST surfaces a RAISE EXCEPTION as HTTP 400 / code 'P0001' (unhandled PL/pgSQL
    // raise), or '42501' if the column is also revoked. Either way error must be non-null.
    // The trigger message is the authoritative signal (mig 20260316000041, line 18).
    expect(error?.message).toMatch(/Cannot modify role column — requires service role/i)

    // Non-vacuity post-read: confirm the row is unchanged — the trigger fired BEFORE any
    // mutation committed. If escalation worked, this assertion fails. (code-style.md §7)
    const { data: after, error: afterErr } = await adminClient
      .from('users')
      .select('role')
      .eq('id', studentUserId)
      .single<{ role: string }>()
    expect(afterErr).toBeNull()
    expect(after?.role).toBe('student')
  })

  test('Vector CG (#751): a student cannot forge organization_id via direct UPDATE', async () => {
    // Non-vacuity pre-read: confirm org_id exists and belongs to the student's own org.
    const { data: before, error: beforeErr } = await adminClient
      .from('users')
      .select('organization_id')
      .eq('id', studentUserId)
      .single<{ organization_id: string }>()
    expect(beforeErr).toBeNull()
    const originalOrgId = before?.organization_id
    expect(typeof originalOrgId).toBe('string')

    // Forge: student attempts to move themselves to a different (made-up) org UUID.
    // Same trigger guard (mig 20260316000041, line 21-23).
    const fakeOrgId = '00000000-0000-0000-0000-000000000001'
    const { error } = await studentClient
      .from('users')
      .update({ organization_id: fakeOrgId })
      .eq('id', studentUserId)
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/Cannot modify organization_id column — requires service role/i)

    // Non-vacuity post-read: org_id is unchanged.
    const { data: after, error: afterErr } = await adminClient
      .from('users')
      .select('organization_id')
      .eq('id', studentUserId)
      .single<{ organization_id: string }>()
    expect(afterErr).toBeNull()
    expect(after?.organization_id).toBe(originalOrgId)
  })

  test('positive control: a student CAN update their own full_name (trigger does not over-block)', async () => {
    // Proves trg_protect_users_sensitive_columns is narrowly scoped to the three
    // sensitive columns and does not block legitimate self-service profile updates.
    // Without this test, a block-everything trigger would also pass the forge tests
    // above, making them vacuous.
    const { data, error } = await studentClient
      .from('users')
      .update({ full_name: 'Red Team Attacker (updated)' })
      .eq('id', studentUserId)
      .select('id')
    expect(error).toBeNull()
    expect(data?.length ?? 0).toBe(1)

    // Restore — service-role bypasses the trigger to reset test state.
    const { error: restoreErr } = await adminClient
      .from('users')
      .update({ full_name: `Red Team ${ATTACKER_EMAIL.split('@')[0]}` })
      .eq('id', studentUserId)
    expect(restoreErr).toBeNull()
  })
})
