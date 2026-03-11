import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  cleanupTestData,
  createTestOrg,
  createTestUser,
  getAdminClient,
  getAuthenticatedClient,
  seedQuestions,
  seedReferenceData,
} from './setup'

describe('RPC: complete_quiz_session', () => {
  const admin = getAdminClient()
  let orgId: string
  let adminUserId: string
  let studentClient: SupabaseClient
  let questionIds: string[]
  const userIds: string[] = []
  const suffix = Date.now()

  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `Test Org Complete ${suffix}`,
      slug: `test-complete-${suffix}`,
    })

    adminUserId = await createTestUser({
      admin,
      orgId,
      email: `admin-complete-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'admin',
    })
    userIds.push(adminUserId)

    const studentId = await createTestUser({
      admin,
      orgId,
      email: `student-complete-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(studentId)

    studentClient = await getAuthenticatedClient({
      email: `student-complete-${suffix}@test.local`,
      password: 'test-pass-123',
    })

    const refs = await seedReferenceData({
      admin,
      subjectCode: `C${suffix}`,
      subjectName: `Complete Subject ${suffix}`,
      topicCode: `C${suffix}-01`,
      topicName: `Complete Topic ${suffix}`,
    })

    const seeded = await seedQuestions({
      admin,
      orgId,
      createdBy: adminUserId,
      subjectId: refs.subjectId,
      topicId: refs.topicId,
      count: 3,
    })
    questionIds = seeded.questionIds
  })

  afterAll(async () => {
    await cleanupTestData({ admin, orgId, userIds })
  })

  async function startAndAnswer(opts: {
    correctCount: number
    totalCount: number
  }) {
    const qIds = questionIds.slice(0, opts.totalCount)
    const { data: sessionId } = await studentClient.rpc('start_quiz_session', {
      p_mode: 'quick_quiz',
      p_subject_id: null,
      p_topic_id: null,
      p_question_ids: qIds,
    })

    for (let i = 0; i < opts.totalCount; i++) {
      const isCorrect = i < opts.correctCount
      await studentClient.rpc('submit_quiz_answer', {
        p_session_id: sessionId,
        p_question_id: qIds[i],
        p_selected_option: isCorrect ? 'b' : 'a', // 'b' is correct
        p_response_time_ms: 2000,
      })
    }

    return sessionId as string
  }

  it('calculates correct score (2/3 = 66.67%)', async () => {
    const sessionId = await startAndAnswer({
      correctCount: 2,
      totalCount: 3,
    })

    const { data, error } = await studentClient.rpc('complete_quiz_session', {
      p_session_id: sessionId,
    })
    expect(error).toBeNull()
    expect(data?.[0].total_questions).toBe(3)
    expect(data?.[0].correct_count).toBe(2)
    expect(Number(data?.[0].score_percentage)).toBeCloseTo(66.67, 1)
  })

  it('sets ended_at on session', async () => {
    const sessionId = await startAndAnswer({
      correctCount: 1,
      totalCount: 1,
    })

    await studentClient.rpc('complete_quiz_session', {
      p_session_id: sessionId,
    })

    const { data: session } = await admin
      .from('quiz_sessions')
      .select('ended_at')
      .eq('id', sessionId)
      .single()
    expect(session?.ended_at).not.toBeNull()
  })

  it('creates audit event with score metadata', async () => {
    const sessionId = await startAndAnswer({
      correctCount: 3,
      totalCount: 3,
    })

    await studentClient.rpc('complete_quiz_session', {
      p_session_id: sessionId,
    })

    const { data: events } = await admin
      .from('audit_events')
      .select('event_type, metadata')
      .eq('resource_id', sessionId)
      .eq('event_type', 'quiz_session.completed')

    expect(events).toHaveLength(1)
    expect(events![0]!.metadata).toMatchObject({
      total: 3,
      correct: 3,
      score: 100,
    })
  })

  it('rejects completing another student session', async () => {
    const studentBId = await createTestUser({
      admin,
      orgId,
      email: `studentB-complete-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(studentBId)

    const studentBClient = await getAuthenticatedClient({
      email: `studentB-complete-${suffix}@test.local`,
      password: 'test-pass-123',
    })

    const sessionId = await startAndAnswer({
      correctCount: 1,
      totalCount: 1,
    })

    const { error } = await studentBClient.rpc('complete_quiz_session', {
      p_session_id: sessionId,
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('session not found or already completed')
  })

  it('rejects completing an already-completed session', async () => {
    const sessionId = await startAndAnswer({
      correctCount: 1,
      totalCount: 1,
    })

    await studentClient.rpc('complete_quiz_session', {
      p_session_id: sessionId,
    })

    const { error } = await studentClient.rpc('complete_quiz_session', {
      p_session_id: sessionId,
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('session not found or already completed')
  })
})
