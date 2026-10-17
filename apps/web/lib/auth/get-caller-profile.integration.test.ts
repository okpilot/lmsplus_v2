// App-layer integration tier — getCallerProfile against real Postgres under real RLS.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  cleanupTestData,
  createTestOrg,
  createTestUser,
  fixtureSuffix,
  getAdminClient,
  signInAs,
} from '@/lib/integration-support/harness'
import { getCallerProfile } from './get-caller-profile'

// Flag on: the helper runs on the service-role client, so RLS no longer hides a soft-deleted row
// and only the helper's own `deleted_at` filter can reject it.
const bypass = vi.hoisted(() => ({ on: false }))

vi.mock('@repo/db/server', async (importOriginal) => {
  const original = await importOriginal<typeof import('@repo/db/server')>()
  return {
    ...original,
    // Harness is imported at call time: importing it inside the factory deadlocks the module graph.
    createServerSupabaseClient: async (
      ...args: Parameters<typeof original.createServerSupabaseClient>
    ) => {
      if (!bypass.on) return original.createServerSupabaseClient(...args)
      const { getAdminClient: adminClient } = await import('@/lib/integration-support/harness')
      return adminClient() as unknown as Awaited<
        ReturnType<typeof original.createServerSupabaseClient>
      >
    },
  }
})

const admin = getAdminClient()
const suffix = fixtureSuffix()
const password = 'test-pass-123'
const liveEmail = `int-gcp-live-${suffix}@test.local`
const deletedEmail = `int-gcp-deleted-${suffix}@test.local`

// Sentinels: vitest runs afterAll after a failed beforeAll.
let orgId = ''
let liveId = ''
let deletedId = ''

describe('getCallerProfile (app-layer integration)', () => {
  beforeAll(async () => {
    orgId = await createTestOrg({ admin, name: `int-gcp ${suffix}`, slug: `int-gcp-${suffix}` })
    liveId = await createTestUser({
      admin,
      orgId,
      email: liveEmail,
      password,
      role: 'instructor',
      fullName: 'Live Caller',
    })
    deletedId = await createTestUser({
      admin,
      orgId,
      email: deletedEmail,
      password,
      role: 'student',
    })
  })

  afterAll(async () => {
    const errors: string[] = []
    if (orgId) {
      try {
        await cleanupTestData({
          admin,
          orgId,
          userIds: [liveId, deletedId].filter((id) => id.length > 0),
        })
      } catch (e) {
        errors.push(`cleanupTestData: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    if (errors.length > 0) throw new Error(`afterAll: ${errors.join('; ')}`)
  })

  it('returns the signed-in user their own profile row', async () => {
    await signInAs(liveEmail, password)

    const { data, error } = await getCallerProfile(liveId)

    expect(error).toBeNull()
    expect(data).toEqual({
      full_name: 'Live Caller',
      email: liveEmail,
      role: 'instructor',
      organization_id: orgId,
      created_at: expect.any(String),
    })
  })

  it('returns no profile and no error for a user soft-deleted after sign-in', async () => {
    await signInAs(deletedEmail, password)
    const { data: updated, error: updateError } = await admin
      .from('users')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', deletedId)
      .select('id, deleted_at')
    if (updateError) throw new Error(`soft-delete user: ${updateError.message}`)
    // Non-vacuous: the row exists and is soft-deleted.
    expect(updated).toHaveLength(1)
    expect(updated?.[0]?.deleted_at).not.toBeNull()

    const { data, error } = await getCallerProfile(deletedId)

    expect(error).toBeNull()
    expect(data).toBeNull()

    bypass.on = true
    try {
      const live = await getCallerProfile(liveId)
      const deleted = await getCallerProfile(deletedId)
      // Non-vacuous: the bypass client reads live rows, so null below is the helper's filter.
      expect(live.data?.email).toBe(liveEmail)
      expect(deleted).toEqual({ data: null, error: null })
    } finally {
      bypass.on = false
    }
  })
})
