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

/** create/update/delete_student_group + table constraints: #1776 PR 1a (AC1, AC2, AC4). */
describe('RPC: student group CRUD', () => {
  const admin = getAdminClient()
  const suffix = fixtureSuffix()
  const pw = 'test-pass-123'
  const bad = '00000000-0000-4000-a000-0000000000ff'

  let orgId: string
  let otherOrgId: string
  let adminId: string
  let studentId: string
  let otherAdminId: string
  let deactivatedAdminId: string
  let adminClient: SupabaseClient
  let studentClient: SupabaseClient
  let instructorClient: SupabaseClient
  let otherAdminClient: SupabaseClient
  let deactivatedClient: SupabaseClient
  const userIds: string[] = []
  const otherUserIds: string[] = []
  const nm = (s: string) => `${s}-${suffix}`

  beforeAll(async () => {
    orgId = await createTestOrg({ admin, name: `SG ${suffix}`, slug: `sg-${suffix}` })
    otherOrgId = await createTestOrg({ admin, name: `SG O ${suffix}`, slug: `sg-o-${suffix}` })
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
    adminId = await mk(orgId, 'sg-admin', 'admin', userIds)
    studentId = await mk(orgId, 'sg-student', 'student', userIds)
    await mk(orgId, 'sg-instr', 'instructor', userIds)
    deactivatedAdminId = await mk(orgId, 'sg-deact', 'admin', userIds)
    otherAdminId = await mk(otherOrgId, 'sg-oadmin', 'admin', otherUserIds)
    adminClient = await client('sg-admin')
    studentClient = await client('sg-student')
    instructorClient = await client('sg-instr')
    deactivatedClient = await client('sg-deact')
    otherAdminClient = await client('sg-oadmin')
    await admin
      .from('users')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', deactivatedAdminId)
  })

  afterAll(async () => {
    for (const o of [orgId, otherOrgId]) {
      await admin.from('student_group_members').delete().eq('organization_id', o)
      await admin.from('student_groups').delete().eq('organization_id', o)
    }
    await cleanupTestData({ admin, orgId, userIds })
    await cleanupTestData({ admin, orgId: otherOrgId, userIds: otherUserIds })
  })

  async function create(name: string, description?: string | null, c = adminClient) {
    return c.rpc('create_student_group', { p_name: name, p_description: description ?? null })
  }
  async function groupRow(id: string) {
    const { data, error } = await admin.from('student_groups').select('*').eq('id', id).single()
    if (error) throw new Error(`groupRow: ${error.message}`)
    return data as Record<string, unknown> | null
  }
  async function audits(type: string, resourceId: string) {
    const { data, error } = await admin
      .from('audit_events')
      .select('actor_id, actor_role, organization_id, resource_type, resource_id, metadata')
      .eq('event_type', type)
      .eq('resource_id', resourceId)
      .order('created_at', { ascending: true })
    if (error) throw new Error(`audits: ${error.message}`)
    return data ?? []
  }

  describe('table constraints (AC1, AC2)', () => {
    it('AC1: CHECK rejects empty, whitespace-only and >80 char names', async () => {
      for (const name of ['', '   ', 'a'.repeat(81)]) {
        const { error } = await admin
          .from('student_groups')
          .insert({ organization_id: orgId, name, created_by: adminId })
        expect(error?.code, `name length ${name.length}`).toBe('23514')
      }
    })
    it('AC1: CHECK rejects a description over 500 chars; 500 is accepted', async () => {
      const over = await admin.from('student_groups').insert({
        organization_id: orgId,
        name: nm('desc-over'),
        description: 'a'.repeat(501),
        created_by: adminId,
      })
      expect(over.error?.code).toBe('23514')
      const ok = await admin.from('student_groups').insert({
        organization_id: orgId,
        name: nm('desc-ok'),
        description: 'a'.repeat(500),
        created_by: adminId,
      })
      expect(ok.error).toBeNull()
    })
    it('AC1: active names are unique per org case-insensitively; other orgs may reuse', async () => {
      const a = await admin
        .from('student_groups')
        .insert({ organization_id: orgId, name: nm('Uniq'), created_by: adminId })
      expect(a.error).toBeNull()
      const b = await admin
        .from('student_groups')
        .insert({ organization_id: orgId, name: nm('UNIQ'), created_by: adminId })
      expect(b.error?.code).toBe('23505')
      const c = await admin
        .from('student_groups')
        .insert({ organization_id: otherOrgId, name: nm('Uniq'), created_by: otherAdminId })
      expect(c.error).toBeNull()
    })
    it('AC2: a user is active in a group at most once; re-adding after soft delete is allowed', async () => {
      const { data: gid } = await create(nm('unique-member'))
      const row = { organization_id: orgId, group_id: gid, user_id: studentId, added_by: adminId }
      const first = await admin.from('student_group_members').insert(row).select('id').single()
      expect(first.error).toBeNull()
      const dup = await admin.from('student_group_members').insert(row)
      expect(dup.error?.code).toBe('23505')
      await admin
        .from('student_group_members')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', first.data?.id)
      const again = await admin.from('student_group_members').insert(row)
      expect(again.error).toBeNull()
    })
  })

  describe('create_student_group (AC4)', () => {
    it('AC4: creates a trimmed group, returns its id and writes a student_group.created audit row', async () => {
      const { data, error } = await create(`  ${nm('Created')}  `, 'desc')
      expect(error).toBeNull()
      const row = await groupRow(data as string)
      expect(row).toMatchObject({
        organization_id: orgId,
        name: nm('Created'),
        description: 'desc',
        created_by: adminId,
        deleted_at: null,
      })
      const rows = await audits('student_group.created', data as string)
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
        actor_id: adminId,
        actor_role: 'admin',
        organization_id: orgId,
        resource_type: 'student_group',
      })
      expect(rows[0]?.metadata).toMatchObject({ name: nm('Created') })
    })
    it('AC4: group_name_taken on a case-insensitive duplicate', async () => {
      await create(nm('Dup'))
      const { error } = await create(nm('dUP'))
      expect(error?.message).toContain('group_name_taken')
    })
    it('AC4: invalid_input on empty, whitespace-only, over-long name or over-long description', async () => {
      for (const [n, d] of [
        ['', null],
        ['   ', null],
        ['a'.repeat(81), null],
        [nm('okname'), 'a'.repeat(501)],
      ] as const) {
        const { error } = await create(n, d)
        expect(error?.message, `${n.length}/${d?.length}`).toContain('invalid_input')
      }
    })
    it('AC4: not_admin for student and instructor; not_authenticated for anon; admin_not_found for deactivated admin', async () => {
      expect((await create(nm('s'), null, studentClient)).error?.message).toContain('not_admin')
      expect((await create(nm('i'), null, instructorClient)).error?.message).toContain('not_admin')
      expect((await create(nm('a'), null, getAnonClient())).error).not.toBeNull()
      expect((await create(nm('d'), null, deactivatedClient)).error?.message).toMatch(
        /admin_not_found|not_admin|not_authenticated/,
      )
    })
    it('AC4: a name is reusable after the group is soft-deleted', async () => {
      const { data: gid } = await create(nm('Reuse'))
      await adminClient.rpc('delete_student_group', { p_group_id: gid })
      const again = await create(nm('reuse'))
      expect(again.error).toBeNull()
      expect(again.data).not.toBe(gid)
    })
  })

  describe('update_student_group (AC4)', () => {
    it('AC4: renames, sets updated_at and writes student_group.updated {old_name, name}', async () => {
      const { data: gid } = await create(nm('Before'), 'd1')
      const before = (await groupRow(gid as string))?.updated_at
      await new Promise((r) => setTimeout(r, 20))
      const { error } = await adminClient.rpc('update_student_group', {
        p_group_id: gid,
        p_name: ` ${nm('After')} `,
        p_description: 'd2',
      })
      expect(error).toBeNull()
      const row = await groupRow(gid as string)
      expect(row).toMatchObject({ name: nm('After'), description: 'd2' })
      expect(row?.updated_at).not.toBe(before)
      const rows = await audits('student_group.updated', gid as string)
      expect(rows).toHaveLength(1)
      expect(rows[0]?.metadata).toMatchObject({ old_name: nm('Before'), name: nm('After') })
    })
    it('AC4: no audit row when nothing changed', async () => {
      const { data: gid } = await create(nm('Same'), 'd')
      const { error } = await adminClient.rpc('update_student_group', {
        p_group_id: gid,
        p_name: nm('Same'),
        p_description: 'd',
      })
      expect(error).toBeNull()
      expect(await audits('student_group.updated', gid as string)).toHaveLength(0)
    })
    it('AC4: group_name_taken when renaming onto another active group', async () => {
      await create(nm('Taken'))
      const { data: gid } = await create(nm('Other'))
      const { error } = await adminClient.rpc('update_student_group', {
        p_group_id: gid,
        p_name: nm('TAKEN'),
        p_description: null,
      })
      expect(error?.message).toContain('group_name_taken')
    })
    it('AC4: group_not_found for unknown id, other-org group and deleted group', async () => {
      const { data: gid } = await create(nm('Scoped'))
      const call = (c: SupabaseClient, id: unknown) =>
        c.rpc('update_student_group', { p_group_id: id, p_name: nm('x'), p_description: null })
      expect((await call(adminClient, bad)).error?.message).toContain('group_not_found')
      expect((await call(otherAdminClient, gid)).error?.message).toContain('group_not_found')
      await adminClient.rpc('delete_student_group', { p_group_id: gid })
      expect((await call(adminClient, gid)).error?.message).toContain('group_not_found')
    })
    it('AC4: invalid_input on a bad name; not_admin for a student', async () => {
      const { data: gid } = await create(nm('Guard'))
      const bad1 = await adminClient.rpc('update_student_group', {
        p_group_id: gid,
        p_name: '  ',
        p_description: null,
      })
      expect(bad1.error?.message).toContain('invalid_input')
      const s = await studentClient.rpc('update_student_group', {
        p_group_id: gid,
        p_name: nm('n'),
        p_description: null,
      })
      expect(s.error?.message).toContain('not_admin')
    })
  })

  describe('delete_student_group (AC4)', () => {
    it('AC4: soft-deletes the group and its active memberships, keeps history, audits members_removed', async () => {
      const { data: gid } = await create(nm('Del'))
      await adminClient.rpc('add_student_group_members', {
        p_group_id: gid,
        p_user_ids: [studentId],
      })
      const { error } = await adminClient.rpc('delete_student_group', { p_group_id: gid })
      expect(error).toBeNull()
      const row = await groupRow(gid as string)
      expect(row?.deleted_at).not.toBeNull()
      expect(row?.deleted_by).toBe(adminId)
      const { data: members } = await admin
        .from('student_group_members')
        .select('deleted_at, deleted_by')
        .eq('group_id', gid)
      expect(members).toHaveLength(1)
      expect(members?.[0]?.deleted_at).not.toBeNull()
      expect(members?.[0]?.deleted_by).toBe(adminId)
      const rows = await audits('student_group.deleted', gid as string)
      expect(rows).toHaveLength(1)
      expect(rows[0]?.metadata).toMatchObject({ name: nm('Del'), members_removed: 1 })
    })
    it('AC4: group_not_found for unknown, other-org and already-deleted group', async () => {
      const { data: gid } = await create(nm('DelScope'))
      const call = (c: SupabaseClient, id: unknown) =>
        c.rpc('delete_student_group', { p_group_id: id })
      expect((await call(adminClient, bad)).error?.message).toContain('group_not_found')
      expect((await call(otherAdminClient, gid)).error?.message).toContain('group_not_found')
      expect((await call(adminClient, gid)).error).toBeNull()
      expect((await call(adminClient, gid)).error?.message).toContain('group_not_found')
    })
    it('AC4: not_admin for student and instructor', async () => {
      const { data: gid } = await create(nm('DelGuard'))
      for (const c of [studentClient, instructorClient]) {
        const { error } = await c.rpc('delete_student_group', { p_group_id: gid })
        expect(error?.message).toContain('not_admin')
      }
      expect((await groupRow(gid as string))?.deleted_at).toBeNull()
    })
  })

  it('AC4: the CRUD RPCs are not executable by anon', async () => {
    const anon = getAnonClient()
    for (const [fn, args] of [
      ['create_student_group', { p_name: 'x' }],
      ['update_student_group', { p_group_id: bad, p_name: 'x' }],
      ['delete_student_group', { p_group_id: bad }],
    ] as const) {
      const { error } = await anon.rpc(fn, args)
      expect(error, fn).not.toBeNull()
      expect(error?.message, fn).not.toContain('group_not_found')
    }
  })
})
