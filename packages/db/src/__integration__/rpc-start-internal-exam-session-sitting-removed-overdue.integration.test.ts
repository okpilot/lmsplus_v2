import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupReferenceData, cleanupTestData } from './cleanup'
import { fixtureSuffix } from './fixture-suffix'
import { seedQuestions, seedReferenceData } from './seed'
import { createTestOrg, createTestUser, getAdminClient, getAuthenticatedClient } from './setup'

/**
 * #1777: sitting redeem gate edge cases on start_internal_exam_session.
 * A pass recorded by the overdue auto-complete counts; a soft-deleted entry makes the code not found.
 */
const admin = getAdminClient()
const suffix = fixtureSuffix()
const PW = 'test-pass-123'

type Res = { data: unknown; error: { message: string; code?: string } | null }
const msg = (r: Res) => r.error?.message ?? 'ok'
const must = <T = Record<string, unknown>>(r: Res, label: string): T => {
  expect(r.error, label).toBeNull()
  return r.data as T
}

describe('RPC: start_internal_exam_session sitting gate, removed entry and overdue pass (#1777)', () => {
  let orgId: string
  let adminId: string
  let subjectId: string
  let questionId: string
  let refs: Awaited<ReturnType<typeof seedReferenceData>>
  let n = 0
  const userIds: string[] = []

  async function student(tag: string) {
    const email = `${tag}-${++n}-${suffix}@test.local`
    const id = await createTestUser({ admin, orgId, email, password: PW, role: 'student' })
    userIds.push(id)
    return { id, client: await getAuthenticatedClient({ email, password: PW }) }
  }
  type Stu = Awaited<ReturnType<typeof student>>

  /** Open sitting + candidate + entry + live code for the student. */
  async function openWorld(s: Stu) {
    const sitting = must<{ id: string }>(
      await admin
        .from('exam_sittings')
        .insert({
          organization_id: orgId,
          scheduled_at: new Date(Date.now() - 1000).toISOString(),
          started_at: new Date(Date.now() - 1000).toISOString(),
          started_by: adminId,
          mode: 'remote',
          invigilator_id: adminId,
          created_by: adminId,
        })
        .select('id')
        .single(),
      'sitting',
    )
    must(
      await admin
        .from('exam_sitting_candidates')
        .insert({ organization_id: orgId, sitting_id: sitting.id, user_id: s.id })
        .select('id')
        .single(),
      'candidate',
    )
    const entry = must<{ id: string }>(
      await admin
        .from('exam_sitting_entries')
        .insert({
          organization_id: orgId,
          sitting_id: sitting.id,
          user_id: s.id,
          subject_id: subjectId,
        })
        .select('id')
        .single(),
      'entry',
    )
    const code = must<{ id: string; code: string }>(
      await admin
        .from('internal_exam_codes')
        .insert({
          code: `RO${suffix}${++n}`.slice(0, 30),
          subject_id: subjectId,
          student_id: s.id,
          issued_by: adminId,
          organization_id: orgId,
          sitting_entry_id: entry.id,
          expires_at: new Date(Date.now() + 7_200_000).toISOString(),
        })
        .select('id, code')
        .single(),
      'code',
    )
    return { entryId: entry.id, codeId: code.id, code: code.code }
  }
  const consumedAt = async (codeId: string) =>
    must<{ consumed_at: string | null }>(
      await admin.from('internal_exam_codes').select('consumed_at').eq('id', codeId).single(),
      'code row',
    ).consumed_at
  const sessionsOf = async (studentId: string) =>
    must<Array<{ id: string; ended_at: string | null }>>(
      await admin
        .from('quiz_sessions')
        .select('id, ended_at')
        .eq('student_id', studentId)
        .eq('mode', 'internal_exam')
        .is('deleted_at', null),
      'sessions',
    )
  const redeem = (s: Stu, code: string) =>
    s.client.rpc('start_internal_exam_session', { p_code: code }) as unknown as Promise<Res>

  beforeAll(async () => {
    orgId = await createTestOrg({ admin, name: `Redeem RO ${suffix}`, slug: `rg-ro-${suffix}` })
    adminId = await createTestUser({
      admin,
      orgId,
      email: `ro-adm-${suffix}@test.local`,
      password: PW,
      role: 'admin',
    })
    userIds.push(adminId)
    refs = await seedReferenceData({
      admin,
      subjectCode: `ROA${suffix}`,
      subjectName: `Redeem RO ${suffix}`,
      topicCode: `ROA${suffix}-01`,
      topicName: `Redeem RO Topic ${suffix}`,
    })
    subjectId = refs.subjectId
    await seedQuestions({
      admin,
      orgId,
      createdBy: adminId,
      subjectId,
      topicId: refs.topicId,
      count: 5,
    })
    const { data: qs, error: qErr } = await admin
      .from('questions')
      .select('id')
      .eq('subject_id', subjectId)
      .is('deleted_at', null)
      .limit(1)
    if (qErr || !qs?.[0]) throw new Error(`question lookup: ${qErr?.message}`)
    questionId = qs[0].id
    const { data: cfg, error } = await admin
      .from('exam_configs')
      .insert({
        organization_id: orgId,
        subject_id: subjectId,
        enabled: true,
        total_questions: 1,
        time_limit_seconds: 1800,
        pass_mark: 75,
      })
      .select('id')
      .single()
    if (error || !cfg) throw new Error(`exam_config: ${error?.message}`)
    const d = await admin.from('exam_config_distributions').insert({
      exam_config_id: cfg.id,
      topic_id: refs.topicId,
      subtopic_id: null,
      question_count: 1,
    })
    if (d.error) throw new Error(`distribution: ${d.error.message}`)
  })

  afterAll(async () => {
    const errors: unknown[] = []
    try {
      await cleanupTestData({ admin, orgId, userIds })
    } catch (e) {
      errors.push(e)
    }
    if (errors.length === 0) {
      try {
        await cleanupReferenceData({ admin, refs: [refs] })
      } catch (e) {
        errors.push(e)
      }
    }
    if (errors.length > 0) throw new AggregateError(errors, 'teardown failed')
  })

  it('refuses a sitting code while an overdue same-subject attempt is unfinished, leaving that attempt intact', async () => {
    const s = await student('ro-overdue')
    const w = await openWorld(s)
    const old = must<{ id: string }>(
      await admin
        .from('quiz_sessions')
        .insert({
          organization_id: orgId,
          student_id: s.id,
          mode: 'internal_exam',
          subject_id: subjectId,
          config: { pass_mark: 75, question_ids: [questionId] },
          total_questions: 1,
          time_limit_seconds: 60,
          started_at: new Date(Date.now() - 3_600_000).toISOString(),
        })
        .select('id')
        .single(),
      'overdue session',
    )
    must(
      (await admin.from('quiz_session_answers').insert({
        session_id: old.id,
        question_id: questionId,
        selected_option_id: 'a',
        response_time_ms: 1000,
        is_correct: true,
      })) as Res,
      'graded answer',
    )
    expect(msg(await redeem(s, w.code))).toBe('overdue_attempt_pending')
    expect(await consumedAt(w.codeId)).toBeNull()
    const sessions = await sessionsOf(s.id)
    expect(sessions).toHaveLength(1)
    expect(sessions[0]?.id).toBe(old.id)
    expect(sessions[0]?.ended_at).toBeNull()
  })

  it('raises code_not_found for a live code whose sitting entry was soft-deleted', async () => {
    const s = await student('ro-removed')
    const w = await openWorld(s)
    must(
      (await admin
        .from('exam_sitting_entries')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', w.entryId)
        .select('id')) as Res,
      'soft-delete entry',
    )
    const code = must<{ voided_at: string | null; deleted_at: string | null }>(
      await admin
        .from('internal_exam_codes')
        .select('voided_at, deleted_at')
        .eq('id', w.codeId)
        .single(),
      'code precondition',
    )
    expect(code).toEqual({ voided_at: null, deleted_at: null })
    expect(msg(await redeem(s, w.code))).toBe('code_not_found')
    expect(await consumedAt(w.codeId)).toBeNull()
    expect(await sessionsOf(s.id)).toEqual([])
  })
})
