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

/** add/remove_student_group_members: #1776 PR 1a (AC4). */
describe('RPC: student group members', () => {
  const admin = getAdminClient()
  const suffix = fixtureSuffix()
  const pw = 'test-pass-123'
  const bad = '00000000-0000-4000-a000-0000000000ff'

  let orgId: string
  let otherOrgId: string
  let adminId: string
  let s1: string
  let s2: string
  let s3: string
  let instructorId: string
  let deactivatedStudent: string
  let otherOrgStudent: string
  let adminClient: SupabaseClient
  let studentClient: SupabaseClient
  let instructorClient: SupabaseClient
  let otherAdminClient: SupabaseClient
  const userIds: string[] = []
  const otherUserIds: string[] = []

  beforeAll(async () => {
    orgId = await createTestOrg({ admin, name: `SGM ${suffix}`, slug: `sgm-${suffix}` })
    otherOrgId = await createTestOrg({ admin, name: `SGM O ${suffix}`, slug: `sgm-o-${suffix}` })
    const mk = async (
      o: string,
      tag: string,
      role: 'admin' | 'instructor' | 'student',
      into: string[],
    ) => {
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
    const client = (tag: string) =>
      getAuthenticatedClient({ email: `${tag}-${suffix}@test.local`, password: pw })
    adminId = await mk(orgId, 'sgm-admin', 'admin', userIds)
    s1 = await mk(orgId, 'sgm-s1', 'student', userIds)
    s2 = await mk(orgId, 'sgm-s2', 'student', userIds)
    s3 = await mk(orgId, 'sgm-s3', 'student', userIds)
    instructorId = await mk(orgId, 'sgm-instr', 'instructor', userIds)
    deactivatedStudent = await mk(orgId, 'sgm-deact', 'student', userIds)
    await mk(otherOrgId, 'sgm-oadmin', 'admin', otherUserIds)
    otherOrgStudent = await mk(otherOrgId, 'sgm-os', 'student', otherUserIds)
    adminClient = await client('sgm-admin')
    studentClient = await client('sgm-s1')
    instructorClient = await client('sgm-instr')
    otherAdminClient = await client('sgm-oadmin')
  })

  afterAll(async () => {
    for (const o of [orgId, otherOrgId]) {
      await admin.from('student_group_members').delete().eq('organization_id', o)
      await admin.from('student_groups').delete().eq('organization_id', o)
    }
    await cleanupTestData({ admin, orgId, userIds })
    await cleanupTestData({ admin, orgId: otherOrgId, userIds: otherUserIds })
  })

  let n = 0
  async function newGroup(): Promise<string> {
    const { data, error } = await adminClient.rpc('create_student_group', {
      p_name: `g${++n}-${suffix}`,
      p_description: null,
    })
    if (error) throw new Error(`create_student_group: ${error.message}`)
    return data as string
  }
  const add = (g: unknown, ids: unknown, c = adminClient) =>
    c.rpc('add_student_group_members', { p_group_id: g, p_user_ids: ids })
  const remove = (g: unknown, ids: unknown, c = adminClient) =>
    c.rpc('remove_student_group_members', { p_group_id: g, p_user_ids: ids })
  async function members(g: string, activeOnly = true) {
    let q = admin.from('student_group_members').select('*').eq('group_id', g)
    if (activeOnly) q = q.is('deleted_at', null)
    const { data } = await q
    return data ?? []
  }
  async function audits(type: string, g: string) {
    const { data } = await admin
      .from('audit_events')
      .select('actor_id, actor_role, organization_id, resource_type, resource_id, metadata')
      .eq('event_type', type)
      .eq('resource_id', g)
    return data ?? []
  }

  describe('add_student_group_members', () => {
    it('AC4: adds students, returns the count, sets added_by and writes members_added audit', async () => {
      const g = await newGroup()
      const { data, error } = await add(g, [s1, s2])
      expect(error).toBeNull()
      expect(data).toBe(2)
      const rows = await members(g)
      expect(rows.map((r) => r.user_id).sort()).toEqual([s1, s2].sort())
      expect(rows.every((r) => r.added_by === adminId && r.organization_id === orgId)).toBe(true)
      const a = await audits('student_group.members_added', g)
      expect(a).toHaveLength(1)
      expect(a[0]).toMatchObject({
        actor_id: adminId,
        actor_role: 'admin',
        organization_id: orgId,
        resource_type: 'student_group',
      })
      expect(
        [...((a[0]?.metadata as { user_ids: string[] } | undefined)?.user_ids ?? [])].sort(),
      ).toEqual([s1, s2].sort())
    })
    it('AC4: is idempotent; already-active members are skipped, no audit when 0 added', async () => {
      const g = await newGroup()
      await add(g, [s1])
      const { data, error } = await add(g, [s1, s2])
      expect(error).toBeNull()
      expect(data).toBe(1)
      const again = await add(g, [s1, s2])
      expect(again.data).toBe(0)
      expect(await members(g)).toHaveLength(2)
      expect(await audits('student_group.members_added', g)).toHaveLength(2)
    })
    it('AC4: re-adds a previously removed member as a new active row, history kept', async () => {
      const g = await newGroup()
      await add(g, [s3])
      await remove(g, [s3])
      const { data } = await add(g, [s3])
      expect(data).toBe(1)
      expect(await members(g)).toHaveLength(1)
      expect(await members(g, false)).toHaveLength(2)
    })
    it('AC4: invalid_input for empty, >500, duplicate ids or null', async () => {
      const g = await newGroup()
      const many = Array.from(
        { length: 501 },
        (_, i) => `00000000-0000-4000-a000-${String(i).padStart(12, '0')}`,
      )
      for (const ids of [[], many, [s1, s1], null]) {
        const { error } = await add(g, ids)
        expect(error?.message, JSON.stringify(ids)?.slice(0, 30)).toContain('invalid_input')
      }
    })
    it('AC4: student_not_found, all-or-nothing, for unknown, other-org, instructor, admin and deactivated ids', async () => {
      const g = await newGroup()
      await admin
        .from('users')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', deactivatedStudent)
      for (const bad1 of [bad, otherOrgStudent, instructorId, adminId, deactivatedStudent]) {
        const { error } = await add(g, [s1, bad1])
        expect(error?.message, bad1).toContain('student_not_found')
      }
      expect(await members(g, false)).toHaveLength(0)
    })
    it('AC4: group_not_found for unknown, other-org and deleted group', async () => {
      const g = await newGroup()
      expect((await add(bad, [s1])).error?.message).toContain('group_not_found')
      expect((await add(g, [s1], otherAdminClient)).error?.message).toContain('group_not_found')
      await adminClient.rpc('delete_student_group', { p_group_id: g })
      expect((await add(g, [s1])).error?.message).toContain('group_not_found')
    })
    it('AC4: not_admin for student and instructor; anon refused; nothing written', async () => {
      const g = await newGroup()
      expect((await add(g, [s1], studentClient)).error?.message).toContain('not_admin')
      expect((await add(g, [s1], instructorClient)).error?.message).toContain('not_admin')
      expect((await add(g, [s1], getAnonClient())).error).not.toBeNull()
      expect(await members(g, false)).toHaveLength(0)
    })
  })

  describe('remove_student_group_members', () => {
    it('AC4: soft-deletes active memberships with deleted_by, returns the count, audits members_removed', async () => {
      const g = await newGroup()
      await add(g, [s1, s2])
      const { data, error } = await remove(g, [s1, s3])
      expect(error).toBeNull()
      expect(data).toBe(1)
      expect((await members(g)).map((r) => r.user_id)).toEqual([s2])
      const all = await members(g, false)
      const gone = all.find((r) => r.user_id === s1)
      expect(gone?.deleted_at).not.toBeNull()
      expect(gone?.deleted_by).toBe(adminId)
      const a = await audits('student_group.members_removed', g)
      expect(a).toHaveLength(1)
      expect(a[0]).toMatchObject({ actor_id: adminId, organization_id: orgId })
    })
    it('AC4: no audit row when nothing was removed', async () => {
      const g = await newGroup()
      const { data, error } = await remove(g, [s1])
      expect(error).toBeNull()
      expect(data).toBe(0)
      expect(await audits('student_group.members_removed', g)).toHaveLength(0)
    })
    it('AC4: removes a deactivated user so history can be cleaned', async () => {
      const g = await newGroup()
      await admin.from('users').update({ deleted_at: null }).eq('id', deactivatedStudent)
      await add(g, [deactivatedStudent])
      await admin
        .from('users')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', deactivatedStudent)
      const { data, error } = await remove(g, [deactivatedStudent])
      expect(error).toBeNull()
      expect(data).toBe(1)
    })
    it('AC4: invalid_input for empty, >500, duplicate ids', async () => {
      const g = await newGroup()
      const many = Array.from(
        { length: 501 },
        (_, i) => `00000000-0000-4000-a000-${String(i).padStart(12, '0')}`,
      )
      for (const ids of [[], many, [s1, s1]]) {
        expect((await remove(g, ids)).error?.message).toContain('invalid_input')
      }
    })
    it('AC4: group_not_found for unknown, other-org and deleted group', async () => {
      const g = await newGroup()
      expect((await remove(bad, [s1])).error?.message).toContain('group_not_found')
      expect((await remove(g, [s1], otherAdminClient)).error?.message).toContain('group_not_found')
      await adminClient.rpc('delete_student_group', { p_group_id: g })
      expect((await remove(g, [s1])).error?.message).toContain('group_not_found')
    })
    it('AC4: not_admin for student and instructor; anon refused; membership untouched', async () => {
      const g = await newGroup()
      await add(g, [s1])
      expect((await remove(g, [s1], studentClient)).error?.message).toContain('not_admin')
      expect((await remove(g, [s1], instructorClient)).error?.message).toContain('not_admin')
      expect((await remove(g, [s1], getAnonClient())).error).not.toBeNull()
      expect(await members(g)).toHaveLength(1)
    })
  })
})
