// App-layer integration tier — clearPasswordPendingMarker against real Postgres.
// The helper writes via the service-role client, so scoping to exactly the
// target live row is the property a mocked chain cannot prove.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  cleanupTestData,
  createTestOrg,
  createTestUser,
  fixtureSuffix,
  getAdminClient,
} from '@/lib/integration-support/harness'
import { clearPasswordPendingMarker } from './password-pending-marker'

const admin = getAdminClient()
const suffix = fixtureSuffix()
const password = 'test-pass-123'

let orgId: string | undefined
let targetId: string
let otherId: string
let softDeletedId: string

async function setMarker(userId: string, value: string): Promise<void> {
  const { error } = await admin
    .from('users')
    .update({ temp_password_expires_at: value })
    .eq('id', userId)
  if (error) throw new Error(`setMarker(${userId}): ${error.message}`)
}

async function readMarker(userId: string): Promise<string | null> {
  const { data, error } = await admin
    .from('users')
    .select('temp_password_expires_at')
    .eq('id', userId)
    .single<{ temp_password_expires_at: string | null }>()
  if (error) throw new Error(`readMarker(${userId}): ${error.message}`)
  return data.temp_password_expires_at
}

describe('clearPasswordPendingMarker (app-layer integration)', () => {
  beforeAll(async () => {
    orgId = await createTestOrg({ admin, name: `ppm ${suffix}`, slug: `ppm-${suffix}` })
    const make = (label: string) =>
      createTestUser({
        admin,
        orgId: orgId as string,
        email: `int-ppm-${label}-${suffix}@test.local`,
        password,
        role: 'student',
      })
    targetId = await make('target')
    otherId = await make('other')
    softDeletedId = await make('softdel')

    const marker = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    await setMarker(targetId, marker)
    await setMarker(otherId, marker)
    await setMarker(softDeletedId, marker)
    const { error } = await admin
      .from('users')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', softDeletedId)
    if (error) throw new Error(`soft-delete: ${error.message}`)
  })

  afterAll(async () => {
    if (orgId) {
      await cleanupTestData({ admin, orgId, userIds: [targetId, otherId, softDeletedId] })
    }
  })

  it('clears only the target user, leaving another marked user untouched', async () => {
    expect(await readMarker(targetId)).not.toBeNull()
    expect(await readMarker(otherId)).not.toBeNull()

    await clearPasswordPendingMarker(targetId)

    expect(await readMarker(targetId)).toBeNull()
    expect(await readMarker(otherId)).not.toBeNull()
  })

  it('is a no-op for a user whose marker is already null', async () => {
    expect(await readMarker(targetId)).toBeNull()

    await expect(clearPasswordPendingMarker(targetId)).resolves.toBeUndefined()

    expect(await readMarker(targetId)).toBeNull()
  })

  it('leaves a soft-deleted user untouched', async () => {
    expect(await readMarker(softDeletedId)).not.toBeNull()

    await clearPasswordPendingMarker(softDeletedId)

    expect(await readMarker(softDeletedId)).not.toBeNull()
  })
})
