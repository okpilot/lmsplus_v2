import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanupTestData } from './cleanup'
import { fixtureSuffix } from './fixture-suffix'
import { createTestOrg, createTestUser, getAdminClient, getAuthenticatedClient } from './setup'

/** RLS on courses / course_enrolments: courses PR1 (AC6, AC7). */
describe('RLS: courses and course_enrolments', () => {
  const admin = getAdminClient()
  const suffix = fixtureSuffix()
  const pw = 'test-pass-123'

  let orgAId: string
  let orgBId: string
  let studentAId: string
  let studentA2Id: string
  let instructorAId: string
  let instructorAClient: SupabaseClient
  let studentAClient: SupabaseClient
  let adminAClient: SupabaseClient
  let adminBClient: SupabaseClient
  let ppl: string
  const idsA: string[] = []
  const idsB: string[] = []

  beforeAll(async () => {
    orgAId = await createTestOrg({ admin, name: `RLS-C A ${suffix}`, slug: `rlsc-a-${suffix}` })
    orgBId = await createTestOrg({ admin, name: `RLS-C B ${suffix}`, slug: `rlsc-b-${suffix}` })
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
    await mk(orgAId, 'rlsc-adminA', 'admin', idsA)
    studentAId = await mk(orgAId, 'rlsc-sA', 'student', idsA)
    studentA2Id = await mk(orgAId, 'rlsc-sA2', 'student', idsA)
    instructorAId = await mk(orgAId, 'rlsc-iA', 'instructor', idsA)
    instructorAClient = await getAuthenticatedClient({
      email: `rlsc-iA-${suffix}@test.local`,
      password: pw,
    })
    await mk(orgBId, 'rlsc-adminB', 'admin', idsB)
    studentAClient = await getAuthenticatedClient({
      email: `rlsc-sA-${suffix}@test.local`,
      password: pw,
    })
    adminAClient = await getAuthenticatedClient({
      email: `rlsc-adminA-${suffix}@test.local`,
      password: pw,
    })
    adminBClient = await getAuthenticatedClient({
      email: `rlsc-adminB-${suffix}@test.local`,
      password: pw,
    })

    const { data } = await admin.from('courses').select('id').eq('code', 'PPL_A').single()
    ppl = data?.id as string
    const { error } = await admin.from('course_enrolments').insert([
      { organization_id: orgAId, user_id: studentAId, course_id: ppl },
      { organization_id: orgAId, user_id: studentA2Id, course_id: ppl },
      { organization_id: orgAId, user_id: instructorAId, course_id: ppl },
    ])
    if (error) throw new Error(`seed enrolments: ${error.message}`)
  })

  afterAll(async () => {
    await cleanupTestData({ admin, orgId: orgAId, userIds: idsA })
    await cleanupTestData({ admin, orgId: orgBId, userIds: idsB })
  })

  it('AC6: a student cannot INSERT into course_enrolments', async () => {
    const { error } = await studentAClient.from('course_enrolments').insert({
      organization_id: orgAId,
      user_id: studentAId,
      course_id: ppl,
    })
    expect(error?.code).toBe('42501')
  })

  it('AC6: a student cannot UPDATE course_enrolments', async () => {
    const { error } = await studentAClient
      .from('course_enrolments')
      .update({ deleted_at: new Date().toISOString() })
      .eq('user_id', studentAId)
    expect(error?.code).toBe('42501')
    const { data } = await admin
      .from('course_enrolments')
      .select('deleted_at')
      .eq('user_id', studentAId)
    expect(data?.length).toBeGreaterThan(0)
    expect(data?.every((r) => r.deleted_at === null)).toBe(true)
  })

  it('AC6: a student cannot DELETE from course_enrolments', async () => {
    const { error } = await studentAClient
      .from('course_enrolments')
      .delete()
      .eq('user_id', studentAId)
    expect(error?.code).toBe('42501')
    const { data } = await admin.from('course_enrolments').select('id').eq('user_id', studentAId)
    expect(data?.length).toBeGreaterThan(0)
  })

  it('AC6: a student cannot INSERT, UPDATE or DELETE courses', async () => {
    const ins = await studentAClient.from('courses').insert({
      code: `X${suffix.replace(/\W/g, '').toUpperCase()}`,
      name: 'x',
      short: 'x',
      sort_order: 9,
    })
    expect(ins.error?.code).toBe('42501')
    const upd = await studentAClient.from('courses').update({ name: 'hacked' }).eq('id', ppl)
    expect(upd.error?.code).toBe('42501')
    const del = await studentAClient.from('courses').delete().eq('id', ppl)
    expect(del.error?.code).toBe('42501')
    const { data } = await admin.from('courses').select('name').eq('id', ppl).single()
    expect(data?.name).toBe('PPL(A)')
  })

  it('AC7: a student reads only their own enrolments', async () => {
    const { data, error } = await studentAClient.from('course_enrolments').select('user_id')
    expect(error).toBeNull()
    expect(data?.length).toBeGreaterThan(0)
    expect(data?.every((r) => r.user_id === studentAId)).toBe(true)
  })

  it('AC7: an instructor reads own enrolments', async () => {
    const { data, error } = await instructorAClient.from('course_enrolments').select('user_id')
    expect(error).toBeNull()
    expect(data?.length).toBeGreaterThan(0)
    expect(data?.every((r) => r.user_id === instructorAId)).toBe(true)
  })

  describe('soft-deleted instructor', () => {
    // Restore in afterEach, not a finally: biome's noUnsafeFinally forbids throwing there.
    let instructorSoftDeleted = false

    afterEach(async () => {
      if (!instructorSoftDeleted) return
      const { data: restored, error } = await admin
        .from('users')
        .update({ deleted_at: null })
        .eq('id', instructorAId)
        .select('id')
      if (error) throw new Error(`[cleanup] restore instructor failed: ${error.message}`)
      if ((restored ?? []).length === 0) throw new Error('[cleanup] restore instructor: 0 rows')
      instructorSoftDeleted = false
    })

    it('AC7: a soft-deleted instructor reads no own enrolments', async () => {
      const { data: removed, error: delError } = await admin
        .from('users')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', instructorAId)
        .select('id')
      expect(delError).toBeNull()
      expect(removed).toHaveLength(1)
      instructorSoftDeleted = true
      const { data, error } = await instructorAClient.from('course_enrolments').select('id')
      expect(error).toBeNull()
      expect(data).toEqual([])
    })
  })

  it('AC7: a student does not see their own soft-deleted enrolment', async () => {
    const { data: deleted, error: delError } = await admin
      .from('course_enrolments')
      .update({ deleted_at: new Date().toISOString() })
      .eq('user_id', studentAId)
      .select('id')
    expect(delError).toBeNull()
    expect(deleted?.length).toBeGreaterThan(0)
    const { data, error } = await studentAClient.from('course_enrolments').select('id')
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('AC7: an admin reads enrolments of their own organization', async () => {
    const { data, error } = await adminAClient
      .from('course_enrolments')
      .select('user_id')
      .eq('organization_id', orgAId)
    expect(error).toBeNull()
    expect(data?.map((r) => r.user_id)).toContain(studentA2Id)
  })

  it('AC7: an admin of org B cannot read org A enrolments', async () => {
    const { data: seeded, error: seededError } = await admin
      .from('course_enrolments')
      .select('id')
      .eq('organization_id', orgAId)
      .is('deleted_at', null)
    expect(seededError).toBeNull()
    expect(seeded?.length).toBeGreaterThan(0)
    const { data, error } = await adminBClient
      .from('course_enrolments')
      .select('id')
      .eq('organization_id', orgAId)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('AC7: an admin does not see a soft-deleted enrolment of their own organization', async () => {
    const { data: deleted, error: delError } = await admin
      .from('course_enrolments')
      .update({ deleted_at: new Date().toISOString() })
      .eq('user_id', studentAId)
      .select('id')
    expect(delError).toBeNull()
    expect(deleted?.length).toBeGreaterThan(0)
    const { data: removed } = await admin
      .from('course_enrolments')
      .select('id')
      .eq('user_id', studentAId)
      .not('deleted_at', 'is', null)
    expect(removed?.length).toBeGreaterThan(0)
    const { data, error } = await adminAClient
      .from('course_enrolments')
      .select('id')
      .eq('user_id', studentAId)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('AC7: an authenticated user can read courses', async () => {
    const { data, error } = await studentAClient.from('courses').select('code')
    expect(error).toBeNull()
    expect(data?.map((c) => c.code)).toEqual(expect.arrayContaining(['PPL_A', 'VFR_RT', 'ATPL_A']))
  })
})
