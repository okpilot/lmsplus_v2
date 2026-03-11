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

describe('RPC: submit_quiz_answer', () => {
  const admin = getAdminClient()
  let orgId: string
  let adminUserId: string
  let studentId: string
  let studentClient: SupabaseClient
  let questionIds: string[]
  const userIds: string[] = []
  const suffix = Date.now()

  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `Test Org Submit ${suffix}`,
      slug: `test-submit-${suffix}`,
    })

    adminUserId = await createTestUser({
      admin,
      orgId,
      email: `admin-submit-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'admin',
    })
    userIds.push(adminUserId)

    studentId = await createTestUser({
      admin,
      orgId,
      email: `student-submit-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(studentId)

    studentClient = await getAuthenticatedClient({
      email: `student-submit-${suffix}@test.local`,
      password: 'test-pass-123',
    })

    const refs = await seedReferenceData({
      admin,
      subjectCode: `B${suffix}`,
      subjectName: `Submit Subject ${suffix}`,
      topicCode: `B${suffix}-01`,
      topicName: `Submit Topic ${suffix}`,
    })

    const seeded = await seedQuestions({
      admin,
      orgId,
      createdBy: adminUserId,
      subjectId: refs.subjectId,
      topicId: refs.topicId,
      count: 5,
    })
    questionIds = seeded.questionIds
  })

  afterAll(async () => {
    await cleanupTestData({ admin, orgId, userIds })
  })

  async function startSession(qIds?: string[]) {
    const ids = qIds ?? questionIds.slice(0, 3)
    const { data } = await studentClient.rpc('start_quiz_session', {
      p_mode: 'quick_quiz',
      p_subject_id: null,
      p_topic_id: null,
      p_question_ids: ids,
    })
    return data as string
  }

  it('correct answer returns is_correct = true', async () => {
    const sessionId = await startSession()
    // Option 'b' is the correct answer (set in seedQuestions)
    const { data, error } = await studentClient.rpc('submit_quiz_answer', {
      p_session_id: sessionId,
      p_question_id: questionIds[0],
      p_selected_option: 'b',
      p_response_time_ms: 5000,
    })
    expect(error).toBeNull()
    expect(data?.[0].is_correct).toBe(true)
    expect(data?.[0].correct_option_id).toBe('b')
  })

  it('wrong answer returns is_correct = false', async () => {
    const sessionId = await startSession()
    const { data, error } = await studentClient.rpc('submit_quiz_answer', {
      p_session_id: sessionId,
      p_question_id: questionIds[0],
      p_selected_option: 'a',
      p_response_time_ms: 3000,
    })
    expect(error).toBeNull()
    expect(data?.[0].is_correct).toBe(false)
    expect(data?.[0].correct_option_id).toBe('b')
  })

  it('returns explanation text', async () => {
    const sessionId = await startSession()
    const { data } = await studentClient.rpc('submit_quiz_answer', {
      p_session_id: sessionId,
      p_question_id: questionIds[0],
      p_selected_option: 'b',
      p_response_time_ms: 2000,
    })
    expect(data?.[0].explanation_text).toBe('Explanation for question 1')
  })

  it('duplicate submission is idempotent (ON CONFLICT DO NOTHING)', async () => {
    const sessionId = await startSession()
    // First submit
    await studentClient.rpc('submit_quiz_answer', {
      p_session_id: sessionId,
      p_question_id: questionIds[0],
      p_selected_option: 'b',
      p_response_time_ms: 2000,
    })
    // Second submit — same session + question
    const { error } = await studentClient.rpc('submit_quiz_answer', {
      p_session_id: sessionId,
      p_question_id: questionIds[0],
      p_selected_option: 'a',
      p_response_time_ms: 1000,
    })
    expect(error).toBeNull()

    // Verify only 1 row in quiz_session_answers
    const { data: answers } = await admin
      .from('quiz_session_answers')
      .select('id')
      .eq('session_id', sessionId)
      .eq('question_id', questionIds[0])
    expect(answers).toHaveLength(1)
  })

  it('rejects submission to another student session', async () => {
    // Create studentB
    const studentBId = await createTestUser({
      admin,
      orgId,
      email: `studentB-submit-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(studentBId)

    const studentBClient = await getAuthenticatedClient({
      email: `studentB-submit-${suffix}@test.local`,
      password: 'test-pass-123',
    })

    // StudentA starts a session
    const sessionId = await startSession()

    // StudentB tries to submit to studentA's session
    const { error } = await studentBClient.rpc('submit_quiz_answer', {
      p_session_id: sessionId,
      p_question_id: questionIds[0],
      p_selected_option: 'b',
      p_response_time_ms: 2000,
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('session not found')
  })

  it('rejects submission to completed session', async () => {
    const sessionId = await startSession([questionIds[0]])

    // Submit one answer then complete
    await studentClient.rpc('submit_quiz_answer', {
      p_session_id: sessionId,
      p_question_id: questionIds[0],
      p_selected_option: 'b',
      p_response_time_ms: 1000,
    })
    await studentClient.rpc('complete_quiz_session', {
      p_session_id: sessionId,
    })

    // Try to submit another answer
    const { error } = await studentClient.rpc('submit_quiz_answer', {
      p_session_id: sessionId,
      p_question_id: questionIds[1],
      p_selected_option: 'a',
      p_response_time_ms: 1000,
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('session already completed')
  })

  it('inserts into both quiz_session_answers and student_responses', async () => {
    const sessionId = await startSession()
    await studentClient.rpc('submit_quiz_answer', {
      p_session_id: sessionId,
      p_question_id: questionIds[2],
      p_selected_option: 'c',
      p_response_time_ms: 4000,
    })

    const { data: answers } = await admin
      .from('quiz_session_answers')
      .select('id')
      .eq('session_id', sessionId)
      .eq('question_id', questionIds[2])
    expect(answers).toHaveLength(1)

    const { data: responses } = await admin
      .from('student_responses')
      .select('id')
      .eq('session_id', sessionId)
      .eq('question_id', questionIds[2])
      .eq('student_id', studentId)
    expect(responses?.length).toBeGreaterThanOrEqual(1)
  })
})
