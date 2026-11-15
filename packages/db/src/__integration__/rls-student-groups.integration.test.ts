import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupTestData } from './cleanup'
import { fixtureSuffix } from './fixture-suffix'
import { createTestOrg, createTestUser, getAdminClient, getAuthenticatedClient } from './setup'

/** RLS on student_groups / student_group_members: #1776 PR 1a (AC3). */
describe('RLS: student_groups and student_group_members', () => {
  const admin = getAdminClient()
  const suffix = fixtureSuffix()
  const pw = 'test-pass-123'

  let orgAId: string
  let orgBId: string
  let sA1: string
  let sA2: string
  let adminA: string
  let adminAClient: SupabaseClient
  let adminBClient: SupabaseClient
  let s1Client: SupabaseClient
  let instrClient: SupabaseClient
  let deactClient: SupabaseClient
  let deactAdminClient: SupabaseClient
  let g1: string
  let g2: string
  let gDeleted: string
  const idsA: string[] = []
  const idsB: string[] = []

  beforeAll(async () => {
    orgAId = await createTestOrg({ admin, name: `RLS-G A ${suffix}`, slug: `rlsg-a-${suffix}` })
    orgBId = await createTestOrg({ admin, name: `RLS-G B ${suffix}`, slug: `rlsg-b-${suffix}` })
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
    adminA = await mk(orgAId, 'rlsg-adminA', 'admin', idsA)
    sA1 = await mk(orgAId, 'rlsg-s1', 'student', idsA)
    sA2 = await mk(orgAId, 'rlsg-s2', 'student', idsA)
    const sDeact = await mk(orgAId, 'rlsg-deact', 'student', idsA)
    await mk(orgAId, 'rlsg-instr', 'instructor', idsA)
    const adminDeact = await mk(orgAId, 'rlsg-deactadmin', 'admin', idsA)
    await mk(orgBId, 'rlsg-adminB', 'admin', idsB)
    adminAClient = await client('rlsg-adminA')
    adminBClient = await client('rlsg-adminB')
    s1Client = await client('rlsg-s1')
    instrClient = await client('rlsg-instr')
    deactClient = await client('rlsg-deact')
    deactAdminClient = await client('rlsg-deactadmin')

    const mkGroup = async (name: string) => {
      const { data, error } = await adminAClient.rpc('create_student_group', {
        p_name: `${name}-${suffix}`,
        p_description: null,
      })
      if (error) throw new Error(`create_student_group: ${error.message}`)
      return data as string
    }
    g1 = await mkGroup('g1')
    g2 = await mkGroup('g2')
    gDeleted = await mkGroup('gdel')
    for (const [g, ids] of [
      [g1, [sA1, sDeact]],
      [g2, [sA2]],
      [gDeleted, [sA1]],
    ] as const) {
      const { error } = await adminAClient.rpc('add_student_group_members', {
        p_group_id: g,
        p_user_ids: ids,
      })
      if (error) throw new Error(`add members: ${error.message}`)
    }
    await adminAClient.rpc('delete_student_group', { p_group_id: gDeleted })
    await admin
      .from('users')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', [sDeact, adminDeact])
  })

  afterAll(async () => {
    for (const o of [orgAId, orgBId]) {
      await admin.from('student_group_members').delete().eq('organization_id', o)
      await admin.from('student_groups').delete().eq('organization_id', o)
    }
    await cleanupTestData({ admin, orgId: orgAId, userIds: idsA })
    await cleanupTestData({ admin, orgId: orgBId, userIds: idsB })
  })

  it('AC3: an admin reads active groups and memberships of their own org', async () => {
    const groups = await adminAClient.from('student_groups').select('id')
    expect((groups.data ?? []).map((r) => r.id).sort()).toEqual([g1, g2].sort())
    const m = await adminAClient.from('student_group_members').select('user_id, group_id')
    expect(m.data).toHaveLength(3)
  })

  it('AC3: admin reads exclude soft-deleted groups and memberships', async () => {
    const groups = await adminAClient.from('student_groups').select('id').eq('id', gDeleted)
    expect(groups.data).toEqual([])
    const m = await adminAClient.from('student_group_members').select('id').eq('group_id', gDeleted)
    expect(m.data).toEqual([])
  })

  it('AC3: an admin of another org reads nothing', async () => {
    expect((await adminBClient.from('student_groups').select('id')).data).toEqual([])
    expect((await adminBClient.from('student_group_members').select('id')).data).toEqual([])
  })

  it('AC3: a student reads only their own membership and its group', async () => {
    const m = await s1Client.from('student_group_members').select('user_id, group_id')
    expect(m.data).toEqual([{ user_id: sA1, group_id: g1 }])
    const groups = await s1Client.from('student_groups').select('id')
    expect((groups.data ?? []).map((r) => r.id)).toEqual([g1])
  })

  it('AC3: an instructor reads nothing', async () => {
    expect((await instrClient.from('student_groups').select('id')).data).toEqual([])
    expect((await instrClient.from('student_group_members').select('id')).data).toEqual([])
  })

  it('AC3: a deactivated caller (student or admin) reads nothing', async () => {
    for (const c of [deactClient, deactAdminClient]) {
      expect((await c.from('student_groups').select('id')).data).toEqual([])
      expect((await c.from('student_group_members').select('id')).data).toEqual([])
    }
  })

  it('AC3: a student loses sight of a group once their membership is removed', async () => {
    await adminAClient.rpc('remove_student_group_members', { p_group_id: g2, p_user_ids: [sA2] })
    const s2 = await getAuthenticatedClient({ email: `rlsg-s2-${suffix}@test.local`, password: pw })
    expect((await s2.from('student_groups').select('id')).data).toEqual([])
    expect((await s2.from('student_group_members').select('id')).data).toEqual([])
  })

  it('AC3: authenticated cannot INSERT, UPDATE or DELETE either table (42501), even as admin', async () => {
    for (const c of [adminAClient, s1Client]) {
      const ins = await c
        .from('student_groups')
        .insert({ organization_id: orgAId, name: `x-${suffix}`, created_by: adminA })
      expect(ins.error?.code).toBe('42501')
      const upd = await c
        .from('student_groups')
        .update({ name: `y-${suffix}` })
        .eq('id', g1)
      expect(upd.error?.code).toBe('42501')
      const del = await c.from('student_groups').delete().eq('id', g1)
      expect(del.error?.code).toBe('42501')
      const mi = await c
        .from('student_group_members')
        .insert({ organization_id: orgAId, group_id: g1, user_id: sA2, added_by: adminA })
      expect(mi.error?.code).toBe('42501')
      const mu = await c
        .from('student_group_members')
        .update({ deleted_at: new Date().toISOString() })
        .eq('group_id', g1)
      expect(mu.error?.code).toBe('42501')
      const md = await c.from('student_group_members').delete().eq('group_id', g1)
      expect(md.error?.code).toBe('42501')
    }
    const { data } = await admin.from('student_groups').select('name').eq('id', g1)
    expect(data?.[0]?.name).toBe(`g1-${suffix}`)
  })
})
