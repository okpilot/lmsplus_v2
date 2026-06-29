import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanupReferenceData, cleanupTestData } from './cleanup'
import { requireRpcResult, requireRpcRows } from './guards'
import { seedQuestions, seedReferenceData } from './seed'
import {
  createTestOrg,
  createTestUser,
  getAdminClient,
  getAnonClient,
  getAuthenticatedClient,
} from './setup'

// Single-active-session invariant (#1011, migs 136–142): a student may hold AT
// MOST ONE active (ended_at IS NULL AND deleted_at IS NULL) quiz_sessions row
// across ALL modes. Backstop = partial unique index
// uq_one_active_session_per_student. start_discovery_session (mig 137) creates a
// real ephemeral 'discovery' row; every start RPC (138–141) auto-soft-deletes an
// abandoned discovery row, then blocks on any OTHER active session it won't
// itself resume. This suite exercises the new RPC + the guard against the real
// local Postgres (mocked clients can't see the partial unique index or the CHECK
// widening).

type DiscoverySessionRow = {
  id: string
  mode: string
  subject_id: string | null
  config: { question_ids?: string[] }
  total_questions: number
  ended_at: string | null
  deleted_at: string | null
}

describe('RPC: start_discovery_session + single-active-session guard', () => {
  const admin = getAdminClient()
  let orgId: string
  let adminUserId: string
  let studentId: string
  let studentClient: SupabaseClient
  let questionIds: string[]
  let subjectId: string
  let topicId: string
  let refs: Awaited<ReturnType<typeof seedReferenceData>>
  const userIds: string[] = []
  const suffix = Date.now()

  // Insert an active session of an arbitrary mode for the test student directly
  // (service-role bypasses RLS, but NOT the partial unique index). Returns the id.
  const seedActiveSession = async (mode: string): Promise<string> => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .insert({ organization_id: orgId, student_id: studentId, mode, subject_id: subjectId })
      .select('id')
      .single()
    if (error || !data) throw new Error(`seedActiveSession(${mode}): ${error?.message}`)
    return data.id as string
  }

  // Read every active session this student currently holds (service-role).
  const readActiveSessions = async (): Promise<DiscoverySessionRow[]> => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .select('id, mode, subject_id, config, total_questions, ended_at, deleted_at')
      .eq('student_id', studentId)
      .is('ended_at', null)
      .is('deleted_at', null)
    if (error) throw new Error(`readActiveSessions: ${error.message}`)
    return requireRpcRows<DiscoverySessionRow>(data, 'readActiveSessions')
  }

  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `Test Org SingleActive ${suffix}`,
      slug: `test-single-active-${suffix}`,
    })

    adminUserId = await createTestUser({
      admin,
      orgId,
      email: `admin-sas-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'admin',
    })
    userIds.push(adminUserId)

    studentId = await createTestUser({
      admin,
      orgId,
      email: `student-sas-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(studentId)

    studentClient = await getAuthenticatedClient({
      email: `student-sas-${suffix}@test.local`,
      password: 'test-pass-123',
    })

    refs = await seedReferenceData({
      admin,
      subjectCode: `SAS${suffix}`,
      subjectName: `Single Active Subject ${suffix}`,
      topicCode: `SAS${suffix}-01`,
      topicName: `Single Active Topic ${suffix}`,
    })
    subjectId = refs.subjectId
    topicId = refs.topicId

    const seeded = await seedQuestions({
      admin,
      orgId,
      createdBy: adminUserId,
      subjectId,
      topicId,
      count: 5,
    })
    questionIds = seeded.questionIds

    // Minimal enabled exam_config (total=1, one distribution of 1) so
    // start_exam_session can reach its INSERT for the exam auto-clear test.
    const { data: cfg, error: cfgErr } = await admin
      .from('exam_configs')
      .insert({
        organization_id: orgId,
        subject_id: subjectId,
        enabled: true,
        total_questions: 1,
        time_limit_seconds: 600,
        pass_mark: 75,
      })
      .select('id')
      .single()
    if (cfgErr || !cfg) throw new Error(`seed exam_config: ${cfgErr?.message}`)
    const { error: distErr } = await admin.from('exam_config_distributions').insert({
      exam_config_id: cfg.id,
      topic_id: topicId,
      subtopic_id: null,
      question_count: 1,
    })
    if (distErr) throw new Error(`seed exam_config_distribution: ${distErr.message}`)
  })

  // The partial unique index allows only one active session per student, so each
  // test must leave a clean slate. Soft-delete every active session the student
  // holds (single cleanup step — no §7 per-step accumulator needed).
  afterEach(async () => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('student_id', studentId)
      .is('ended_at', null)
      .is('deleted_at', null)
      .select('id')
    if (error) throw new Error(`afterEach session cleanup: ${error.message}`)
    if ((data?.length ?? 0) > 0) {
      console.log(`[single-active-session] afterEach soft-deleted ${data?.length} session(s)`)
    }
  })

  afterAll(async () => {
    await cleanupTestData({ admin, orgId, userIds })
    await cleanupReferenceData({ admin, refs: [refs] })
  })

  it('creates exactly one active discovery session and a discovery.started audit event', async () => {
    const ids = questionIds.slice(0, 2)
    const { data, error } = await studentClient.rpc('start_discovery_session', {
      p_subject_id: subjectId,
      p_question_ids: ids,
    })
    expect(error).toBeNull()
    expect(typeof data).toBe('string')
    const sessionId = data as string

    const active = await readActiveSessions()
    expect(active).toHaveLength(1)
    expect(active[0]?.id).toBe(sessionId)
    expect(active[0]?.mode).toBe('discovery')
    expect(active[0]?.subject_id).toBe(subjectId)
    expect(active[0]?.config.question_ids).toEqual(ids)
    expect(active[0]?.total_questions).toBe(2)

    const { data: events, error: evErr } = await admin
      .from('audit_events')
      .select('event_type, resource_type, resource_id')
      .eq('resource_id', sessionId)
    expect(evErr).toBeNull()
    const evRows = requireRpcRows<{ event_type: string; resource_type: string }>(events, 'audit')
    expect(evRows).toHaveLength(1)
    expect(evRows[0]?.event_type).toBe('discovery.started')
    expect(evRows[0]?.resource_type).toBe('quiz_session')
  })

  it('serves Study Mode answer keys while the student holds their own active discovery session', async () => {
    // Gap C positive control (mig 142). Discovery is a REAL active session
    // (start_discovery_session, mig 137); the Study UI then reads the answer keys
    // via get_study_questions for the SAME ids. Mig 142 widened the mid-exam
    // answer-oracle guard's practice allowlist to include 'discovery', so a
    // student's own discovery row does NOT self-trip 'active_exam_session'. A
    // regression dropping 'discovery' from that allowlist would make this call
    // raise and break Study Mode — this test guards it.
    const ids = questionIds.slice(0, 3)
    const startRes = await studentClient.rpc('start_discovery_session', {
      p_subject_id: subjectId,
      p_question_ids: ids,
    })
    expect(startRes.error).toBeNull()
    // Non-vacuity: the discovery session genuinely exists and is the only active one.
    const active = await readActiveSessions()
    expect(active).toHaveLength(1)
    expect(active[0]?.mode).toBe('discovery')

    // Study Mode key read SUCCEEDS despite the active discovery session.
    const { data, error } = await studentClient.rpc('get_study_questions', {
      p_question_ids: ids,
    })
    expect(error).toBeNull()
    const rows = requireRpcRows<{ id: string; correct_option_id: string | null }>(
      data,
      'get_study_questions',
    )
    expect(rows).toHaveLength(ids.length)
    // The answer key is DELIBERATELY returned in Study Mode (seed key is 'b').
    for (const row of rows) {
      expect(ids).toContain(row.id)
      expect(row.correct_option_id).toBe('b')
    }
  })

  it('replaces the prior discovery session when started again, leaving exactly one active', async () => {
    const first = await studentClient.rpc('start_discovery_session', {
      p_subject_id: subjectId,
      p_question_ids: questionIds.slice(0, 1),
    })
    expect(first.error).toBeNull()
    const firstId = first.data as string
    // Non-vacuity: the first call genuinely created one active discovery row.
    expect((await readActiveSessions()).map((s) => s.id)).toEqual([firstId])

    const second = await studentClient.rpc('start_discovery_session', {
      p_subject_id: subjectId,
      p_question_ids: questionIds.slice(0, 2),
    })
    expect(second.error).toBeNull()
    const secondId = second.data as string

    // Exactly one active discovery row remains — the second; the first is soft-deleted.
    const active = await readActiveSessions()
    expect(active).toHaveLength(1)
    expect(active[0]?.id).toBe(secondId)
    expect(secondId).not.toBe(firstId)

    const { data: firstRow, error: firstRowErr } = await admin
      .from('quiz_sessions')
      .select('deleted_at')
      .eq('id', firstId)
      .single()
    expect(firstRowErr).toBeNull()
    expect(firstRow?.deleted_at).not.toBeNull()
  })

  it('rejects a discovery start while another active session exists (another_session_active)', async () => {
    // Seed an active quick_quiz so the OTHER-mode guard fires.
    const quizId = await seedActiveSession('quick_quiz')
    // Non-vacuity: the blocking session genuinely exists and is active.
    const before = await readActiveSessions()
    expect(before.map((s) => s.id)).toContain(quizId)

    const { data, error } = await studentClient.rpc('start_discovery_session', {
      p_subject_id: subjectId,
      p_question_ids: questionIds.slice(0, 1),
    })
    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/another_session_active/i)
    expect(data).toBeNull()

    // No discovery row was created — the quick_quiz remains the only active session.
    const after = await readActiveSessions()
    expect(after.map((s) => s.mode)).not.toContain('discovery')
    expect(after.map((s) => s.id)).toEqual([quizId])
  })

  it('rejects an unauthenticated discovery start (not_authenticated)', async () => {
    const anon = getAnonClient()
    const { data, error } = await anon.rpc('start_discovery_session', {
      p_subject_id: subjectId,
      p_question_ids: questionIds.slice(0, 1),
    })
    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/not_authenticated/i)
    expect(data).toBeNull()
  })

  it('rejects an empty question array with no_questions_provided', async () => {
    const { error } = await studentClient.rpc('start_discovery_session', {
      p_subject_id: subjectId,
      p_question_ids: [],
    })
    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/no_questions_provided/i)
  })

  it('rejects a non-existent question id with invalid_question_ids', async () => {
    const { error } = await studentClient.rpc('start_discovery_session', {
      p_subject_id: subjectId,
      p_question_ids: ['00000000-0000-0000-0000-000000000000'],
    })
    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/invalid_question_ids/i)
  })

  it('auto-clears an abandoned discovery session when a practice quiz starts', async () => {
    const discoveryId = await seedActiveSession('discovery')
    // Non-vacuity: the discovery row is genuinely active before the practice start.
    const before = await readActiveSessions()
    expect(before.map((s) => s.id)).toEqual([discoveryId])

    const { data, error } = await studentClient.rpc('start_quiz_session', {
      p_mode: 'quick_quiz',
      p_subject_id: subjectId,
      p_topic_id: topicId,
      p_question_ids: questionIds.slice(0, 2),
    })
    expect(error).toBeNull()
    expect(typeof data).toBe('string')
    const quizId = data as string

    // The discovery row is soft-deleted (not ended); the new quick_quiz is the
    // only active session.
    const { data: discRow, error: discErr } = await admin
      .from('quiz_sessions')
      .select('ended_at, deleted_at')
      .eq('id', discoveryId)
      .single()
    expect(discErr).toBeNull()
    expect(discRow?.deleted_at).not.toBeNull()
    expect(discRow?.ended_at).toBeNull()

    const active = await readActiveSessions()
    expect(active).toHaveLength(1)
    expect(active[0]?.id).toBe(quizId)
    expect(active[0]?.mode).toBe('quick_quiz')
  })

  it('auto-clears an abandoned discovery session when an exam starts', async () => {
    const discoveryId = await seedActiveSession('discovery')
    // Non-vacuity: the discovery row is genuinely active before the exam start.
    expect((await readActiveSessions()).map((s) => s.id)).toEqual([discoveryId])

    const { data, error } = await studentClient.rpc('start_exam_session', {
      p_subject_id: subjectId,
    })
    expect(error).toBeNull()
    const result = requireRpcResult<{ session_id: string }>(data, 'start_exam_session')
    expect(typeof result.session_id).toBe('string')

    // The discovery row is soft-deleted; the new mock_exam is the only active session.
    const { data: discRow, error: discErr } = await admin
      .from('quiz_sessions')
      .select('ended_at, deleted_at')
      .eq('id', discoveryId)
      .single()
    expect(discErr).toBeNull()
    expect(discRow?.deleted_at).not.toBeNull()
    expect(discRow?.ended_at).toBeNull()

    const active = await readActiveSessions()
    expect(active).toHaveLength(1)
    expect(active[0]?.id).toBe(result.session_id)
    expect(active[0]?.mode).toBe('mock_exam')
  })

  it('rejects a practice quiz start while an exam session is active (another_session_active)', async () => {
    const examId = await seedActiveSession('mock_exam')
    // Non-vacuity: the exam session genuinely exists and is active.
    expect((await readActiveSessions()).map((s) => s.id)).toContain(examId)

    const { data, error } = await studentClient.rpc('start_quiz_session', {
      p_mode: 'quick_quiz',
      p_subject_id: subjectId,
      p_topic_id: topicId,
      p_question_ids: questionIds.slice(0, 2),
    })
    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/another_session_active/i)
    expect(data).toBeNull()

    // No practice session was created — the exam remains the only active session.
    const active = await readActiveSessions()
    expect(active.map((s) => s.id)).toEqual([examId])
    expect(active.map((s) => s.mode)).not.toContain('quick_quiz')
  })

  it('blocks a direct second active session insert via the global unique index (23505)', async () => {
    const firstId = await seedActiveSession('quick_quiz')
    // Non-vacuity: the first active session exists.
    expect((await readActiveSessions()).map((s) => s.id)).toEqual([firstId])

    // A second active session for the SAME student violates
    // uq_one_active_session_per_student even via the service role (the index is a
    // hard schema constraint, not an RLS policy).
    const { data, error } = await admin
      .from('quiz_sessions')
      .insert({ organization_id: orgId, student_id: studentId, mode: 'mock_exam' })
      .select('id')
    expect(data).toBeNull()
    expect(error).not.toBeNull()
    expect(error?.code).toBe('23505')
    expect(error?.message ?? '').toMatch(/uq_one_active_session_per_student/i)
  })
})
