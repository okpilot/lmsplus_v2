// App-layer integration tier (#925) — groups list, member counts and the group CRUD actions
// against real Postgres. Unit tests mock the client and cannot see the column grant on
// student_groups, the users join in the count, or the RPC error texts.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  cleanupTestData,
  createTestOrg,
  createTestUser,
  fixtureSuffix,
  getAdminClient,
  signInAs,
} from '@/lib/integration-support/harness'
import { createGroup } from './actions/create-group'
import { deleteGroup } from './actions/delete-group'
import { updateGroup } from './actions/update-group'
import { getGroupsWithCounts } from './queries'

const admin = getAdminClient()
const suffix = fixtureSuffix()
const password = 'test-pass-123'
const adminEmail = `int-grp-admin-${suffix}@test.local`
const otherAdminEmail = `int-grp-oadmin-${suffix}@test.local`

let orgId: string | undefined
let otherOrgId: string | undefined
const orgUserIds: string[] = []
const otherUserIds: string[] = []
let activeStudent: string
let deactivatedStudent: string
let removedStudent: string
let countedGroupId: string
let otherGroupId: string

async function seedMember(groupId: string, userId: string, removed = false) {
  const { error } = await admin.from('student_group_members').insert({
    organization_id: orgId as string,
    group_id: groupId,
    user_id: userId,
    ...(removed ? { deleted_at: new Date().toISOString() } : {}),
  })
  if (error) throw new Error(`seed member: ${error.message}`)
}

async function readGroup(name: string) {
  const { data, error } = await admin
    .from('student_groups')
    .select('id, description, deleted_at')
    .eq('organization_id', orgId as string)
    .eq('name', name)
    .single()
  if (error) throw new Error(`readGroup: ${error.message}`)
  return data
}

describe('student groups (app-layer integration)', () => {
  beforeAll(async () => {
    orgId = await createTestOrg({ admin, name: `grp ${suffix}`, slug: `grp-${suffix}` })
    otherOrgId = await createTestOrg({ admin, name: `grp o ${suffix}`, slug: `grp-o-${suffix}` })
    const mk = async (org: string, email: string, role: 'admin' | 'student', into: string[]) => {
      const id = await createTestUser({ admin, orgId: org, email, password, role })
      into.push(id)
      return id
    }
    await mk(orgId, adminEmail, 'admin', orgUserIds)
    activeStudent = await mk(orgId, `int-grp-s1-${suffix}@test.local`, 'student', orgUserIds)
    deactivatedStudent = await mk(orgId, `int-grp-s2-${suffix}@test.local`, 'student', orgUserIds)
    removedStudent = await mk(orgId, `int-grp-s3-${suffix}@test.local`, 'student', orgUserIds)
    await mk(otherOrgId, otherAdminEmail, 'admin', otherUserIds)

    await signInAs(otherAdminEmail, password)
    const otherCreated = await createGroup({ name: `Other ${suffix}` })
    if (!otherCreated.success) throw new Error(`seed other group: ${otherCreated.error}`)
    const { data: otherRow, error: otherErr } = await admin
      .from('student_groups')
      .select('id')
      .eq('organization_id', otherOrgId)
      .eq('name', `Other ${suffix}`)
      .single()
    if (otherErr) throw new Error(`seed other group read: ${otherErr.message}`)
    otherGroupId = otherRow.id

    await signInAs(adminEmail, password)
    const created = await createGroup({ name: `Counted ${suffix}`, description: 'desc' })
    if (!created.success) throw new Error(`seed group: ${created.error}`)
    countedGroupId = (await readGroup(`Counted ${suffix}`)).id
    await seedMember(countedGroupId, activeStudent)
    await seedMember(countedGroupId, deactivatedStudent)
    await seedMember(countedGroupId, removedStudent, true)
    const { error } = await admin
      .from('users')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', deactivatedStudent)
    if (error) throw new Error(`deactivate: ${error.message}`)
  })

  afterAll(async () => {
    const failures: string[] = []
    for (const [org, userIds] of [
      [orgId, orgUserIds],
      [otherOrgId, otherUserIds],
    ] as const) {
      if (!org) continue
      try {
        // Group and membership rows cascade from the org delete.
        await cleanupTestData({ admin, orgId: org, userIds: [...userIds] })
      } catch (e) {
        failures.push(`${org}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    if (failures.length > 0) throw new Error(`cleanup failed: ${failures.join('; ')}`)
  })

  it('counts only active students with an active membership', async () => {
    await signInAs(adminEmail, password)
    const groups = await getGroupsWithCounts()
    const g = groups.find((x) => x.id === countedGroupId)
    expect(g).toMatchObject({ name: `Counted ${suffix}`, description: 'desc', member_count: 1 })
  })

  it('lists only the caller organisation, ordered by name, excluding deleted groups', async () => {
    await signInAs(otherAdminEmail, password)
    expect((await getGroupsWithCounts()).map((g) => g.name)).toEqual([`Other ${suffix}`])

    await signInAs(adminEmail, password)
    // Created in reverse name order so insertion order differs from name order.
    expect(await createGroup({ name: `Zeta ${suffix}` })).toEqual({ success: true })
    expect(await createGroup({ name: `Alpha ${suffix}` })).toEqual({ success: true })
    const mine = (await getGroupsWithCounts()).map((g) => g.name)
    expect(mine).not.toContain(`Other ${suffix}`)
    expect(mine).toEqual([`Alpha ${suffix}`, `Counted ${suffix}`, `Zeta ${suffix}`])
  })

  it('create rejects a duplicate name with a friendly error', async () => {
    await signInAs(adminEmail, password)
    expect(await createGroup({ name: `Counted ${suffix}` })).toEqual({
      success: false,
      error: 'A group with this name already exists',
    })
  })

  it("update: '' clears the description, omitted keeps it", async () => {
    await signInAs(adminEmail, password)
    const name = `Edit ${suffix}`
    expect(await createGroup({ name, description: 'keep me' })).toEqual({ success: true })
    const { id } = await readGroup(name)

    expect(await updateGroup({ groupId: id, name })).toEqual({ success: true })
    expect((await readGroup(name)).description).toBe('keep me')

    expect(await updateGroup({ groupId: id, name, description: '' })).toEqual({ success: true })
    expect((await readGroup(name)).description).toBeNull()
  })

  it('update rejects a name that another group already uses', async () => {
    await signInAs(adminEmail, password)
    const name = `Clash ${suffix}`
    expect(await createGroup({ name })).toEqual({ success: true })
    const { id } = await readGroup(name)
    expect(await updateGroup({ groupId: id, name: `Counted ${suffix}` })).toEqual({
      success: false,
      error: 'A group with this name already exists',
    })
  })

  it('update and delete report group_not_found for a group of another organisation', async () => {
    await signInAs(adminEmail, password)
    expect(await updateGroup({ groupId: otherGroupId, name: 'x' })).toEqual({
      success: false,
      error: 'Group not found',
    })
    expect(await deleteGroup({ groupId: otherGroupId })).toEqual({
      success: false,
      error: 'Group not found',
    })
  })

  it('delete soft-deletes the group and drops it from the list', async () => {
    await signInAs(adminEmail, password)
    const name = `Doomed ${suffix}`
    expect(await createGroup({ name })).toEqual({ success: true })
    const { id } = await readGroup(name)

    expect(await deleteGroup({ groupId: id })).toEqual({ success: true })
    expect((await readGroup(name)).deleted_at).not.toBeNull()
    expect((await getGroupsWithCounts()).map((g) => g.id)).not.toContain(id)
  })
})
