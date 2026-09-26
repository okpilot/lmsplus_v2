// App-layer integration tier (#925) — temp-password helpers against real Postgres.
//
// readTempPasswordState reads the caller's OWN row under RLS (users_select:
// `id = auth.uid() AND deleted_at IS NULL`, mig 20260312000012) — a mocked
// client can't prove the RLS predicate actually scopes to the signed-in user,
// or that a soft-deleted row becomes invisible to its own former owner.
// clearTempPassword writes via the service-role adminClient and must be scoped
// to exactly the target row, not every armed user.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  cleanupTestData,
  createTestOrg,
  createTestUser,
  fixtureSuffix,
  getAdminClient,
  getAuthenticatedClient,
} from '@/lib/integration-support/harness'
import { readTempPasswordState } from './temp-password'
import { clearTempPassword } from './temp-password-admin'

const admin = getAdminClient()
const suffix = fixtureSuffix()
const password = 'test-pass-123'

let orgId: string | undefined
let activeStudentId: string
let expiredStudentId: string
let softDeletedStudentId: string

const activeEmail = `int-temppw-active-${suffix}@test.local`
const expiredEmail = `int-temppw-expired-${suffix}@test.local`
const softDeletedEmail = `int-temppw-softdel-${suffix}@test.local`

async function armTempPassword(userId: string, expiresAt: string): Promise<void> {
  const { error } = await admin
    .from('users')
    .update({ temp_password_expires_at: expiresAt })
    .eq('id', userId)
  if (error) throw new Error(`armTempPassword(${userId}): ${error.message}`)
}

async function readColumn(userId: string): Promise<string | null> {
  const { data, error } = await admin
    .from('users')
    .select('temp_password_expires_at')
    .eq('id', userId)
    .single<{ temp_password_expires_at: string | null }>()
  if (error) throw new Error(`readColumn(${userId}): ${error.message}`)
  return data.temp_password_expires_at
}

describe('temp-password helpers (app-layer integration)', () => {
  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `temppw ${suffix}`,
      slug: `temppw-${suffix}`,
    })

    activeStudentId = await createTestUser({
      admin,
      orgId,
      email: activeEmail,
      password,
      role: 'student',
    })
    expiredStudentId = await createTestUser({
      admin,
      orgId,
      email: expiredEmail,
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

    await armTempPassword(activeStudentId, new Date(Date.now() + 60 * 60 * 1000).toISOString())
    await armTempPassword(expiredStudentId, new Date(Date.now() - 60 * 60 * 1000).toISOString())
  })

  afterAll(async () => {
    if (orgId) {
      await cleanupTestData({
        admin,
        orgId,
        userIds: [activeStudentId, expiredStudentId, softDeletedStudentId].filter(
          (id): id is string => id !== undefined,
        ),
      })
    }
  })

  it("returns active for the caller's own row when the expiry is in the future", async () => {
    const client = await getAuthenticatedClient({ email: activeEmail, password })

    await expect(readTempPasswordState(client, activeStudentId)).resolves.toBe('active')
  })

  it("returns expired for the caller's own row when the expiry has passed", async () => {
    const client = await getAuthenticatedClient({ email: expiredEmail, password })

    await expect(readTempPasswordState(client, expiredStudentId)).resolves.toBe('expired')
  })

  it('returns none once the row is soft-deleted, even for the row it used to belong to', async () => {
    // Sign in BEFORE soft-deleting: gotrue may itself refuse to authenticate a
    // soft-deleted account, and the behaviour under test is RLS excluding the
    // row from a session that already exists.
    const client = await getAuthenticatedClient({ email: softDeletedEmail, password })
    await armTempPassword(softDeletedStudentId, new Date(Date.now() + 60 * 60 * 1000).toISOString())
    await expect(readTempPasswordState(client, softDeletedStudentId)).resolves.toBe('active')

    const { error } = await admin
      .from('users')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', softDeletedStudentId)
    if (error) throw new Error(`soft-delete: ${error.message}`)

    await expect(readTempPasswordState(client, softDeletedStudentId)).resolves.toBe('none')
  })

  it('clears only the target user, leaving a second armed user untouched', async () => {
    // Non-vacuous per code-style.md §7: assert both rows are armed before the
    // mutation, so "still set" afterwards for the untouched user proves scoping,
    // not an already-empty column.
    const activeExpiresAt = await readColumn(activeStudentId)
    expect(activeExpiresAt).not.toBeNull()
    expect(await readColumn(expiredStudentId)).not.toBeNull()
    if (!activeExpiresAt) throw new Error('expected activeStudentId to carry an expiry')

    const result = await clearTempPassword(activeStudentId, activeExpiresAt)

    expect(result).toEqual({ success: true })
    expect(await readColumn(activeStudentId)).toBeNull()
    expect(await readColumn(expiredStudentId)).not.toBeNull()
  })

  it('leaves the flag as is when the expiry changed since it was read (an admin re-armed it)', async () => {
    const valueA = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    await armTempPassword(expiredStudentId, valueA)
    const readA = await readColumn(expiredStudentId)
    expect(Date.parse(readA ?? '')).toBe(Date.parse(valueA))

    const valueB = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
    await armTempPassword(expiredStudentId, valueB)

    if (!readA) throw new Error('expected expiredStudentId to carry an expiry')
    const result = await clearTempPassword(expiredStudentId, readA)

    expect(result).toEqual({ success: false })
    expect(Date.parse((await readColumn(expiredStudentId)) ?? '')).toBe(Date.parse(valueB))
  })
})
