import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupReferenceData, cleanupTestData } from './cleanup'
import { fixtureSuffix } from './fixture-suffix'
import { seedReferenceData } from './seed'
import { createTestOrg, createTestUser, getAdminClient, getAuthenticatedClient } from './setup'
import { getRtRefs } from './vfr-rt-helpers'

/** exam_configs follow enrolment (#1637 addendum, AC-E1..AC-E7). */

const EXAM_SUBJECTS_SELECT =
  'subject_id, total_questions, time_limit_seconds, pass_mark, easa_subjects(id, code, name, short)'

describe('RLS: exam_configs follow enrolment', () => {
  const admin = getAdminClient()
  const suffix = fixtureSuffix()
  const pw = 'test-pass-123'

  let orgId: string
  let rtSubjectId: string
  let refs: Awaited<ReturnType<typeof seedReferenceData>>
  let refs2: Awaited<ReturnType<typeof seedReferenceData>>
  let pplConfigId: string
  let rtConfigId: string
  let ppl: string
  let vfr: string
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

  async function mk(tag: string, role: 'admin' | 'instructor' | 'student', courses: string[]) {
    const email = `${tag}-${suffix}@test.local`
    const id = await createTestUser({ admin, orgId, email, password: pw, role })
    userIds.push(id)
    await setEnrolments(id, courses)
    ids[tag] = id
    clients[tag] = await getAuthenticatedClient({ email, password: pw })
  }

  async function configIds(tag: string): Promise<string[]> {
    const { data, error } = await (clients[tag] as SupabaseClient).from('exam_configs').select('id')
    if (error) throw new Error(`exam_configs: ${error.message}`)
    return (data ?? []).map((r) => r.id as string)
  }

  beforeAll(async () => {
    orgId = await createTestOrg({ admin, name: `Exam Cfg ${suffix}`, slug: `exam-cfg-${suffix}` })
    const { data: courses } = await admin.from('courses').select('id, code')
    const byCode = Object.fromEntries(
      (courses ?? []).map((c) => [c.code as string, c.id as string]),
    )
    ppl = byCode.PPL_A as string
    vfr = byCode.VFR_RT as string

    await mk('ec-admin', 'admin', [])
    await mk('ec-instr', 'instructor', [])
    await mk('ec-rt', 'student', [vfr])
    await mk('ec-both', 'student', [ppl, vfr])
    await mk('ec-ppl', 'student', [ppl])
    await mk('ec-unenrolled', 'student', [ppl])

    refs = await seedReferenceData({
      admin,
      subjectCode: `EC${suffix}`,
      subjectName: `Exam Cfg ${suffix}`,
      topicCode: `EC${suffix}-01`,
      topicName: `Exam Cfg Topic ${suffix}`,
      subtopicCode: `EC${suffix}-01.01`,
      subtopicName: `Exam Cfg Subtopic ${suffix}`,
    })
    refs2 = await seedReferenceData({
      admin,
      subjectCode: `ED${suffix}`,
      subjectName: `Exam Cfg 2 ${suffix}`,
      topicCode: `ED${suffix}-01`,
      topicName: `Exam Cfg 2 Topic ${suffix}`,
      subtopicCode: `ED${suffix}-01.01`,
      subtopicName: `Exam Cfg 2 Subtopic ${suffix}`,
    })
    rtSubjectId = (await getRtRefs()).rtSubjectId

    const base = { organization_id: orgId, enabled: true, time_limit_seconds: 1800, pass_mark: 75 }
    const p = await admin
      .from('exam_configs')
      .insert({ ...base, subject_id: refs.subjectId, total_questions: 16 })
      .select('id')
      .single()
    if (p.error) throw new Error(`ppl config: ${p.error.message}`)
    pplConfigId = p.data.id as string
    const r = await admin
      .from('exam_configs')
      .insert({ ...base, subject_id: rtSubjectId, total_questions: 25 })
      .select('id')
      .single()
    if (r.error) throw new Error(`rt config: ${r.error.message}`)
    rtConfigId = r.data.id as string
  })

  afterAll(async () => {
    await cleanupTestData({ admin, orgId, userIds })
    await cleanupReferenceData({ admin, refs: [refs, refs2] })
  })

  it('AC-E1: a VFR_RT-only student reads 0 PPL configs and reads the RT config', async () => {
    const found = await admin.from('exam_configs').select('id').eq('id', pplConfigId)
    expect(found.data?.length).toBe(1)
    const got = await configIds('ec-rt')
    expect(got).not.toContain(pplConfigId)
    expect(got).toContain(rtConfigId)
  })

  it('AC-E2: a PPL+RT student reads both configs', async () => {
    const got = await configIds('ec-both')
    expect(got).toContain(pplConfigId)
    expect(got).toContain(rtConfigId)
  })

  it.each(['ec-admin', 'ec-instr'])(
    'AC-E3: %s reads every enabled config in the org',
    async (tag) => {
      const got = await configIds(tag)
      expect(got).toContain(pplConfigId)
      expect(got).toContain(rtConfigId)
    },
  )

  it('AC-E4: an admin inserts an exam_configs row with RETURNING', async () => {
    const { data, error } = await (clients['ec-admin'] as SupabaseClient)
      .from('exam_configs')
      .insert({
        organization_id: orgId,
        subject_id: refs2.subjectId,
        enabled: true,
        total_questions: 10,
        time_limit_seconds: 600,
        pass_mark: 70,
      })
      .select('id')
    expect(error).toBeNull()
    expect(data?.length).toBe(1)
  })

  it('AC-E5: the getExamEnabledSubjects select returns only PPL subjects for a PPL-only student', async () => {
    const c = clients['ec-ppl'] as SupabaseClient
    const { data, error } = await c
      .from('exam_configs')
      .select(EXAM_SUBJECTS_SELECT)
      .eq('enabled', true)
      .is('deleted_at', null)
      .order('subject_id')
    expect(error).toBeNull()
    const subjectIds = (data ?? []).map((r) => r.subject_id as string)
    expect(subjectIds).toContain(refs.subjectId)
    expect(subjectIds).not.toContain(rtSubjectId)

    // Non-vacuity: the RT config exists for the service role, hidden from the student.
    const svc = await admin.from('exam_configs').select('id').eq('id', rtConfigId)
    expect(svc.data?.length).toBe(1)
    const direct = await c.from('exam_configs').select('id').eq('id', rtConfigId)
    expect(direct.error).toBeNull()
    expect(direct.data).toEqual([])
  })

  it('AC-E6: a student whose PPL_A enrolment is soft-deleted reads 0 PPL configs', async () => {
    const got = await configIds('ec-unenrolled')
    expect(got).toContain(pplConfigId)
    await setEnrolments(ids['ec-unenrolled'] as string, [])
    const after = await configIds('ec-unenrolled')
    expect(after).not.toContain(pplConfigId)
    expect(after).toEqual([])
  })

  it('AC-E7: an admin still reads and inserts exam_config_distributions rows', async () => {
    const c = clients['ec-admin'] as SupabaseClient
    const ins = await c
      .from('exam_config_distributions')
      .insert({ exam_config_id: pplConfigId, topic_id: refs.topicId, question_count: 5 })
      .select('id')
    expect(ins.error).toBeNull()
    expect(ins.data?.length).toBe(1)
    const read = await c
      .from('exam_config_distributions')
      .select('id')
      .eq('exam_config_id', pplConfigId)
    expect(read.error).toBeNull()
    expect(read.data?.length).toBe(1)
  })
})
