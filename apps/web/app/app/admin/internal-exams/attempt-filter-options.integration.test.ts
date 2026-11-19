// App-layer integration tier (#925) — getAttemptFilterOptions through real RLS (I-AFO).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  cleanupTestData,
  createTestOrg,
  createTestUser,
  fixtureSuffix,
  getAdminClient,
  signInAs,
} from '@/lib/integration-support/harness'
import { getAttemptFilterOptions } from './attempt-filter-options'

const admin = getAdminClient()
const suffix = fixtureSuffix()
const password = 'test-pass-123'
const adminEmail = `int-afo-admin-${suffix}@test.local`

let orgId: string
let otherOrgId: string
let adminId: string
let instructorId: string
let otherAdminId: string
let olderSittingId: string
let newerSittingId: string
let cancelledSittingId: string
let otherOrgSittingId: string
let groupId: string
let otherOrgGroupId: string

async function must<T>(
  p: PromiseLike<{ data: T; error: { message: string } | null }>,
  what: string,
) {
  const r = await p
  if (r.error) throw new Error(`${what}: ${r.error.message}`)
  if (r.data == null) throw new Error(`${what}: no row`)
  return r.data
}

async function mkSitting(org: string, by: string, daysAhead: number, deleted = false) {
  const row = await must(
    admin
      .from('exam_sittings')
      .insert({
        organization_id: org,
        mode: 'remote',
        invigilator_id: instructorId,
        created_by: by,
        scheduled_at: new Date(Date.now() + daysAhead * 86_400_000).toISOString(),
        ...(deleted ? { deleted_at: new Date().toISOString(), deleted_by: by } : {}),
      })
      .select('id')
      .single(),
    'sitting',
  )
  return row.id as string
}

async function mkGroup(org: string, name: string) {
  const row = await must(
    admin.from('student_groups').insert({ organization_id: org, name }).select('id').single(),
    'group',
  )
  return row.id as string
}

describe('getAttemptFilterOptions (app-layer integration)', () => {
  beforeAll(async () => {
    orgId = await createTestOrg({ admin, name: `int-afo ${suffix}`, slug: `int-afo-${suffix}` })
    otherOrgId = await createTestOrg({
      admin,
      name: `int-afo-b ${suffix}`,
      slug: `int-afo-b-${suffix}`,
    })
    adminId = await createTestUser({ admin, orgId, email: adminEmail, password, role: 'admin' })
    instructorId = await createTestUser({
      admin,
      orgId,
      email: `int-afo-ins-${suffix}@test.local`,
      password,
      role: 'instructor',
    })
    otherAdminId = await createTestUser({
      admin,
      orgId: otherOrgId,
      email: `int-afo-oadmin-${suffix}@test.local`,
      password,
      role: 'admin',
    })
    olderSittingId = await mkSitting(orgId, adminId, 2)
    newerSittingId = await mkSitting(orgId, adminId, 5)
    cancelledSittingId = await mkSitting(orgId, adminId, 3, true)
    otherOrgSittingId = await mkSitting(otherOrgId, otherAdminId, 4)
    groupId = await mkGroup(orgId, `AFO group ${suffix}`)
    otherOrgGroupId = await mkGroup(otherOrgId, `AFO other ${suffix}`)
  }, 180_000)

  afterAll(async () => {
    try {
      await cleanupTestData({ admin, orgId, userIds: [adminId, instructorId] })
      await cleanupTestData({ admin, orgId: otherOrgId, userIds: [otherAdminId] })
    } catch (e) {
      throw new Error(`afterAll: ${e instanceof Error ? e.message : String(e)}`)
    }
  }, 120_000)

  it('lists subjects in sort_order, matching the global easa_subjects table', async () => {
    await signInAs(adminEmail, password)
    const expected = await must(
      admin.from('easa_subjects').select('id, name').is('deleted_at', null).order('sort_order'),
      'subjects',
    )
    const r = await getAttemptFilterOptions()
    expect(r.subjects.length).toBeGreaterThan(0)
    expect(r.subjects).toEqual(expected.map((s) => ({ id: s.id, name: s.name })))
  })

  it('lists only this organization sittings, newest first', async () => {
    await signInAs(adminEmail, password)
    const r = await getAttemptFilterOptions()
    const got = r.sittings.map((s) => s.id)
    expect(got).not.toContain(otherOrgSittingId)
    expect(got).toContain(olderSittingId)
    expect(got).toEqual([newerSittingId, cancelledSittingId, olderSittingId])
  })

  it('labels a cancelled sitting with " · Cancelled" and leaves live ones unlabelled', async () => {
    await signInAs(adminEmail, password)
    const r = await getAttemptFilterOptions()
    const label = (id: string) => r.sittings.find((s) => s.id === id)?.label ?? ''
    expect(label(cancelledSittingId)).toMatch(/ · Cancelled$/)
    expect(label(olderSittingId)).not.toContain('Cancelled')
  })

  it('lists only this organization groups', async () => {
    await signInAs(adminEmail, password)
    const r = await getAttemptFilterOptions()
    const got = r.groups.map((g) => g.id)
    expect(got).toContain(groupId)
    expect(got).not.toContain(otherOrgGroupId)
  })
})
