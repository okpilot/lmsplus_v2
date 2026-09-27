// App-layer integration tier (#925) — recovery-code helpers against real Postgres.
//
// findActiveUserIdByEmail runs a real `.from('users')` lookup with a
// `.is('deleted_at', null)` filter — a mocked client can't prove the filter
// actually excludes a soft-deleted row from the schema, or that the query
// resolves against the real column names.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  cleanupTestData,
  createTestOrg,
  createTestUser,
  fixtureSuffix,
  getAdminClient,
} from '@/lib/integration-support/harness'
import { findActiveUserIdByEmail } from './recovery-code'

const admin = getAdminClient()
const suffix = fixtureSuffix()
const password = 'test-pass-123'

let orgId: string | undefined
let activeStudentId: string
let softDeletedStudentId: string
let mixedCaseStudentId: string

const activeEmail = `int-recoverycode-active-${suffix}@test.local`
const softDeletedEmail = `int-recoverycode-softdel-${suffix}@test.local`
const unknownEmail = `int-recoverycode-unknown-${suffix}@test.local`
// Stored with capitals, the way an admin-typed address is stored (create-student does not
// lowercase on insert) — the lookup itself always receives a lowercased query (EmailSchema).
const mixedCaseStoredEmail = `Int-RecoveryCode-Mixed-${suffix}@Test.Local`

describe('findActiveUserIdByEmail (app-layer integration)', () => {
  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `recoverycode ${suffix}`,
      slug: `recoverycode-${suffix}`,
    })

    activeStudentId = await createTestUser({
      admin,
      orgId,
      email: activeEmail,
      password,
      role: 'student',
    })
    softDeletedStudentId = await createTestUser({
      admin,
      orgId,
      email: softDeletedEmail,
      password,
      role: 'student',
    })
    mixedCaseStudentId = await createTestUser({
      admin,
      orgId,
      email: mixedCaseStoredEmail,
      password,
      role: 'student',
    })

    const { error } = await admin
      .from('users')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', softDeletedStudentId)
    if (error) throw new Error(`soft-delete: ${error.message}`)
  })

  afterAll(async () => {
    if (orgId) {
      await cleanupTestData({
        admin,
        orgId,
        userIds: [activeStudentId, softDeletedStudentId, mixedCaseStudentId].filter(
          (id): id is string => id !== undefined,
        ),
      })
    }
  })

  it('returns the id for an active user matching the email', async () => {
    await expect(findActiveUserIdByEmail(activeEmail)).resolves.toBe(activeStudentId)
  })

  it('returns null for a soft-deleted user, even though the row still exists', async () => {
    await expect(findActiveUserIdByEmail(softDeletedEmail)).resolves.toBeNull()
  })

  it('returns null when no user matches the email', async () => {
    await expect(findActiveUserIdByEmail(unknownEmail)).resolves.toBeNull()
  })

  it('finds an active user whose stored email differs only in case', async () => {
    await expect(findActiveUserIdByEmail(mixedCaseStoredEmail.toLowerCase())).resolves.toBe(
      mixedCaseStudentId,
    )
  })
})
