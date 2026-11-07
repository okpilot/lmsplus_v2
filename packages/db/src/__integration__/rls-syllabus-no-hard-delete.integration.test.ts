import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupTestData } from './cleanup'
import { fixtureSuffix } from './fixture-suffix'
import { createTestOrg, createTestUser, getAdminClient, getAuthenticatedClient } from './setup'

/**
 * Syllabus tables are soft-delete only: an authenticated admin can neither hard DELETE
 * nor write deleted_at / deleted_by directly (only soft_delete_syllabus_item can).
 * Also: issue_internal_exam_code refuses a soft-deleted subject.
 */
describe('syllabus soft delete: privileges and readers', () => {
  const admin = getAdminClient()
  const suffix = fixtureSuffix()
  const userIds: string[] = []
  const subjectIds: string[] = []
  let orgId: string
  let adminId: string
  let studentId: string
  let adminClient: SupabaseClient
  let subjectId: string
  let topicId: string
  let subtopicId: string

  beforeAll(async () => {
    orgId = await createTestOrg({ admin, name: `SDG Org ${suffix}`, slug: `sd-grants-${suffix}` })
    adminId = await createTestUser({
      admin,
      orgId,
      email: `sdg-admin-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'admin',
    })
    studentId = await createTestUser({
      admin,
      orgId,
      email: `sdg-student-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(adminId, studentId)
    adminClient = await getAuthenticatedClient({
      email: `sdg-admin-${suffix}@test.local`,
      password: 'test-pass-123',
    })
    const code = `SDG${suffix}`
    const { data: s, error: sErr } = await admin
      .from('easa_subjects')
      .insert({ code, name: code, short: code, sort_order: 950 })
      .select('id')
      .single()
    if (sErr || !s) throw new Error(`subject: ${sErr?.message}`)
    subjectId = s.id as string
    subjectIds.push(subjectId)
    const { data: t, error: tErr } = await admin
      .from('easa_topics')
      .insert({ subject_id: subjectId, code: `${code}-T`, name: 'T', sort_order: 1 })
      .select('id')
      .single()
    if (tErr || !t) throw new Error(`topic: ${tErr?.message}`)
    topicId = t.id as string
    const { data: st, error: stErr } = await admin
      .from('easa_subtopics')
      .insert({ topic_id: topicId, code: `${code}-ST`, name: 'ST', sort_order: 1 })
      .select('id')
      .single()
    if (stErr || !st) throw new Error(`subtopic: ${stErr?.message}`)
    subtopicId = st.id as string
  })

  afterAll(async () => {
    await admin.from('internal_exam_codes').delete().eq('organization_id', orgId)
    await admin.from('exam_configs').delete().eq('organization_id', orgId)
    await cleanupTestData({ admin, orgId, userIds })
    await admin.from('easa_subtopics').delete().eq('topic_id', topicId)
    await admin.from('easa_topics').delete().eq('subject_id', subjectId)
    await admin.from('easa_subjects').delete().eq('id', subjectId)
  })

  const tables = () =>
    [
      [
        'easa_subjects',
        () => subjectId,
        { code: `SDX${suffix}`, name: 'x', short: 'x', sort_order: 951 },
      ],
      [
        'easa_topics',
        () => topicId,
        { subject_id: subjectId, code: `SDX-${suffix}`, name: 'x', sort_order: 9 },
      ],
      [
        'easa_subtopics',
        () => subtopicId,
        { topic_id: topicId, code: `SDX-${suffix}`, name: 'x', sort_order: 9 },
      ],
    ] as const

  it.each(['easa_subjects', 'easa_topics', 'easa_subtopics'] as const)(
    'rejects an authenticated admin hard DELETE on %s (42501) and keeps the row',
    async (table) => {
      const id = tables().find((t) => t[0] === table)?.[1]() as string
      const { error } = await adminClient.from(table).delete().eq('id', id)
      expect(error?.code).toBe('42501')
      const { data } = await admin.from(table).select('id').eq('id', id)
      expect(data).toHaveLength(1)
    },
  )

  it.each(['easa_subjects', 'easa_topics', 'easa_subtopics'] as const)(
    'rejects an authenticated admin UPDATE of deleted_at on %s (42501)',
    async (table) => {
      const id = tables().find((t) => t[0] === table)?.[1]() as string
      const { error } = await adminClient
        .from(table)
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
      expect(error?.code).toBe('42501')
    },
  )

  it.each(['easa_subjects', 'easa_topics', 'easa_subtopics'] as const)(
    'rejects an authenticated admin UPDATE of deleted_by on %s (42501)',
    async (table) => {
      const id = tables().find((t) => t[0] === table)?.[1]() as string
      const { error } = await adminClient.from(table).update({ deleted_by: adminId }).eq('id', id)
      expect(error?.code).toBe('42501')
    },
  )

  it.each(['easa_subjects', 'easa_topics', 'easa_subtopics'] as const)(
    'rejects an authenticated admin INSERT that sets deleted_at on %s (42501)',
    async (table) => {
      const base = tables().find((t) => t[0] === table)?.[2] as Record<string, unknown>
      const { error } = await adminClient
        .from(table)
        .insert({ ...base, deleted_at: new Date().toISOString() })
      expect(error?.code).toBe('42501')
    },
  )

  it.each(['easa_subjects', 'easa_topics', 'easa_subtopics'] as const)(
    'rejects an authenticated admin INSERT that sets deleted_by on %s (42501)',
    async (table) => {
      const base = tables().find((t) => t[0] === table)?.[2] as Record<string, unknown>
      const { error } = await adminClient.from(table).insert({ ...base, deleted_by: adminId })
      expect(error?.code).toBe('42501')
    },
  )

  it.each(['easa_topics', 'easa_subtopics'] as const)(
    'still lets an authenticated admin rename %s (granted columns keep working)',
    async (table) => {
      const id = tables().find((t) => t[0] === table)?.[1]() as string
      const { error } = await adminClient.from(table).update({ name: 'renamed' }).eq('id', id)
      expect(error).toBeNull()
    },
  )

  describe('issue_internal_exam_code', () => {
    it('refuses a soft-deleted subject even when its exam_config is live', async () => {
      const { error: cErr } = await admin.from('exam_configs').insert({
        organization_id: orgId,
        subject_id: subjectId,
        enabled: true,
        total_questions: 5,
        time_limit_seconds: 600,
        pass_mark: 75,
      })
      expect(cErr).toBeNull()
      // Positive control: a live subject issues a code.
      const ok = await adminClient.rpc('issue_internal_exam_code', {
        p_subject_id: subjectId,
        p_student_id: studentId,
      })
      expect(ok.error).toBeNull()
      await admin.from('internal_exam_codes').delete().eq('organization_id', orgId)

      const { error: dErr } = await admin
        .from('easa_subjects')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', subjectId)
      expect(dErr).toBeNull()
      const { error } = await adminClient.rpc('issue_internal_exam_code', {
        p_subject_id: subjectId,
        p_student_id: studentId,
      })
      expect(error?.message).toContain('subject_not_found')
    })
  })
})
