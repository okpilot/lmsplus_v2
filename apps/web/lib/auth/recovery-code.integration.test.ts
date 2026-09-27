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

const activeEmail = `int-recoverycode-active-${suffix}@test.local`
const softDeletedEmail = `int-recoverycode-softdel-${suffix}@test.local`
const unknownEmail = `int-recoverycode-unknown-${suffix}@test.local`

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
        userIds: [activeStudentId, softDeletedStudentId].filter(
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
})
