import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupTestData } from './cleanup'
import { fixtureSuffix } from './fixture-suffix'
import { createTestOrg, createTestUser, getAdminClient, getAuthenticatedClient } from './setup'

/** RLS on student_groups / student_group_members, both directions across two orgs: #1776 PR 1a (AC3). */
describe('RLS: student groups cross-org isolation (both directions)', () => {
  const admin = getAdminClient()
  const suffix = fixtureSuffix()
  const pw = 'test-pass-123'

  let orgAId: string
  let orgBId: string
  let sA: string
  let sB: string
  let gA: string
  let gB: string
  let adminAClient: SupabaseClient
  let adminBClient: SupabaseClient
  let studentBClient: SupabaseClient
  const idsA: string[] = []
  const idsB: string[] = []

  beforeAll(async () => {
    orgAId = await createTestOrg({ admin, name: `RLS-X A ${suffix}`, slug: `rlsx-a-${suffix}` })
    orgBId = await createTestOrg({ admin, name: `RLS-X B ${suffix}`, slug: `rlsx-b-${suffix}` })
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
    const client = (tag: string) =>
      getAuthenticatedClient({ email: `${tag}-${suffix}@test.local`, password: pw })
    await mk(orgAId, 'rlsx-adminA', 'admin', idsA)
    sA = await mk(orgAId, 'rlsx-sA', 'student', idsA)
    await mk(orgBId, 'rlsx-adminB', 'admin', idsB)
    sB = await mk(orgBId, 'rlsx-sB', 'student', idsB)
    adminAClient = await client('rlsx-adminA')
    adminBClient = await client('rlsx-adminB')
    studentBClient = await client('rlsx-sB')

    const seed = async (c: SupabaseClient, name: string, student: string) => {
      const created = await c.rpc('create_student_group', {
        p_name: `${name}-${suffix}`,
        p_description: null,
      })
      if (created.error) throw new Error(`create_student_group: ${created.error.message}`)
      const added = await c.rpc('add_student_group_members', {
        p_group_id: created.data as string,
        p_user_ids: [student],
      })
      if (added.error) throw new Error(`add members: ${added.error.message}`)
      return created.data as string
    }
    gA = await seed(adminAClient, 'gA', sA)
    gB = await seed(adminBClient, 'gB', sB)
  })

  afterAll(async () => {
    for (const o of [orgAId, orgBId]) {
      await admin.from('student_group_members').delete().eq('organization_id', o)
      await admin.from('student_groups').delete().eq('organization_id', o)
    }
    await cleanupTestData({ admin, orgId: orgAId, userIds: idsA })
    await cleanupTestData({ admin, orgId: orgBId, userIds: idsB })
  })

  it('AC3: admin A reads only org A groups and memberships', async () => {
    const groups = await adminAClient.from('student_groups').select('id')
    expect(groups.error).toBeNull()
    expect((groups.data ?? []).map((r) => r.id)).toEqual([gA])
    const m = await adminAClient.from('student_group_members').select('group_id, user_id')
    expect(m.error).toBeNull()
    expect(m.data).toEqual([{ group_id: gA, user_id: sA }])
  })

  it('AC3: admin B reads only org B groups and memberships', async () => {
    const groups = await adminBClient.from('student_groups').select('id')
    expect(groups.error).toBeNull()
    expect((groups.data ?? []).map((r) => r.id)).toEqual([gB])
    const m = await adminBClient.from('student_group_members').select('group_id, user_id')
    expect(m.error).toBeNull()
    expect(m.data).toEqual([{ group_id: gB, user_id: sB }])
  })

  it('AC3: a student of org B reads only their own membership and group', async () => {
    const m = await studentBClient.from('student_group_members').select('group_id, user_id')
    expect(m.error).toBeNull()
    expect(m.data).toEqual([{ group_id: gB, user_id: sB }])
    const groups = await studentBClient.from('student_groups').select('id')
    expect(groups.error).toBeNull()
    expect((groups.data ?? []).map((r) => r.id)).toEqual([gB])
  })
})
