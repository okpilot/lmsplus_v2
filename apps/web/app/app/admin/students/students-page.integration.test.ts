// Students list against real Postgres (#1776): search incl. PostgREST reserved chars,
// group filter vs badges, exact count, pagination ranges, org isolation, group options,
// and the add/remove Server Action rpc sites.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  cleanupTestData,
  createTestOrg,
  createTestUser,
  fixtureSuffix,
  getAdminClient,
  getAuthenticatedClient,
  signInAs,
} from '@/lib/integration-support/harness'
import { addGroupMembers } from './actions/add-group-members'
import { removeGroupMembers } from './actions/remove-group-members'
import { getGroupOptions, getStudentsPage, PAGE_SIZE } from './queries'

const admin = getAdminClient()
const suffix = fixtureSuffix()
const password = 'test-pass-123'
const adminEmail = `int-sp-admin-${suffix}@test.local`
const FILLERS = 26

let orgId: string
let otherOrgId: string
let adminId: string
let alice: string
let bob: string
let removedMember: string
let deactivated: string
let otherOrgStudent: string
let groupA: string
let groupB: string
let groupGone: string
const orgUsers: string[] = []
const otherUsers: string[] = []

async function mk(
  org: string,
  into: string[],
  tag: string,
  role: 'admin' | 'student',
  fullName?: string,
): Promise<string> {
  const id = await createTestUser({
    admin,
    orgId: org,
    email: `int-sp-${tag}-${suffix}@test.local`,
    password,
    role,
    fullName,
    courses: [],
  })
  into.push(id)
  return id
}

async function createGroup(
  client: Awaited<ReturnType<typeof getAuthenticatedClient>>,
  name: string,
) {
  const { data, error } = await client.rpc('create_student_group', { p_name: name })
  if (error) throw new Error(`create_student_group: ${error.message}`)
  return data as string
}

async function activeGroupIds(userId: string): Promise<string[]> {
  const { data, error } = await admin
    .from('student_group_members')
    .select('group_id')
    .eq('user_id', userId)
    .is('deleted_at', null)
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => r.group_id).sort()
}

