/**
 * Red Team Spec: record_login_instructions_sent RPC
 *
 * Vector FP (HIGH). Admin-only RPC (mig 20260925000100) that stamps a
 * temporary-password expiry (`login_instructions_sent_at`,
 * `temp_password_expires_at`) on a target `public.users` row and writes one
 * `user.login_instructions_sent` audit row. Guard order (from the migration):
 *   1. auth.uid() IS NULL              → not_authenticated (this spec)
 *   2. NOT is_admin()                  → not_admin           (this spec)
 *   3. active-admin gate               → admin_not_found     (NOT exercised
 *                                         here — fires only when the calling
 *                                         admin is soft-deleted mid-transaction;
 *                                         shared guard shape with the
 *                                         record_internal_exam_code_emailed
 *                                         family, none of which cover it at
 *                                         the E2E layer either)
 *   4. row-guarded UPDATE (org + deleted_at + role IN student/instructor)
 *                                       → user_not_found (existence-hiding of
 *                                         cross-org, soft-deleted, and
 *                                         admin-role targets — this spec)
 *
 * Tests cover:
 *  - unauthenticated (anon-key) caller → not_authenticated
 *  - authenticated student (non-admin) caller → not_admin
 *  - cross-org admin, target in the victim's own org → user_not_found
 *  - own-org admin, soft-deleted target → user_not_found
 *  - own-org admin, admin-role target → user_not_found
 *  - authenticated student, direct PostgREST UPDATE on their own row's two
 *    login-instructions columns (bypassing the RPC entirely) → 42501,
 *    no column-level UPDATE grant (mig 090, #773; mirrors Vector CG in
 *    users-role-forge.spec.ts)
 *
 * Every rejected AUTHENTICATED-attacker call (guards 2-4) asserts (non-vacuous
 * negative, code-style.md §7):
 *  - the target row exists, read via service role, before the attack;
 *  - both `login_instructions_sent_at`/`temp_password_expires_at` are
 *    unchanged (service-role read before AND after);
 *  - no `user.login_instructions_sent` audit row was written for that
 *    resource_id since test start.
 * The unauthenticated case (guard 1) raises before any row lookup, so it
 * calls with a nil uuid and asserts the error + null data only — the same
 * shape as `record_internal_exam_code_emailed rejects unauthenticated
 * callers (Vector DZ)` in server-action-unauthenticated.spec.ts.
 */

import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  ATTACKER_EMAIL,
  ATTACKER_PASSWORD,
  seedCrossOrgAdmin,
  seedRedTeamAdmin,
  seedRedTeamUsers,
} from './helpers/seed-users'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321'
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Unauthenticated client — anon key only, no sign-in, no JWT.
const unauthClient = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

type TargetState = {
  login_instructions_sent_at: string | null
  temp_password_expires_at: string | null
}

