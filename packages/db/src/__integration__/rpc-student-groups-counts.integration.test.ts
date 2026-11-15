import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupTestData } from './cleanup'
import { fixtureSuffix } from './fixture-suffix'
import {
  createTestOrg,
  createTestUser,
  getAdminClient,
  getAnonClient,
  getAuthenticatedClient,
} from './setup'

/** get_student_groups_with_counts: #1776 PR 1c. */
describe('RPC: get_student_groups_with_counts', () => {
  const admin = getAdminClient()
  const suffix = fixtureSuffix()
  const pw = 'test-pass-123'

  let orgId: string
  let otherOrgId: string
  let adminClient: SupabaseClient
  let otherAdminClient: SupabaseClient
  let studentClient: SupabaseClient
  let instructorClient: SupabaseClient
  let deactivatedAdminClient: SupabaseClient
  let deactivatedAdminId: string
  let activeA: string
  let activeB: string
  let deactStudent: string
  let removedStudent: string
  let promoted: string
  let promotedDeact: string
  const userIds: string[] = []
  const otherUserIds: string[] = []

  const list = (c: SupabaseClient = adminClient) => c.rpc('get_student_groups_with_counts')
  const login = (tag: string) =>
    getAuthenticatedClient({ email: `${tag}-${suffix}@test.local`, password: pw })

  async function mk(
    o: string,
    tag: string,
    role: 'admin' | 'instructor' | 'student',
    into: string[],
  ) {
    const id = await createTestUser({
      admin,
      orgId: o,
      email: `${tag}-${suffix}@test.local`,
      password: pw,
      role,
      courses: [],
    })
    into.push(id)
    return id
  }

  async function newGroup(name: string, description: string | null = null, c = adminClient) {
    const { data, error } = await c.rpc('create_student_group', {
      p_name: name,
      p_description: description,
    })
    if (error) throw new Error(`create_student_group: ${error.message}`)
    return data as string
  }

  async function addMembers(g: string, ids: string[]) {
    const { error } = await adminClient.rpc('add_student_group_members', {
      p_group_id: g,
      p_user_ids: ids,
    })
    if (error) throw new Error(`add_student_group_members: ${error.message}`)
  }

  async function updateUser(id: string, patch: Record<string, unknown>) {
    const { data, error } = await admin.from('users').update(patch).eq('id', id).select('id')
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  }

  beforeAll(async () => {
    orgId = await createTestOrg({ admin, name: `SGC ${suffix}`, slug: `sgc-${suffix}` })
    otherOrgId = await createTestOrg({ admin, name: `SGC O ${suffix}`, slug: `sgc-o-${suffix}` })
    await mk(orgId, 'sgc-admin', 'admin', userIds)
    deactivatedAdminId = await mk(orgId, 'sgc-dadmin', 'admin', userIds)
    await mk(orgId, 'sgc-s0', 'student', userIds)
    await mk(orgId, 'sgc-instr', 'instructor', userIds)
    activeA = await mk(orgId, 'sgc-a', 'student', userIds)
    activeB = await mk(orgId, 'sgc-b', 'student', userIds)
    deactStudent = await mk(orgId, 'sgc-deact', 'student', userIds)
    removedStudent = await mk(orgId, 'sgc-removed', 'student', userIds)
    promoted = await mk(orgId, 'sgc-promo', 'student', userIds)
    promotedDeact = await mk(orgId, 'sgc-promo-d', 'student', userIds)
    await mk(otherOrgId, 'sgc-oadmin', 'admin', otherUserIds)
    adminClient = await login('sgc-admin')
    studentClient = await login('sgc-s0')
    instructorClient = await login('sgc-instr')
    otherAdminClient = await login('sgc-oadmin')
    deactivatedAdminClient = await login('sgc-dadmin')
  })

  afterAll(async () => {
    for (const o of [orgId, otherOrgId]) {
      await admin.from('student_group_members').delete().eq('organization_id', o)
      await admin.from('student_groups').delete().eq('organization_id', o)
    }
    await cleanupTestData({ admin, orgId, userIds })
    await cleanupTestData({ admin, orgId: otherOrgId, userIds: otherUserIds })
  })

  it('AC1: anon is refused with permission denied for function', async () => {
    const { data, error } = await list(getAnonClient())
    expect(data).toBeNull()
    expect(error?.code).toBe('42501')
    expect(error?.message).toContain('permission denied for function')
  })

  it('AC2: student and instructor callers get not_admin', async () => {
    expect((await list(studentClient)).error?.message).toContain('not_admin')
    expect((await list(instructorClient)).error?.message).toContain('not_admin')
  })

  it('AC3: a deactivated admin gets not_admin', async () => {
    await updateUser(deactivatedAdminId, { deleted_at: new Date().toISOString() })
    const { error } = await list(deactivatedAdminClient)
    expect(error?.message).toContain('not_admin')
  })

  it('AC4: admin sees only own-org active groups, not deleted or cross-org ones', async () => {
    const own = await newGroup(`own-${suffix}`)
    const deleted = await newGroup(`deleted-${suffix}`)
    const foreign = await newGroup(`foreign-${suffix}`, null, otherAdminClient)
    const { error: delErr } = await adminClient.rpc('delete_student_group', { p_group_id: deleted })
    expect(delErr).toBeNull()

    const { data, error } = await list()
    expect(error).toBeNull()
    const ids = ((data ?? []) as { id: string }[]).map((r) => r.id)
    expect(ids.length).toBeGreaterThan(0)
    expect(ids).toContain(own)
    expect(ids).not.toContain(deleted)
    expect(ids).not.toContain(foreign)
    const other = ((await list(otherAdminClient)).data ?? []) as { id: string }[]
    expect(other.map((r) => r.id)).toContain(foreign)
    expect(other.map((r) => r.id)).not.toContain(own)
  })

  it('AC5: counts active and deactivated students, ignoring removed and non-student members', async () => {
    const g = await newGroup(`counts-${suffix}`)
    await addMembers(g, [activeA, activeB, deactStudent, removedStudent, promoted, promotedDeact])
    await adminClient.rpc('remove_student_group_members', {
      p_group_id: g,
      p_user_ids: [removedStudent],
    })
    await updateUser(deactStudent, { deleted_at: new Date().toISOString() })
    await updateUser(promoted, { role: 'instructor' })
    await updateUser(promotedDeact, { role: 'instructor', deleted_at: new Date().toISOString() })

    const { data, error } = await list()
    expect(error).toBeNull()
    const row = ((data ?? []) as Record<string, unknown>[]).find((r) => r.id === g)
    expect(row).toBeDefined()
    expect(row?.active_count).toBe(2)
    expect(row?.deactivated_count).toBe(1)
  })

  it('AC6: an empty group has zero counts and rows are ordered by name', async () => {
    await newGroup(`c-${suffix}`)
    await newGroup(`a-${suffix}`)
    await newGroup(`b-${suffix}`)
    const { data, error } = await list()
    expect(error).toBeNull()
    const rows = (data ?? []) as { name: string; active_count: number; deactivated_count: number }[]
    expect(rows.length).toBeGreaterThan(0)
    const mine = rows.filter((r) => /^[abc]-/.test(r.name))
    expect(mine.map((r) => r.name)).toEqual([`a-${suffix}`, `b-${suffix}`, `c-${suffix}`])
    expect(mine.every((r) => r.active_count === 0 && r.deactivated_count === 0)).toBe(true)
    const names = rows.map((r) => r.name)
    expect(names).toEqual([...names].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0)))
  })

  it('AC7: description is returned to the admin', async () => {
    const g = await newGroup(`desc-${suffix}`, `about ${suffix}`)
    const { data, error } = await list()
    expect(error).toBeNull()
    const row = ((data ?? []) as { id: string; description: string | null }[]).find(
      (r) => r.id === g,
    )
    expect(row?.description).toBe(`about ${suffix}`)
  })
})
