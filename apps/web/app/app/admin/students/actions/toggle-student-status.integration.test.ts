// App-layer integration tier (#925) — toggleStudentStatus against real Postgres.
//
// toggle-student-status-mutations.ts writes through the service-role adminClient
// to set / clear deleted_at on the `users` table. That client is load-bearing:
// an RLS (authenticated) client cannot express this write at all — though for
// different reasons than the `questions` case in #815, which fails on
// post-update row visibility. On `users` it is blocked three layers earlier:
//   1. mig 20260606000006 REVOKEs blanket UPDATE on public.users from
//      `authenticated` and re-GRANTs only UPDATE (full_name) — a deleted_at
//      write is rejected at the privilege layer, before RLS is evaluated.
//   2. `users_update_own` (mig 20260326000056) is USING (id = auth.uid() AND
//      deleted_at IS NULL), so an admin targeting a STUDENT's row matches zero
//      rows — a silent no-op rather than an error.
//   3. `trg_protect_users_sensitive_columns` (mig 20260316000041) raises for any
//      non-service-role change to deleted_at.
// Note there is no `tenant_isolation` policy on `users`; the one in the initial
// schema was dropped (migs 20260311000004, 20260312000012) for infinite
// recursion. The live policies are `users_select` and `users_update_own`.
//
// Same CLASS of trap as #815, and the same reason it needs this tier: the
// co-located unit test mocks adminClient and would pass even if
// applyStatusChange regressed to the RLS client.
//
// Only this tier can catch a regression where someone reverts applyStatusChange()
// to use the RLS client: the unit test would still pass while every real
// deactivation silently fails in production.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  cleanupTestData,
  createTestOrg,
  createTestUser,
  getAdminClient,
  signInAs,
} from '@/lib/integration-support/harness'
import { toggleStudentStatus } from './toggle-student-status'

const admin = getAdminClient()
const suffix = Date.now()
const password = 'test-pass-123'

let orgAId: string
let orgBId: string
let adminAId: string
let adminBId: string
/** The student whose lifecycle the tests exercise. */
let studentId: string

const adminAEmail = `int-tss-admin-a-${suffix}@test.local`
const adminBEmail = `int-tss-admin-b-${suffix}@test.local`
const studentEmail = `int-tss-student-${suffix}@test.local`

/**
 * Service-role read for post-action assertions.
 * Once deleted_at is set, the row is invisible to any RLS client (that is the
 * whole bug being guarded here), so state checks must bypass RLS.
 */
async function readUser(id: string) {
  const { data, error } = await admin
    .from('users')
    .select('id, deleted_at')
    .eq('id', id)
    .single<{ id: string; deleted_at: string | null }>()
  if (error) throw new Error(`readUser(${id}): ${error.message}`)
  return data
}

/**
 * Auth-side ban state. `deactivateStudent` is a two-step flip — auth ban, then
 * the profile soft-delete — so the profile row alone does not prove the student
 * was actually locked out. Returns `banned_until` (null when not banned).
 */
async function readAuthBan(id: string): Promise<string | null> {
  const { data, error } = await admin.auth.admin.getUserById(id)
  if (error) throw new Error(`readAuthBan(${id}): ${error.message}`)
  const bannedUntil = (data.user as { banned_until?: string | null } | null)?.banned_until
  return bannedUntil ?? null
}

describe('toggleStudentStatus (app-layer integration)', () => {
  beforeAll(async () => {
    orgAId = await createTestOrg({ admin, name: `tss A ${suffix}`, slug: `tss-a-${suffix}` })
    orgBId = await createTestOrg({ admin, name: `tss B ${suffix}`, slug: `tss-b-${suffix}` })

    adminAId = await createTestUser({
      admin,
      orgId: orgAId,
      email: adminAEmail,
      password,
      role: 'admin',
    })
    adminBId = await createTestUser({
      admin,
      orgId: orgBId,
      email: adminBEmail,
      password,
      role: 'admin',
    })
    studentId = await createTestUser({
      admin,
      orgId: orgAId,
      email: studentEmail,
      password,
      role: 'student',
    })
  })

  afterAll(async () => {
    const errors: string[] = []

    try {
      await cleanupTestData({ admin, orgId: orgAId, userIds: [adminAId, studentId] })
    } catch (e) {
      errors.push(`cleanupTestData(A): ${e instanceof Error ? e.message : String(e)}`)
    }
    try {
      await cleanupTestData({ admin, orgId: orgBId, userIds: [adminBId] })
    } catch (e) {
      errors.push(`cleanupTestData(B): ${e instanceof Error ? e.message : String(e)}`)
    }

    if (errors.length > 0) throw new Error(`afterAll: ${errors.join('; ')}`)
  })

  it('deactivates a student so they can no longer sign in', async () => {
    // Regression guard for the #815 bug class on `users`: if
    // applyStatusChange regressed to the RLS client, this write would be
    // rejected by the privilege revoke / row scope / trigger described in the
    // file header. The unit test mocks adminClient and would pass regardless —
    // only this tier can catch it.
    const before = await readUser(studentId)
    expect(before.deleted_at).toBeNull()

    await signInAs(adminAEmail, password)
    const result = await toggleStudentStatus({ id: studentId })

    expect(result.success).toBe(true)

    const after = await readUser(studentId)
    expect(after.deleted_at).not.toBeNull()
    // The ban is the half that actually stops the student signing in; asserting
    // only deleted_at would let a regression that drops the ban pass while the
    // student keeps a working session.
    expect(await readAuthBan(studentId)).not.toBeNull()
  })

  it('reactivates the student and restores their access when the same admin requests it', async () => {
    // Depends on the previous test DELIBERATELY: the deactivate→reactivate
    // round-trip is the behaviour under test, and toggleStudentStatus derives
    // its direction from current state. Vitest runs a file's tests in order;
    // the preconditions below fail loudly if that ever changes.
    const before = await readUser(studentId)
    expect(before.deleted_at).not.toBeNull()
    expect(await readAuthBan(studentId)).not.toBeNull()

    await signInAs(adminAEmail, password)
    const result = await toggleStudentStatus({ id: studentId })

    expect(result.success).toBe(true)

    const after = await readUser(studentId)
    expect(after.deleted_at).toBeNull()
    expect(await readAuthBan(studentId)).toBeNull()
  })

  it('leaves the student untouched when an admin from another organisation tries to deactivate them', async () => {
    // Non-vacuous: assert the row is live before the blocked attempt, so "still not
    // deleted" afterwards proves real rejection, not an empty or already-deleted row
    // (code-style.md §7 — isolation negative assertions must be reachable).
    const before = await readUser(studentId)
    expect(before.deleted_at).toBeNull()

    await signInAs(adminBEmail, password)
    const result = await toggleStudentStatus({ id: studentId })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected cross-org deactivation to fail')
    expect(result.error).toBe('Student not found')

    const after = await readUser(studentId)
    expect(after.deleted_at).toBeNull()
    expect(await readAuthBan(studentId)).toBeNull()
  })
})
