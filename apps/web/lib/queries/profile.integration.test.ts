// App-layer integration tier (#925) — getProfileData.
//
// Exercises the real getProfileData helper (users SELECT, organizations SELECT) against real
// Postgres under real RLS. Validates field mapping and the soft-deleted organization filter.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  cleanupTestData,
  createTestOrg,
  createTestUser,
  fixtureSuffix,
  getAdminClient,
  signInAs,
} from '@/lib/integration-support/harness'
import { getProfileData } from '@/lib/queries/profile'

const admin = getAdminClient()
const suffix = fixtureSuffix()

let orgId: string
let orgName: string
let studentAId: string
const emailA = `int-prof-a-${suffix}@test.local`
const password = 'test-pass-123'

describe('getProfileData (app-layer integration)', () => {
  beforeAll(async () => {
    orgName = `int-prof ${suffix}`
    orgId = await createTestOrg({
      admin,
      name: orgName,
      slug: `int-prof-${suffix}`,
    })

    studentAId = await createTestUser({
      admin,
      orgId,
      email: emailA,
      password,
      role: 'student',
      fullName: 'Test Student',
    })
  })

  afterAll(async () => {
    const errors: string[] = []

    try {
      await cleanupTestData({ admin, orgId, userIds: [studentAId] })
    } catch (e) {
      errors.push(`cleanupTestData: ${e instanceof Error ? e.message : String(e)}`)
    }

    if (errors.length > 0) throw new Error(`afterAll: ${errors.join('; ')}`)
  })

  it('returns correctly mapped profile fields including organization name', async () => {
    await signInAs(emailA, password)

    const data = await getProfileData()

    expect(data.fullName).toBe('Test Student')
    expect(data.email).toBe(emailA)
    expect(data.organizationName).toBe(orgName)
    expect(typeof data.memberSince).toBe('string')
    expect(data.memberSince.length).toBeGreaterThan(0)
  })

  it('returns null organizationName when the organization is soft-deleted', async () => {
    // Proves the `.is('deleted_at', null)` SQL filter on `organizations` is real.
    // Mocked unit tests can only mock the response shape — they cannot verify the filter
    // clause fires in SQL. Without this test, removing the filter would be undetectable.
    //
    // The org is temporarily soft-deleted and restored within this test so that the
    // rest of the suite and cleanupTestData (which hard-DELETEs by id) are unaffected.
    const now = new Date().toISOString()
    const { error: softDeleteErr } = await admin
      .from('organizations')
      .update({ deleted_at: now })
      .eq('id', orgId)
    if (softDeleteErr) throw new Error(`soft-delete org: ${softDeleteErr.message}`)

    try {
      await signInAs(emailA, password)

      const data = await getProfileData()

      expect(data.organizationName).toBeNull()
    } finally {
      // Restore deleted_at so subsequent tests and cleanupTestData are not affected.
      const { error: restoreErr } = await admin
        .from('organizations')
        .update({ deleted_at: null })
        .eq('id', orgId)
      if (restoreErr)
        console.error(
          '[profile.integration afterAll] restore org deleted_at failed:',
          restoreErr.message,
        )
    }
  })
})
