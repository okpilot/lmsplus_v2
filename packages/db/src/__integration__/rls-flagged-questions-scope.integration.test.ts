import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupReferenceData, cleanupTestData } from './cleanup'
import { fixtureSuffix } from './fixture-suffix'
import { seedQuestions, seedReferenceData } from './seed'
import { createTestOrg, createTestUser, getAdminClient, getAuthenticatedClient } from './setup'

/** flagged_questions writes require a question visible to the caller (#1177, vector KZ). */

describe('RLS: flagged_questions INSERT/UPDATE follow question visibility', () => {
  const admin = getAdminClient()
  const suffix = fixtureSuffix()
  const pw = 'test-pass-123'

  let orgId: string
  let otherOrgId: string
  let ppl: string
  let vfr: string
  let refs: Awaited<ReturnType<typeof seedReferenceData>>
  let otherRefs: Awaited<ReturnType<typeof seedReferenceData>>
  let visibleQ: string
  let deletedQ: string
  let updateQ: string
  let unflagQ: string
  let crossOrgQ: string
  const userIds: string[] = []
  const otherUserIds: string[] = []
  const ids: Record<string, string> = {}
  const clients: Record<string, SupabaseClient> = {}

  async function mk(tag: string, courses: string[]) {
    const email = `${tag}-${suffix}@test.local`
    const id = await createTestUser({ admin, orgId, email, password: pw, role: 'student' })
    userIds.push(id)
    const { error: delErr } = await admin
      .from('course_enrolments')
      .update({ deleted_at: new Date().toISOString() })
      .eq('user_id', id)
      .is('deleted_at', null)
    if (delErr) throw new Error(`clear enrolments ${tag}: ${delErr.message}`)
    if (courses.length > 0) {
      const { error } = await admin
        .from('course_enrolments')
        .insert(courses.map((c) => ({ organization_id: orgId, user_id: id, course_id: c })))
      if (error) throw new Error(`enrol ${tag}: ${error.message}`)
    }
    ids[tag] = id
    clients[tag] = await getAuthenticatedClient({ email, password: pw })
  }

  async function flagRow(studentId: string, questionId: string) {
    const { data, error } = await admin
      .from('flagged_questions')
      .select('student_id, question_id, deleted_at')
      .eq('student_id', studentId)
      .eq('question_id', questionId)
    if (error) throw new Error(`flagRow: ${error.message}`)
    return data ?? []
  }

  beforeAll(async () => {
    orgId = await createTestOrg({ admin, name: `FQ Scope ${suffix}`, slug: `fq-scope-${suffix}` })
    otherOrgId = await createTestOrg({
      admin,
      name: `FQ Other ${suffix}`,
      slug: `fq-other-${suffix}`,
    })
    const { data: courses } = await admin.from('courses').select('id, code')
    const byCode = Object.fromEntries(
      (courses ?? []).map((c) => [c.code as string, c.id as string]),
    )
    ppl = byCode.PPL_A as string
    vfr = byCode.VFR_RT as string

    await mk('fq-admin', [])
    await mk('fq-student', [ppl])
    await mk('fq-rtonly', [vfr])
    const otherAdmin = await createTestUser({
      admin,
      orgId: otherOrgId,
      email: `fq-otheradmin-${suffix}@test.local`,
      password: pw,
      role: 'admin',
    })
    otherUserIds.push(otherAdmin)

    refs = await seedReferenceData({
      admin,
      subjectCode: `FQ${suffix}`,
      subjectName: `FQ Scope ${suffix}`,
      topicCode: `FQ${suffix}-01`,
      topicName: `FQ Topic ${suffix}`,
      subtopicCode: `FQ${suffix}-01.01`,
      subtopicName: `FQ Subtopic ${suffix}`,
    })
    otherRefs = await seedReferenceData({
      admin,
      subjectCode: `FO${suffix}`,
      subjectName: `FQ Other ${suffix}`,
      topicCode: `FO${suffix}-01`,
      topicName: `FQ Other Topic ${suffix}`,
      subtopicCode: `FO${suffix}-01.01`,
      subtopicName: `FQ Other Subtopic ${suffix}`,
    })
    const seeded = await seedQuestions({
      admin,
      orgId,
      createdBy: ids['fq-admin'] as string,
      subjectId: refs.subjectId,
      topicId: refs.topicId,
      subtopicId: refs.subtopicId,
      count: 4,
    })
    ;[visibleQ, deletedQ, updateQ, unflagQ] = seeded.questionIds as [string, string, string, string]
    const other = await seedQuestions({
      admin,
      orgId: otherOrgId,
      createdBy: otherAdmin,
      subjectId: otherRefs.subjectId,
      topicId: otherRefs.topicId,
      subtopicId: otherRefs.subtopicId,
      count: 1,
    })
    crossOrgQ = other.questionIds[0] as string

    const { error: delErr } = await admin
      .from('questions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', deletedQ)
    if (delErr) throw new Error(`soft-delete question: ${delErr.message}`)

    const { error: seedErr } = await admin.from('flagged_questions').insert([
      { student_id: ids['fq-student'], question_id: updateQ },
      { student_id: ids['fq-student'], question_id: unflagQ },
    ])
    if (seedErr) throw new Error(`seed flags: ${seedErr.message}`)
  })

  afterAll(async () => {
    await admin
      .from('flagged_questions')
      .delete()
      .in('student_id', [...userIds, ...otherUserIds])
    await cleanupTestData({ admin, orgId, userIds })
    await cleanupTestData({ admin, orgId: otherOrgId, userIds: otherUserIds })
    await cleanupReferenceData({ admin, refs: [refs, otherRefs] })
  })

  it('AC-KZ1: a student cannot flag a cross-org question (42501, no row)', async () => {
    const { error } = await (clients['fq-student'] as SupabaseClient)
      .from('flagged_questions')
      .insert({ student_id: ids['fq-student'], question_id: crossOrgQ })
    expect(error?.code).toBe('42501')
    expect(await flagRow(ids['fq-student'] as string, crossOrgQ)).toEqual([])
  })

  it('AC-KZ2: a student cannot flag a question in a subject they are not enrolled in (42501, no row)', async () => {
    const { error } = await (clients['fq-rtonly'] as SupabaseClient)
      .from('flagged_questions')
      .insert({ student_id: ids['fq-rtonly'], question_id: visibleQ })
    expect(error?.code).toBe('42501')
    expect(await flagRow(ids['fq-rtonly'] as string, visibleQ)).toEqual([])
  })

  it('AC-KZ3: a student cannot flag a soft-deleted question (42501, no row)', async () => {
    const { error } = await (clients['fq-student'] as SupabaseClient)
      .from('flagged_questions')
      .insert({ student_id: ids['fq-student'], question_id: deletedQ })
    expect(error?.code).toBe('42501')
    expect(await flagRow(ids['fq-student'] as string, deletedQ)).toEqual([])
  })

  it('AC-KZ4: a student cannot repoint an active flag at a cross-org question (42501, row unchanged)', async () => {
    expect(await flagRow(ids['fq-student'] as string, updateQ)).toHaveLength(1)
    const { error } = await (clients['fq-student'] as SupabaseClient)
      .from('flagged_questions')
      .update({ question_id: crossOrgQ })
      .eq('student_id', ids['fq-student'])
      .eq('question_id', updateQ)
    expect(error?.code).toBe('42501')
    expect(await flagRow(ids['fq-student'] as string, updateQ)).toHaveLength(1)
    expect(await flagRow(ids['fq-student'] as string, crossOrgQ)).toEqual([])
  })

  it('AC-KZ-control-flag: a student flags and re-flags a visible question', async () => {
    const c = clients['fq-student'] as SupabaseClient
    const first = await c
      .from('flagged_questions')
      .upsert({ student_id: ids['fq-student'], question_id: visibleQ, deleted_at: null })
    expect(first.error).toBeNull()
    const unflag = await c
      .from('flagged_questions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('student_id', ids['fq-student'])
      .eq('question_id', visibleQ)
    expect(unflag.error).toBeNull()
    const again = await c
      .from('flagged_questions')
      .upsert({ student_id: ids['fq-student'], question_id: visibleQ, deleted_at: null })
    expect(again.error).toBeNull()
    const rows = await flagRow(ids['fq-student'] as string, visibleQ)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.deleted_at).toBeNull()
  })

  it('AC-KZ-control-unflag: a student unflags a flag whose question was soft-deleted afterwards', async () => {
    const { error: delErr } = await admin
      .from('questions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', unflagQ)
    expect(delErr).toBeNull()
    const { error } = await (clients['fq-student'] as SupabaseClient)
      .from('flagged_questions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('student_id', ids['fq-student'])
      .eq('question_id', unflagQ)
    expect(error).toBeNull()
    const rows = await flagRow(ids['fq-student'] as string, unflagQ)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.deleted_at).not.toBeNull()
  })
})
