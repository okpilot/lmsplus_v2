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

/** set_user_enrolments(p_user_id, p_course_ids): courses PR1 (AC3, AC4, AC5, AC8). */
describe('RPC: set_user_enrolments', () => {
  const admin = getAdminClient()
  const suffix = fixtureSuffix()
  const pw = 'test-pass-123'

  let orgId: string
  let otherOrgId: string
  let adminId: string
  let studentId: string
  let student2Id: string
  let otherOrgStudentId: string
  let instructorId: string
  let admin2Id: string
  let roleChangeId: string
  let deletedUserId: string
  let adminClient: SupabaseClient
  let studentClient: SupabaseClient
  let ppl: string
  let vfr: string
  let atpl: string
  const userIds: string[] = []
  const otherUserIds: string[] = []

  beforeAll(async () => {
    orgId = await createTestOrg({ admin, name: `Enrol ${suffix}`, slug: `enrol-${suffix}` })
    otherOrgId = await createTestOrg({
      admin,
      name: `Enrol Other ${suffix}`,
      slug: `enrol-other-${suffix}`,
    })
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
      })
      into.push(id)
      return id
    }
    adminId = await mk(orgId, 'enrol-admin', 'admin', userIds)
    studentId = await mk(orgId, 'enrol-s1', 'student', userIds)
    student2Id = await mk(orgId, 'enrol-s2', 'student', userIds)
    instructorId = await mk(orgId, 'enrol-i1', 'instructor', userIds)
    admin2Id = await mk(orgId, 'enrol-admin2', 'admin', userIds)
    roleChangeId = await mk(orgId, 'enrol-rc', 'student', userIds)
    deletedUserId = await mk(orgId, 'enrol-del', 'instructor', userIds)
    otherOrgStudentId = await mk(otherOrgId, 'enrol-os', 'student', otherUserIds)
    adminClient = await getAuthenticatedClient({
      email: `enrol-admin-${suffix}@test.local`,
      password: pw,
    })
    studentClient = await getAuthenticatedClient({
      email: `enrol-s1-${suffix}@test.local`,
      password: pw,
    })

    const { data } = await admin.from('courses').select('id, code')
    const m = Object.fromEntries((data ?? []).map((c) => [c.code as string, c.id as string]))
    ppl = m.PPL_A as string
    vfr = m.VFR_RT as string
    atpl = m.ATPL_A as string
  })

  afterAll(async () => {
    await cleanupTestData({ admin, orgId, userIds })
    await cleanupTestData({ admin, orgId: otherOrgId, userIds: otherUserIds })
  })

  async function active(student: string): Promise<string[]> {
    const { data } = await admin
      .from('course_enrolments')
      .select('course_id')
      .eq('user_id', student)
      .is('deleted_at', null)
    return (data ?? []).map((r) => r.course_id as string).sort()
  }

  async function audits(student: string) {
    const { data } = await admin
      .from('audit_events')
      .select('actor_id, actor_role, organization_id, resource_type, resource_id, metadata')
      .eq('event_type', 'user.enrolments_changed')
      .eq('resource_id', student)
    return data ?? []
  }

  it('AC3: adds enrolments and writes one user.enrolments_changed audit row', async () => {
    const { error } = await adminClient.rpc('set_user_enrolments', {
      p_user_id: studentId,
      p_course_ids: [ppl, vfr],
    })
    expect(error).toBeNull()
    expect(await active(studentId)).toEqual([ppl, vfr].sort())

    const rows = await audits(studentId)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      actor_id: adminId,
      actor_role: 'admin',
      organization_id: orgId,
      resource_type: 'user',
    })
    const meta = rows[0]?.metadata as { added: string[]; removed: string[] }
    expect([...meta.added].sort()).toEqual([ppl, vfr].sort())
    expect(meta.removed).toEqual([])
  })

  it('AC3: removes enrolments not in the set by soft delete with deleted_by', async () => {
    const { error } = await adminClient.rpc('set_user_enrolments', {
      p_user_id: studentId,
      p_course_ids: [ppl, atpl],
    })
    expect(error).toBeNull()
    expect(await active(studentId)).toEqual([ppl, atpl].sort())

    const { data: removed } = await admin
      .from('course_enrolments')
      .select('deleted_at, deleted_by')
      .eq('user_id', studentId)
      .eq('course_id', vfr)
    expect(removed).toHaveLength(1)
    expect(removed?.[0]?.deleted_at).not.toBeNull()
    expect(removed?.[0]?.deleted_by).toBe(adminId)
  })

  it('AC3: an unchanged set writes no audit row', async () => {
    const before = (await audits(studentId)).length
    const { error } = await adminClient.rpc('set_user_enrolments', {
      p_user_id: studentId,
      p_course_ids: [atpl, ppl, ppl],
    })
    expect(error).toBeNull()
    expect((await audits(studentId)).length).toBe(before)
    expect(await active(studentId)).toEqual([ppl, atpl].sort())
  })

  it('AC3: an empty array removes every enrolment', async () => {
    const { error } = await adminClient.rpc('set_user_enrolments', {
      p_user_id: student2Id,
      p_course_ids: [ppl],
    })
    expect(error).toBeNull()
    const { error: e2 } = await adminClient.rpc('set_user_enrolments', {
      p_user_id: student2Id,
      p_course_ids: [],
    })
    expect(e2).toBeNull()
    expect(await active(student2Id)).toEqual([])
  })

  it('AC4: rejects a non-admin caller with not_admin', async () => {
    const { error } = await studentClient.rpc('set_user_enrolments', {
      p_user_id: studentId,
      p_course_ids: [ppl],
    })
    expect(error?.message).toContain('not_admin')
  })

  it('AC4: rejects a user from another organization with user_not_found', async () => {
    const { error } = await adminClient.rpc('set_user_enrolments', {
      p_user_id: otherOrgStudentId,
      p_course_ids: [ppl],
    })
    expect(error?.message).toContain('user_not_found')
  })

  it('AC4: rejects a soft-deleted user with user_not_found', async () => {
    const { error: delErr } = await admin
      .from('users')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', deletedUserId)
    expect(delErr).toBeNull()
    const { error } = await adminClient.rpc('set_user_enrolments', {
      p_user_id: deletedUserId,
      p_course_ids: [ppl],
    })
    expect(error?.message).toContain('user_not_found')
  })

  it('AC4: rejects an unknown user id with user_not_found', async () => {
    const { error } = await adminClient.rpc('set_user_enrolments', {
      p_user_id: '00000000-0000-4000-8000-000000000000',
      p_course_ids: [ppl],
    })
    expect(error?.message).toContain('user_not_found')
  })

  it('AC3: an admin can enrol an instructor, with row and audit', async () => {
    const { error } = await adminClient.rpc('set_user_enrolments', {
      p_user_id: instructorId,
      p_course_ids: [atpl],
    })
    expect(error).toBeNull()
    expect(await active(instructorId)).toEqual([atpl])
    const rows = await audits(instructorId)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ actor_id: adminId, organization_id: orgId })
  })

  it('AC3: an admin can enrol another admin', async () => {
    const { error } = await adminClient.rpc('set_user_enrolments', {
      p_user_id: admin2Id,
      p_course_ids: [ppl],
    })
    expect(error).toBeNull()
    expect(await active(admin2Id)).toEqual([ppl])
  })

  it('AC5: changing the user role keeps enrolments active', async () => {
    const { error } = await adminClient.rpc('set_user_enrolments', {
      p_user_id: roleChangeId,
      p_course_ids: [ppl, vfr],
    })
    expect(error).toBeNull()
    const { error: upErr } = await admin
      .from('users')
      .update({ role: 'instructor' })
      .eq('id', roleChangeId)
    expect(upErr).toBeNull()
    expect(await active(roleChangeId)).toEqual([ppl, vfr].sort())
  })

  it('AC4: rejects an unknown course with course_not_found and changes nothing', async () => {
    const before = await active(studentId)
    const { error } = await adminClient.rpc('set_user_enrolments', {
      p_user_id: studentId,
      p_course_ids: [ppl, '00000000-0000-4000-8000-000000000000'],
    })
    expect(error?.message).toContain('course_not_found')
    expect(await active(studentId)).toEqual(before)
  })

  it('AC4: rejects a NULL array with invalid_input', async () => {
    const { error } = await adminClient.rpc('set_user_enrolments', {
      p_user_id: studentId,
      p_course_ids: null,
    })
    expect(error?.message).toContain('invalid_input')
  })

  it('AC5: re-adding a removed course creates a new active row and keeps history', async () => {
    const set = (ids: string[]) =>
      adminClient.rpc('set_user_enrolments', { p_user_id: student2Id, p_course_ids: ids })
    expect((await set([vfr])).error).toBeNull()
    expect((await set([])).error).toBeNull()
    expect((await set([vfr])).error).toBeNull()

    const { data } = await admin
      .from('course_enrolments')
      .select('id, deleted_at')
      .eq('user_id', student2Id)
      .eq('course_id', vfr)
    expect(data).toHaveLength(2)
    expect((data ?? []).filter((r) => r.deleted_at === null)).toHaveLength(1)
  })

  it('AC8: anon cannot execute the RPC', async () => {
    const { error } = await getAnonClient().rpc('set_user_enrolments', {
      p_user_id: studentId,
      p_course_ids: [ppl],
    })
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/permission denied|not authorized|not_authenticated/i)
  })
})
