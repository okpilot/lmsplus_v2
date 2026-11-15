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
  let student2Id: string
  let studentClient: SupabaseClient
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
    student2Id = await mk(orgId, 'sgf-student2', 'student', userIds)
    otherStudentId = await mk(otherOrgId, 'sgf-ostudent', 'student', otherUserIds)
    adminClient = await getAuthenticatedClient({
      email: `sgf-admin-${suffix}@test.local`,
      password: pw,
    })
    studentClient = await getAuthenticatedClient({
      email: `sgf-student-${suffix}@test.local`,
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
  const getGroup = async (id: string) => {
    const { data, error } = await admin.from('student_groups').select('*').eq('id', id).single()
    if (error) throw new Error(`getGroup: ${error.message}`)
    return data
  }
  const audits = async (id: string, type: string) => {
    const { data, error } = await admin
      .from('audit_events')
      .select('metadata')
      .eq('resource_id', id)
      .eq('event_type', type)
    if (error) throw new Error(`audits: ${error.message}`)
    return data ?? []
  }
  const setDeactivated = async (id: string, on: boolean) => {
    const { data, error } = await admin
      .from('users')
      .update({ deleted_at: on ? new Date().toISOString() : null })
      .eq('id', id)
      .select('id, deleted_at')
    return { data, error }
  }

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

  it('bulk add skips an existing member who was since deactivated and adds the new student', async () => {
    const id = await create(nm('bulk'), null)
    const first = await adminClient.rpc('add_student_group_members', {
      p_group_id: id,
      p_user_ids: [studentId],
    })
    expect(first.error).toBeNull()
    const off = await setDeactivated(studentId, true)
    expect(off.error).toBeNull()
    expect(off.data?.[0]?.id).toBe(studentId)
    expect(off.data?.[0]?.deleted_at).not.toBeNull()
    let restore: Awaited<ReturnType<typeof setDeactivated>> | null = null
    try {
      const { data, error } = await adminClient.rpc('add_student_group_members', {
        p_group_id: id,
        p_user_ids: [studentId, student2Id],
      })
      expect(error).toBeNull()
      expect(data).toBe(1)
      const again = await adminClient.rpc('add_student_group_members', {
        p_group_id: id,
        p_user_ids: [studentId],
      })
      expect(again.error).toBeNull()
      expect(again.data).toBe(0)
    } finally {
      restore = await setDeactivated(studentId, false)
    }
    expect(restore?.error).toBeNull()
    expect(restore?.data?.[0]?.id).toBe(studentId)
    expect(restore?.data?.[0]?.deleted_at).toBeNull()
  })

  it('tab-padded name is stored trimmed and detected as a duplicate', async () => {
    const id = await create(`\t${nm('pad')}\t`, null)
    expect((await getGroup(id))?.name).toBe(nm('pad'))
    const dup = await adminClient.rpc('create_student_group', {
      p_name: ` ${nm('PAD')}\t`,
      p_description: null,
    })
    expect(dup.error?.message).toContain('group_name_taken')
  })

  it('anon gets 42501 on every student-group RPC', async () => {
    const anon = getAnonClient()
    const g = '00000000-0000-4000-a000-000000000001'
    const calls = [
      anon.rpc('create_student_group', { p_name: 'x', p_description: null }),
      anon.rpc('update_student_group', { p_group_id: g, p_name: 'x', p_description: null }),
      anon.rpc('delete_student_group', { p_group_id: g }),
      anon.rpc('add_student_group_members', { p_group_id: g, p_user_ids: [g] }),
      anon.rpc('remove_student_group_members', { p_group_id: g, p_user_ids: [g] }),
    ]
    for (const { error } of await Promise.all(calls)) expect(error?.code).toBe('42501')
  })

  it('a member reads id, name from their group but not description or created_by', async () => {
    const id = await create(nm('cols'), 'admin note')
    const add = await adminClient.rpc('add_student_group_members', {
      p_group_id: id,
      p_user_ids: [studentId],
    })
    expect(add.error).toBeNull()
    const ok = await studentClient.from('student_groups').select('id, name').eq('id', id)
    expect(ok.error).toBeNull()
    expect(ok.data).toHaveLength(1)
    for (const col of ['description', 'created_by']) {
      const { error } = await studentClient.from('student_groups').select(col).eq('id', id)
      expect(error?.code).toBe('42501')
    }
  })
})
