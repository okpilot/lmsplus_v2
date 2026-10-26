import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupReferenceData, cleanupTestData } from './cleanup'
import { fixtureSuffix } from './fixture-suffix'
import { seedQuestions, seedReferenceData } from './seed'
import { createTestOrg, createTestUser, getAdminClient, getAuthenticatedClient } from './setup'

/** question_comments scoped to visible questions (#1637 fixup: KL, KM). */

// Same shape as fetchQuestionComments (apps/web/app/app/quiz/actions/comment-queries.ts).
const COMMENT_SELECT = 'id, question_id, user_id, body, created_at, users!user_id(full_name, role)'

describe('RLS: question_comments follow question visibility', () => {
  const admin = getAdminClient()
  const suffix = fixtureSuffix()
  const pw = 'test-pass-123'

  let orgId: string
  let ppl: string
  let vfr: string
  let refs: Awaited<ReturnType<typeof seedReferenceData>>
  let questionId: string
  let commentByAuthor: string
  const userIds: string[] = []
  const ids: Record<string, string> = {}
  const clients: Record<string, SupabaseClient> = {}

  async function setEnrolments(userId: string, courseIds: string[]) {
    const { error: delErr } = await admin
      .from('course_enrolments')
      .update({ deleted_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('deleted_at', null)
    if (delErr) throw new Error(`setEnrolments clear: ${delErr.message}`)
    if (courseIds.length === 0) return
    const { error } = await admin
      .from('course_enrolments')
      .insert(courseIds.map((c) => ({ organization_id: orgId, user_id: userId, course_id: c })))
    if (error) throw new Error(`setEnrolments insert: ${error.message}`)
  }

  async function mk(tag: string, role: 'admin' | 'student', courses: string[]) {
    const email = `${tag}-${suffix}@test.local`
    const id = await createTestUser({ admin, orgId, email, password: pw, role })
    userIds.push(id)
    await setEnrolments(id, courses)
    ids[tag] = id
    clients[tag] = await getAuthenticatedClient({ email, password: pw })
  }

  async function readComments(tag: string) {
    const { data, error } = await (clients[tag] as SupabaseClient)
      .from('question_comments')
      .select(COMMENT_SELECT)
      .eq('question_id', questionId)
    if (error) throw new Error(`read ${tag}: ${error.message}`)
    return (data ?? []) as unknown as Array<{ id: string; user_id: string }>
  }

  beforeAll(async () => {
    orgId = await createTestOrg({ admin, name: `QC Scope ${suffix}`, slug: `qc-scope-${suffix}` })
    const { data: courses } = await admin.from('courses').select('id, code')
    const byCode = Object.fromEntries(
      (courses ?? []).map((c) => [c.code as string, c.id as string]),
    )
    ppl = byCode.PPL_A as string
    vfr = byCode.VFR_RT as string

    await mk('qc-admin', 'admin', [])
    await mk('qc-author', 'student', [ppl])
    await mk('qc-reader', 'student', [ppl])
    await mk('qc-rtonly', 'student', [vfr])

    refs = await seedReferenceData({
      admin,
      subjectCode: `QC${suffix}`,
      subjectName: `QC Scope ${suffix}`,
      topicCode: `QC${suffix}-01`,
      topicName: `QC Topic ${suffix}`,
      subtopicCode: `QC${suffix}-01.01`,
      subtopicName: `QC Subtopic ${suffix}`,
    })
    const seeded = await seedQuestions({
      admin,
      orgId,
      createdBy: ids['qc-admin'] as string,
      subjectId: refs.subjectId,
      topicId: refs.topicId,
      subtopicId: refs.subtopicId,
      count: 1,
    })
    questionId = seeded.questionIds[0] as string

    const { data, error } = await admin
      .from('question_comments')
      .insert({ question_id: questionId, user_id: ids['qc-author'], body: `seed ${suffix}` })
      .select('id')
      .single()
    if (error) throw new Error(`seed comment: ${error.message}`)
    commentByAuthor = data.id as string
  })

  afterAll(async () => {
    await admin.from('question_comments').delete().eq('question_id', questionId)
    await cleanupTestData({ admin, orgId, userIds })
    await cleanupReferenceData({ admin, refs: [refs] })
  })

  it('AC-C1: a VFR_RT-only student reads 0 comments on a PPL question and cannot insert one (42501)', async () => {
    expect(await readComments('qc-rtonly')).toEqual([])
    const { error } = await (clients['qc-rtonly'] as SupabaseClient)
      .from('question_comments')
      .insert({ question_id: questionId, user_id: ids['qc-rtonly'], body: 'blocked' })
    expect(error?.code).toBe('42501')
  })

  it('AC-C3: an enrolled same-org student reads another author comment and can post one', async () => {
    const rows = await readComments('qc-reader')
    expect(rows.map((r) => r.id)).toContain(commentByAuthor)
    const { error } = await (clients['qc-reader'] as SupabaseClient)
      .from('question_comments')
      .insert({ question_id: questionId, user_id: ids['qc-reader'], body: 'allowed' })
    expect(error).toBeNull()
  })

  it('AC-C4: a student unenrolled after commenting still reads their OWN comment', async () => {
    await setEnrolments(ids['qc-author'] as string, [vfr])
    const rows = await readComments('qc-author')
    expect(rows.map((r) => r.id)).toEqual([commentByAuthor])
    expect(rows.every((r) => r.user_id === ids['qc-author'])).toBe(true)
  })

  it('AC-C5: an admin deletes another user comment on a live question in their org', async () => {
    const { data, error } = await (clients['qc-admin'] as SupabaseClient)
      .from('question_comments')
      .delete()
      .eq('id', commentByAuthor)
      .select('id')
    expect(error).toBeNull()
    expect(data?.map((r) => r.id)).toEqual([commentByAuthor])
  })
})
