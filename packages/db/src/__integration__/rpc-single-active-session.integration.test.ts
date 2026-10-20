import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanupReferenceData, cleanupTestData } from './cleanup'
import { fixtureSuffix } from './fixture-suffix'
import { requireRpcResult, requireRpcRows } from './guards'
import { seedQuestions, seedReferenceData } from './seed'
import { createTestOrg, createTestUser, getAdminClient, getAuthenticatedClient } from './setup'

// Single-active-session invariant (#1011, migs 136–142): a student may hold AT
// MOST ONE active (ended_at IS NULL AND deleted_at IS NULL) quiz_sessions row
// across ALL modes. Backstop = partial unique index
// uq_one_active_session_per_student; every start RPC auto-soft-deletes an
// abandoned discovery row, then blocks on any OTHER active session it won't
// itself resume. This suite exercises the guard against the real local Postgres
// (mocked clients can't see the partial unique index or the CHECK widening).

type ActiveSessionRow = {
  id: string
  mode: string
}

describe('single-active-session guard across modes', () => {
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
  const suffix = fixtureSuffix()

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
  const readActiveSessions = async (): Promise<ActiveSessionRow[]> => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .select('id, mode')
      .eq('student_id', studentId)
      .is('ended_at', null)
      .is('deleted_at', null)
    if (error) throw new Error(`readActiveSessions: ${error.message}`)
    return requireRpcRows<ActiveSessionRow>(data, 'readActiveSessions')
  }

  // Draw up to `count` questions from the seeded subject via start_discovery.
  const startDiscovery = (client: SupabaseClient, count: number) =>
    client.rpc('start_discovery', {
      p_subject_id: subjectId,
      p_topic_ids: null,
      p_subtopic_ids: null,
      p_count: count,
      p_filters: null,
    })

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

  it('rejects a discovery start when another session is already active', async () => {
    // Seed an active quick_quiz so the OTHER-mode guard fires.
    const quizId = await seedActiveSession('quick_quiz')
    // Non-vacuity: the blocking session genuinely exists and is active.
    const before = await readActiveSessions()
    expect(before.map((s) => s.id)).toContain(quizId)

    const { data, error } = await startDiscovery(studentClient, 1)
    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/another_session_active/i)
    expect(data).toBeNull()

    // No discovery row was created — the quick_quiz remains the only active session.
    const after = await readActiveSessions()
    expect(after.map((s) => s.mode)).not.toContain('discovery')
    expect(after.map((s) => s.id)).toEqual([quizId])
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

  it('rejects a practice quiz start while an exam session is active', async () => {
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

  it('rejects a second active session insert for the same student', async () => {
    const firstId = await seedActiveSession('quick_quiz')
    // Non-vacuity: the first active session exists.
    expect((await readActiveSessions()).map((s) => s.id)).toEqual([firstId])

    // A second active session for the SAME student violates
    // uq_one_active_session_per_student even via the service role (the index is a
    // hard schema constraint, not an RLS policy).
    const { data, error } = await admin
      .from('quiz_sessions')
      .insert({
        organization_id: orgId,
        student_id: studentId,
        subject_id: subjectId,
        mode: 'mock_exam',
      })
      .select('id')
    expect(data).toBeNull()
    expect(error).not.toBeNull()
    expect(error?.code).toBe('23505')
    expect(error?.message ?? '').toMatch(/uq_one_active_session_per_student/i)
  })
})
