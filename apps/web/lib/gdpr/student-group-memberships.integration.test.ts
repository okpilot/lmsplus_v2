// App-layer integration tier (#925) — GDPR export of student group memberships against real
// Postgres. The self-export runs under RLS (own active rows; the group name is readable only
// while the group is live), the admin export under the service role (history incl. deleted groups).
import { createServerSupabaseClient } from '@repo/db/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  cleanupTestData,
  createTestOrg,
  createTestUser,
  fixtureSuffix,
  getAdminClient,
  signInAs,
} from '@/lib/integration-support/harness'
import { collectUserData } from './collect-user-data'

const admin = getAdminClient()
const suffix = fixtureSuffix()
const password = 'test-pass-123'
const studentEmail = `int-gdpr-grp-s-${suffix}@test.local`

let orgId: string | undefined
let adminId: string
let studentId: string
let liveGroup: string
let removedGroup: string
let deletedGroup: string

async function seedGroup(name: string, deleted = false) {
  const { data, error } = await admin
    .from('student_groups')
    .insert({
      organization_id: orgId as string,
      name,
      ...(deleted ? { deleted_at: new Date().toISOString() } : {}),
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`seed group: ${error?.message}`)
  return data.id
}

async function seedMember(groupId: string, removed = false) {
  const { error } = await admin.from('student_group_members').insert({
    organization_id: orgId as string,
    group_id: groupId,
    user_id: studentId,
    added_by: adminId,
    ...(removed ? { deleted_at: new Date().toISOString(), deleted_by: adminId } : {}),
  })
  if (error) throw new Error(`seed member: ${error.message}`)
}

describe('collectUserData student group memberships (app-layer integration)', () => {
  beforeAll(async () => {
    orgId = await createTestOrg({ admin, name: `gdpr grp ${suffix}`, slug: `gdpr-grp-${suffix}` })
    adminId = await createTestUser({
      admin,
      orgId,
      email: `adm-${studentEmail}`,
      password,
      role: 'admin',
    })
    studentId = await createTestUser({
      admin,
      orgId,
      email: studentEmail,
      password,
      role: 'student',
    })
    liveGroup = await seedGroup(`Live ${suffix}`)
    removedGroup = await seedGroup(`Removed ${suffix}`)
    deletedGroup = await seedGroup(`Deleted ${suffix}`, true)
    await seedMember(liveGroup)
    await seedMember(removedGroup, true)
    await seedMember(deletedGroup)
  })

  afterAll(async () => {
    if (!orgId) return
    await admin.from('student_group_members').delete().eq('organization_id', orgId)
    await admin.from('student_groups').delete().eq('organization_id', orgId)
    await cleanupTestData({ admin, orgId, userIds: [adminId, studentId] })
  })

  it('admin export returns removed memberships and the name of a deleted group', async () => {
    const payload = await collectUserData(admin, studentId)

    expect(payload.warnings).toEqual([])
    const byGroup = new Map(payload.student_group_memberships.map((m) => [m.group_id, m]))
    expect([...byGroup.keys()].sort()).toEqual([liveGroup, removedGroup, deletedGroup].sort())
    expect(byGroup.get(deletedGroup)?.group_name).toBe(`Deleted ${suffix}`)
    expect(byGroup.get(removedGroup)).toMatchObject({
      group_name: `Removed ${suffix}`,
      deleted_by: adminId,
    })
    expect(byGroup.get(removedGroup)?.deleted_at).not.toBeNull()
    expect(byGroup.get(liveGroup)).toMatchObject({
      group_name: `Live ${suffix}`,
      added_by: adminId,
      deleted_at: null,
    })
  })

  it('self export (user client) returns active memberships only, null-safe for a deleted group', async () => {
    await signInAs(studentEmail, password)
    const payload = await collectUserData(await createServerSupabaseClient(), studentId)

    expect(payload.warnings).toEqual([])
    const byGroup = new Map(payload.student_group_memberships.map((m) => [m.group_id, m]))
    expect([...byGroup.keys()].sort()).toEqual([liveGroup, deletedGroup].sort())
    expect(byGroup.get(liveGroup)?.group_name).toBe(`Live ${suffix}`)
    expect(byGroup.get(deletedGroup)?.group_name).toBeNull()
  })
})