test.describe('Red Team: record_login_instructions_sent RPC', () => {
  let admin: ReturnType<typeof getAdminClient>
  let attackerStudentClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let adminClientAuthed: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let crossOrgAdminClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let adminUserId: string
  let victimUserId: string
  let attackerUserId: string

  test.beforeAll(async () => {
    admin = getAdminClient()

    const seed = await seedRedTeamUsers()
    victimUserId = seed.victimUserId
    attackerUserId = seed.attackerUserId

    const seededAdmin = await seedRedTeamAdmin()
    adminUserId = seededAdmin.adminUserId

    const crossOrg = await seedCrossOrgAdmin()

    attackerStudentClient = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)
    adminClientAuthed = await createAuthenticatedClient(ADMIN_EMAIL, ADMIN_PASSWORD)
    crossOrgAdminClient = await createAuthenticatedClient(crossOrg.email, crossOrg.password)
  })

  // Reads the two login-instructions columns via service role — used both as the
  // pre-attack baseline and the post-rejection comparison. The `.single()`
  // error/data assertions double as the target-row-exists proof (non-vacuous
  // negative, code-style.md §7).
  const expectTargetState = async (userId: string): Promise<TargetState> => {
    const { data, error } = await admin
      .from('users')
      .select('login_instructions_sent_at, temp_password_expires_at')
      .eq('id', userId)
      .single()
    expect(error).toBeNull()
    if (!data) throw new Error(`expectTargetState: no users row for ${userId}`)
    return data
  }

  // Assert no user.login_instructions_sent audit row exists for this target
  // since testStart — non-vacuous negative (code-style.md §7).
  const expectNoLoginInstructionsAudit = async (userId: string, testStart: string) => {
    const { data, error } = await admin
      .from('audit_events')
      .select('id')
      .eq('event_type', 'user.login_instructions_sent')
      .eq('resource_id', userId)
      .gte('created_at', testStart)
    expect(error).toBeNull()
    expect(data?.length ?? 0).toBe(0)
  }

  test('unauthenticated caller cannot send login instructions (Vector FP — privilege denied)', async () => {
    // mig 20260925000400 revokes anon EXECUTE on every public function, so the
    // call is rejected at the privilege layer (42501) BEFORE the body's own
    // auth.uid() IS NULL guard (mig 20260925000100) or any target-row lookup
    // is ever reached. A non-existent uuid is therefore fine.
    const { data, error } = await unauthClient.rpc('record_login_instructions_sent', {
      p_user_id: '00000000-0000-4000-a000-000000000004',
    })
    expect(error?.code).toBe('42501')
    expect(error?.message ?? '').toMatch(/permission denied for function/i)
    expect(data ?? null).toBeNull()
  })

  test('authenticated student (non-admin) cannot send login instructions (Vector FP — not_admin)', async () => {
    const testStart = new Date().toISOString()
    // Non-vacuity: prove the target row exists and capture its baseline state
    // before the attack, so the rejection proves the role gate fired — not
    // that the target was simply absent.
    const before = await expectTargetState(victimUserId)

    const { data, error } = await attackerStudentClient.rpc('record_login_instructions_sent', {
      p_user_id: victimUserId,
    })

    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/not_admin/i)
    expect(data).toBeNull()
    const after = await expectTargetState(victimUserId)
    expect(after).toEqual(before)
    await expectNoLoginInstructionsAudit(victimUserId, testStart)
  })

  test('cross-org admin cannot send login instructions to a foreign-org user (Vector FP — user_not_found)', async () => {
    const testStart = new Date().toISOString()
    // Non-vacuity: prove the victim exists in their own (egmont) org before the
    // attack, so the rejection proves org-scoping fired — not an absent row.
    const before = await expectTargetState(victimUserId)

    const { data, error } = await crossOrgAdminClient.rpc('record_login_instructions_sent', {
      p_user_id: victimUserId,
    })

    expect(error).not.toBeNull()
    // Existence-hiding: must report user_not_found, not a more specific error.
    expect(error?.message ?? '').toMatch(/user_not_found/i)
    expect(data).toBeNull()
    const after = await expectTargetState(victimUserId)
    expect(after).toEqual(before)
    await expectNoLoginInstructionsAudit(victimUserId, testStart)
  })

  test.describe('soft-deleted target', () => {
    let victimSoftDeleted = false

    // Restore in afterEach, which runs even when the test fails — a stranded
    // soft-deleted victim would poison every downstream spec that
    // authenticates as, or otherwise depends on, redteam-victim@.
    test.afterEach(async () => {
      if (!victimSoftDeleted) return
      const { data: restored, error: restoreErr } = await admin
        .from('users')
        .update({ deleted_at: null })
        .eq('id', victimUserId)
        .select('id')
      if (restoreErr) throw new Error(`[FP cleanup] restore victim failed: ${restoreErr.message}`)
      if ((restored?.length ?? 0) === 0) {
        throw new Error('[FP cleanup] restore victim affected 0 rows')
      }
      victimSoftDeleted = false
    })

    test('own-org admin cannot send login instructions to a soft-deleted user (Vector FP — user_not_found)', async () => {
      const testStart = new Date().toISOString()
      // Non-vacuity: prove the target row is active (and capture its baseline
      // state) before soft-deleting it, so the rejection proves the
      // deleted_at guard fired — not that the row was already absent.
      const before = await expectTargetState(victimUserId)

      const { data: deleted, error: deleteErr } = await admin
        .from('users')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', victimUserId)
        .is('deleted_at', null)
        .select('id')
      if (deleteErr) throw new Error(`soft-delete victim failed: ${deleteErr.message}`)
      if ((deleted?.length ?? 0) === 0) throw new Error('soft-delete victim affected 0 rows')
      victimSoftDeleted = true

      const { data, error } = await adminClientAuthed.rpc('record_login_instructions_sent', {
        p_user_id: victimUserId,
      })

      expect(error).not.toBeNull()
      expect(error?.message ?? '').toMatch(/user_not_found/i)
      expect(data).toBeNull()
      const after = await expectTargetState(victimUserId)
      expect(after).toEqual(before)
      await expectNoLoginInstructionsAudit(victimUserId, testStart)
    })
  })

  test('own-org admin cannot send login instructions to an admin-role target (Vector FP — user_not_found)', async () => {
    const testStart = new Date().toISOString()
    // Target the calling admin's own row: same org, active, but role 'admin'
    // is outside the RPC's student/instructor scope — isolates the role
    // guard from org-scoping and soft-delete, which the two tests above
    // already cover. Baseline read proves non-vacuity the same way.
    const before = await expectTargetState(adminUserId)

    const { data, error } = await adminClientAuthed.rpc('record_login_instructions_sent', {
      p_user_id: adminUserId,
    })

    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/user_not_found/i)
    expect(data).toBeNull()
    const after = await expectTargetState(adminUserId)
    expect(after).toEqual(before)
    await expectNoLoginInstructionsAudit(adminUserId, testStart)
  })

  test.describe('direct PostgREST column write', () => {
    let baseline: TargetState | null = null

    // Restore in afterEach, which runs even when the test fails — a
    // stranded mutated attacker row would poison downstream specs that
    // authenticate as, or otherwise depend on, redteam-attacker@.
    test.afterEach(async () => {
      if (!baseline) return
      const { data: restored, error: restoreErr } = await admin
        .from('users')
        .update({
          login_instructions_sent_at: baseline.login_instructions_sent_at,
          temp_password_expires_at: baseline.temp_password_expires_at,
        })
        .eq('id', attackerUserId)
        .select('id')
      if (restoreErr) throw new Error(`[FP cleanup] restore attacker failed: ${restoreErr.message}`)
      if ((restored?.length ?? 0) === 0) {
        throw new Error('[FP cleanup] restore attacker affected 0 rows')
      }
      baseline = null
    })

    // One UPDATE per column: Postgres needs UPDATE privilege on every column
    // a statement writes, so a two-column UPDATE still fails with 42501 when
    // only one of the grants regresses.
    for (const column of ['login_instructions_sent_at', 'temp_password_expires_at'] as const) {
      test(`a student cannot write ${column} on their own row via direct UPDATE (Vector FP — no column grant)`, async () => {
        // Non-vacuity: prove the attacker row exists and capture its baseline
        // state before the attempt, so the rejection proves the column-level
        // privilege revoke fired — not that the row was simply absent.
        baseline = await expectTargetState(attackerUserId)

        const { error } = await attackerStudentClient
          .from('users')
          .update({ [column]: new Date().toISOString() })
          .eq('id', attackerUserId)
          .select('id')

        // Mig 090 (#773) revokes UPDATE on every users column except
        // full_name from authenticated; the two login-instructions columns
        // (mig 20260925000100) were never re-granted, so Postgres rejects the
        // write at the privilege layer (42501) before RLS or any trigger runs
        // — same mechanism as Vector CG in users-role-forge.spec.ts, whose
        // header documents Postgres not always naming the specific column.
        expect(error).not.toBeNull()
        expect(error?.code).toBe('42501')
        expect(error?.message ?? '').toMatch(/permission denied for (table users|column)/i)

        const after = await expectTargetState(attackerUserId)
        expect(after).toEqual(baseline)
      })
    }
  })
})
