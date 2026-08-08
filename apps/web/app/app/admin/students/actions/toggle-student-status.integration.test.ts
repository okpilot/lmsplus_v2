// App-layer integration tier (#925) — toggleStudentStatus against real Postgres.
//
// toggle-student-status-mutations.ts writes through the service-role adminClient
// to set / clear deleted_at on the `users` table. The `users` table has the same
// single-SELECT-policy structure as `questions` (tenant_isolation FOR ALL, whose
// USING qualifier requires deleted_at IS NULL) — the post-update row is invisible
// to the caller and Postgres rejects the write with "new row violates row-level
// security policy". This is the same trap that kept #815 undetected for two months
// because the co-located unit test mocks the admin client and cannot see real RLS.
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

  it('marks the student deleted and bans them when their org admin deactivates them', async () => {
    // Regression guard for the #815 bug class on `users`: before the service-role
    // fix in toggle-student-status-mutations.ts, the UPDATE that sets deleted_at
    // would be rejected by the tenant_isolation policy (the post-update row with
    // deleted_at set is invisible to the caller, so Postgres rejects the write).
    // The unit test mocks adminClient and would pass regardless — only this tier
    // can catch the regression.
    const before = await readUser(studentId)
    expect(before.deleted_at).toBeNull()

    await signInAs(adminAEmail, password)
    const result = await toggleStudentStatus({ id: studentId })

    expect(result.success).toBe(true)

    const after = await readUser(studentId)
    expect(after.deleted_at).not.toBeNull()
  })

  it('clears deleted_at and unbans the student when the same admin reactivates them', async () => {
    // studentId was deactivated in the previous test; verify the round-trip works.
    const before = await readUser(studentId)
    expect(before.deleted_at).not.toBeNull()

    await signInAs(adminAEmail, password)
    const result = await toggleStudentStatus({ id: studentId })

    expect(result.success).toBe(true)

    const after = await readUser(studentId)
    expect(after.deleted_at).toBeNull()
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
  })
})
