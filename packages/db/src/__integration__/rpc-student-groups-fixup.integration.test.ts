import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupTestData } from './cleanup'
import { fixtureSuffix } from './fixture-suffix'
import { createTestOrg, createTestUser, getAdminClient, getAuthenticatedClient } from './setup'

/** Round-1 fixup: description keep/clear, audit fields, composite org FK. #1776 PR 1a. */
describe('RPC: student group fixup', () => {
  const admin = getAdminClient()
  const suffix = fixtureSuffix()
  const pw = 'test-pass-123'
  let orgId: string
  let otherOrgId: string
  let adminId: string
  let studentId: string
  let otherStudentId: string
  let adminClient: SupabaseClient
  const userIds: string[] = []
  const otherUserIds: string[] = []
  const nm = (s: string) => `${s}-${suffix}`

  beforeAll(async () => {
    orgId = await createTestOrg({ admin, name: `SGF ${suffix}`, slug: `sgf-${suffix}` })
    otherOrgId = await createTestOrg({ admin, name: `SGF O ${suffix}`, slug: `sgf-o-${suffix}` })
    const mk = async (o: string, tag: string, role: 'admin' | 'student', into: string[]) => {
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
    adminId = await mk(orgId, 'sgf-admin', 'admin', userIds)
    studentId = await mk(orgId, 'sgf-student', 'student', userIds)
    otherStudentId = await mk(otherOrgId, 'sgf-ostudent', 'student', otherUserIds)
    adminClient = await getAuthenticatedClient({
      email: `sgf-admin-${suffix}@test.local`,
      password: pw,
    })
  })

  afterAll(async () => {
    for (const o of [orgId, otherOrgId]) {
      await admin.from('student_group_members').delete().eq('organization_id', o)
      await admin.from('student_groups').delete().eq('organization_id', o)
    }
    await cleanupTestData({ admin, orgId, userIds })
    await cleanupTestData({ admin, orgId: otherOrgId, userIds: otherUserIds })
  })

  const create = async (name: string, description: string | null) => {
    const { data, error } = await adminClient.rpc('create_student_group', {
      p_name: name,
      p_description: description,
    })
    expect(error).toBeNull()
    return data as string
  }
  const getGroup = async (id: string) =>
    (await admin.from('student_groups').select('*').eq('id', id).single()).data
  const audits = async (id: string, type: string) =>
    (
      await admin
        .from('audit_events')
        .select('metadata')
        .eq('resource_id', id)
        .eq('event_type', type)
    ).data ?? []

  it('rename with p_description omitted keeps the description', async () => {
    const id = await create(nm('keep'), 'orig')
    const { error } = await adminClient.rpc('update_student_group', {
      p_group_id: id,
      p_name: nm('keep2'),
    })
    expect(error).toBeNull()
    expect((await getGroup(id))?.description).toBe('orig')
  })

  it("'' clears the description and audit carries old/new description", async () => {
    const id = await create(nm('clear'), 'orig')
    const { error } = await adminClient.rpc('update_student_group', {
      p_group_id: id,
      p_name: nm('clear'),
      p_description: '',
    })
    expect(error).toBeNull()
    expect((await getGroup(id))?.description).toBeNull()
    const rows = await audits(id, 'student_group.updated')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.metadata).toMatchObject({ old_description: 'orig', description: null })
  })

  it("'' on a group with a NULL description writes no audit row", async () => {
    const id = await create(nm('nullnoop'), null)
    const { error } = await adminClient.rpc('update_student_group', {
      p_group_id: id,
      p_name: nm('nullnoop'),
      p_description: '',
    })
    expect(error).toBeNull()
    expect(await audits(id, 'student_group.updated')).toHaveLength(0)
  })

  it('delete audit lists user_ids and bumps updated_at', async () => {
    const id = await create(nm('del'), null)
    const before = (await getGroup(id))?.updated_at as string
    const add = await adminClient.rpc('add_student_group_members', {
      p_group_id: id,
      p_user_ids: [studentId],
    })
    expect(add.error).toBeNull()
    await new Promise((r) => setTimeout(r, 20))
    const { error } = await adminClient.rpc('delete_student_group', { p_group_id: id })
    expect(error).toBeNull()
    const rows = await audits(id, 'student_group.deleted')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.metadata).toMatchObject({ members_removed: 1, user_ids: [studentId] })
    const after = (await getGroup(id))?.updated_at as string
    expect(new Date(after).getTime()).toBeGreaterThan(new Date(before).getTime())
  })

  it('member row whose organization differs from the group org violates the composite FK', async () => {
    const id = await create(nm('fk'), null)
    const { error } = await admin.from('student_group_members').insert({
      organization_id: otherOrgId,
      group_id: id,
      user_id: otherStudentId,
      added_by: adminId,
    })
    expect(error?.code).toBe('23503')
  })
})
