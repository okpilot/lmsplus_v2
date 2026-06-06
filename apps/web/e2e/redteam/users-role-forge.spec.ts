/**
 * Red Team Spec: users table privilege escalation via direct column UPDATE (#751, #773, Vector CG)
 *
 * Attack: an authenticated student calls
 *   supabase.from('users').update({ role: 'admin' }).eq('id', <self>)
 * via the PostgREST API, attempting to self-promote to admin.
 *
 * Goal: verify the layered defenses reject sensitive-column writes:
 *
 *   Layer 1 (mig 090, #773) — column-level privilege revoke:
 *     REVOKE UPDATE ON public.users FROM authenticated;
 *     GRANT UPDATE (full_name) ON public.users TO authenticated;
 *     An UPDATE targeting role, organization_id, or deleted_at now fails with
 *     Postgres error 42501 ("permission denied for column …") at the privilege
 *     layer, BEFORE RLS or the trigger are evaluated.
 *
 *   Layer 2 — RLS `users_update_own` policy (mig 20260326000056):
 *     Scopes the updatable ROW to id = auth.uid() AND deleted_at IS NULL.
 *
 *   Layer 3 — BEFORE UPDATE trigger `trg_protect_users_sensitive_columns`
 *     (mig 20260316000041): raises an exception if role, organization_id, or
 *     deleted_at change for non-service-role connections.
 *
 * Evaluation order note: with mig 090 applied, the privilege revoke fires first
 * (Postgres checks column privileges before executing the statement), so the
 * observable error should match /permission denied/ (42501) rather than the
 * trigger's RAISE EXCEPTION message. Both the privilege check and the trigger
 * are independently effective; the trigger remains as defense-in-depth.
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
    // Mig 090 (#773) adds a column-level privilege revoke: authenticated no longer holds
    // UPDATE on the `role` column. Postgres checks column privileges before evaluating RLS
    // or firing the BEFORE UPDATE trigger, so the rejection now surfaces as a privilege
    // error (42501 / "permission denied for column role") rather than the trigger's
    // RAISE EXCEPTION message. The trigger (mig 20260316000041) remains as defense-in-depth
    // for service-path regressions, but is not reached for this authenticated attempt.
    const { error } = await studentClient
      .from('users')
      .update({ role: 'admin' })
      .eq('id', studentUserId)
    expect(error).not.toBeNull()
    // With mig 090 applied, the privilege layer fires first (42501). Postgres reports an
    // UPDATE touching a column the role lacks (and with no table-wide UPDATE grant) as
    // "permission denied for table users" — confirmed empirically; it does not always name
    // the specific column. Either privilege phrasing proves the privilege-layer block; the
    // trigger message ("Cannot modify role column") would only surface if the revoke
    // regressed. Accept all three so the test asserts "rejected at the privilege/trigger
    // layer" without over-fitting Postgres's exact 42501 wording.
    expect(error?.message).toMatch(
      /permission denied for (table users|column role)|Cannot modify role column/i,
    )

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
    // Mig 090 (#773) revokes UPDATE on organization_id from authenticated, so the
    // privilege layer (42501) fires before the trigger (mig 20260316000041, line 21-23).
    const fakeOrgId = '00000000-0000-0000-0000-000000000001'
    const { error } = await studentClient
      .from('users')
      .update({ organization_id: fakeOrgId })
      .eq('id', studentUserId)
    expect(error).not.toBeNull()
    // Mig 090: privilege layer fires first (42501) — Postgres surfaces this as
    // "permission denied for table users" (it does not always name the column). Either
    // privilege phrasing, or the trigger fallback, proves the forge is blocked.
    expect(error?.message).toMatch(
      /permission denied for (table users|column organization_id)|Cannot modify organization_id column/i,
    )

    // Non-vacuity post-read: org_id is unchanged.
    const { data: after, error: afterErr } = await adminClient
      .from('users')
      .select('organization_id')
      .eq('id', studentUserId)
      .single<{ organization_id: string }>()
    expect(afterErr).toBeNull()
    expect(after?.organization_id).toBe(originalOrgId)
  })

  test('positive control (#773): a student CAN update their own full_name via the column grant', async () => {
    // Mig 090 (#773) grants ONLY UPDATE (full_name) to authenticated after the blanket
    // REVOKE. This test proves:
    //   (a) the re-GRANT is present and scoped correctly — a full-revoke-only mistake
    //       would cause this to fail with 42501.
    //   (b) the trigger (mig 20260316000041) is narrowly scoped to role/organization_id/
    //       deleted_at and does not over-block full_name writes.
    // Without this positive control, a total-privilege-revoke would also pass the forge
    // tests above (error is non-null for any reason), making them vacuous.
    const updatedName = 'Red Team Attacker (updated)'
    const { data, error } = await studentClient
      .from('users')
      .update({ full_name: updatedName })
      .eq('id', studentUserId)
      .select('id')
    expect(error).toBeNull()
    expect(data?.length ?? 0).toBe(1)

    // Verify the value was actually written — not just that the call succeeded.
    const { data: readBack, error: readErr } = await adminClient
      .from('users')
      .select('full_name')
      .eq('id', studentUserId)
      .single<{ full_name: string | null }>()
    expect(readErr).toBeNull()
    expect(readBack?.full_name).toBe(updatedName)

    // Restore — service-role bypasses the trigger to reset test state.
    const { error: restoreErr } = await adminClient
      .from('users')
      .update({ full_name: `Red Team ${ATTACKER_EMAIL.split('@')[0]}` })
      .eq('id', studentUserId)
    expect(restoreErr).toBeNull()
  })
})