describe('students page query + group actions (integration)', () => {
  beforeAll(async () => {
    orgId = await createTestOrg({ admin, name: `sp A ${suffix}`, slug: `sp-a-${suffix}` })
    otherOrgId = await createTestOrg({ admin, name: `sp B ${suffix}`, slug: `sp-b-${suffix}` })
    adminId = await createTestUser({
      admin,
      orgId,
      email: adminEmail,
      password,
      role: 'admin',
    })
    orgUsers.push(adminId)
    alice = await mk(orgId, orgUsers, 'alice', 'student', `Zed, Q (Jr) ${suffix}`)
    bob = await mk(orgId, orgUsers, 'bob', 'student', 'Bob Plain')
    removedMember = await mk(orgId, orgUsers, 'removed', 'student', 'Removed Member')
    deactivated = await mk(orgId, orgUsers, 'deact', 'student', 'Deact Student')
    for (let i = 0; i < FILLERS; i++) await mk(orgId, orgUsers, `f${i}`, 'student', `Filler ${i}`)
    otherOrgStudent = await mk(otherOrgId, otherUsers, 'other', 'student', 'Other Org Student')

    const client = await getAuthenticatedClient({ email: adminEmail, password })
    groupA = await createGroup(client, `Group A ${suffix}`)
    groupB = await createGroup(client, `Group B ${suffix}`)
    groupGone = await createGroup(client, `Group Gone ${suffix}`)
    for (const [g, ids] of [
      [groupA, [alice, bob, removedMember]],
      [groupB, [alice]],
    ] as const) {
      const { error } = await client.rpc('add_student_group_members', {
        p_group_id: g,
        p_user_ids: [...ids],
      })
      if (error) throw new Error(error.message)
    }
    const rm = await client.rpc('remove_student_group_members', {
      p_group_id: groupA,
      p_user_ids: [removedMember],
    })
    if (rm.error) throw new Error(rm.error.message)
    const del = await client.rpc('delete_student_group', { p_group_id: groupGone })
    if (del.error) throw new Error(del.error.message)
    await admin.from('users').update({ deleted_at: new Date().toISOString() }).eq('id', deactivated)
  })

  afterAll(async () => {
    const errors: string[] = []
    for (const [org, ids] of [
      [orgId, orgUsers],
      [otherOrgId, otherUsers],
    ] as const) {
      try {
        await admin.from('student_group_members').delete().eq('organization_id', org)
        await admin.from('student_groups').delete().eq('organization_id', org)
        await cleanupTestData({ admin, orgId: org, userIds: ids })
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e))
      }
    }
    if (errors.length > 0) throw new Error(`afterAll: ${errors.join('; ')}`)
  })

  it('finds a name containing a comma and parentheses through the quoted or() filter', async () => {
    await signInAs(adminEmail, password)
    for (const term of ['Zed, Q', 'Q (Jr)', 'Jr)', `Zed, Q (Jr) ${suffix}`]) {
      const { rows } = await getStudentsPage({ page: 1, search: term })
      expect(
        rows.map((r) => r.id),
        term,
      ).toEqual([alice])
    }
  })

  it('matches LIKE wildcards literally', async () => {
    await signInAs(adminEmail, password)
    expect((await getStudentsPage({ page: 1, search: '%' })).totalCount).toBe(0)
    expect((await getStudentsPage({ page: 1, search: 'Bob_Plain' })).totalCount).toBe(0)
  })

  it('does not break on quotes and backslashes in the search term', async () => {
    await signInAs(adminEmail, password)
    for (const term of ['"', 'a\\b', '"x",y']) {
      expect((await getStudentsPage({ page: 1, search: term })).totalCount, term).toBe(0)
    }
  })

  it('searches by email as well as name', async () => {
    await signInAs(adminEmail, password)
    const { rows } = await getStudentsPage({ page: 1, search: `int-sp-bob-${suffix}` })
    expect(rows.map((r) => r.id)).toEqual([bob])
  })

  it('group filter keeps every badge of a matching row and skips removed memberships', async () => {
    await signInAs(adminEmail, password)
    const { rows, totalCount } = await getStudentsPage({ page: 1, group: groupA })
    expect(totalCount).toBe(2)
    expect(rows.map((r) => r.id).sort()).toEqual([alice, bob].sort())
    expect(rows.find((r) => r.id === alice)?.group_ids.sort()).toEqual([groupA, groupB].sort())
    expect(rows.find((r) => r.id === bob)?.group_ids).toEqual([groupA])
    expect(rows.some((r) => r.id === removedMember)).toBe(false)
  })

  it('combines the group filter with search and status in one call', async () => {
    await signInAs(adminEmail, password)
    const hit = await getStudentsPage({
      page: 1,
      group: groupA,
      search: 'Zed, Q',
      status: 'active',
    })
    expect(hit.rows.map((r) => r.id)).toEqual([alice])
    expect(hit.totalCount).toBe(1)
    const miss = await getStudentsPage({ page: 1, group: groupB, search: 'Bob' })
    expect(miss.totalCount).toBe(0)
  })

  it('returns the exact total and pages 25 per page without overlap', async () => {
    await signInAs(adminEmail, password)
    const total = orgUsers.length
    const p1 = await getStudentsPage({ page: 1 })
    const p2 = await getStudentsPage({ page: 2 })
    expect(p1.totalCount).toBe(total)
    expect(p1.rows).toHaveLength(PAGE_SIZE)
    expect(p2.rows).toHaveLength(total - PAGE_SIZE)
    const ids = [...p1.rows, ...p2.rows].map((r) => r.id)
    expect(new Set(ids).size).toBe(total)
  })

  it('returns no rows and the exact total for a page past the end', async () => {
    await signInAs(adminEmail, password)
    const past = await getStudentsPage({ page: 99 })
    expect(past.rows).toEqual([])
    expect(past.totalCount).toBe(orgUsers.length)
  })

  it('never returns another organization student', async () => {
    await signInAs(adminEmail, password)
    const all = await getStudentsPage({ page: 2 })
    const first = await getStudentsPage({ page: 1 })
    expect([...first.rows, ...all.rows].some((r) => r.id === otherOrgStudent)).toBe(false)
    expect((await getStudentsPage({ page: 1, search: 'Other Org' })).totalCount).toBe(0)
  })

  it('getGroupOptions lists active groups of the org only', async () => {
    await signInAs(adminEmail, password)
    const options = await getGroupOptions()
    expect(options.map((o) => o.id).sort()).toEqual([groupA, groupB].sort())
  })

  it('addGroupMembers adds, is idempotent, and removeGroupMembers removes', async () => {
    await signInAs(adminEmail, password)
    const first = await addGroupMembers({ groupId: groupB, userIds: [bob] })
    expect(first).toEqual({ success: true, count: 1 })
    expect(await activeGroupIds(bob)).toEqual([groupA, groupB].sort())

    expect(await addGroupMembers({ groupId: groupB, userIds: [bob] })).toEqual({
      success: true,
      count: 0,
    })

    expect(await removeGroupMembers({ groupId: groupB, userIds: [bob] })).toEqual({
      success: true,
      count: 1,
    })
    expect(await removeGroupMembers({ groupId: groupB, userIds: [bob] })).toEqual({
      success: true,
      count: 0,
    })
    expect(await activeGroupIds(bob)).toEqual([groupA])
  })

  it('addGroupMembers maps an inactive student to the not-found message', async () => {
    await signInAs(adminEmail, password)
    expect(await addGroupMembers({ groupId: groupA, userIds: [deactivated] })).toEqual({
      success: false,
      error: 'Some selected students are inactive or not found',
    })
  })

  it('addGroupMembers maps another-org student and unknown group', async () => {
    await signInAs(adminEmail, password)
    expect(await addGroupMembers({ groupId: groupA, userIds: [otherOrgStudent] })).toMatchObject({
      success: false,
      error: 'Some selected students are inactive or not found',
    })
    expect(
      await addGroupMembers({
        groupId: '00000000-0000-4000-a000-0000000000ff',
        userIds: [bob],
      }),
    ).toEqual({ success: false, error: 'Group not found' })
  })
})
