import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupReferenceData, cleanupTestData } from './cleanup'
import { seedQuestions, seedReferenceData } from './seed'
import { createTestOrg, createTestUser, getAdminClient, getAuthenticatedClient } from './setup'

describe('RPC: submit_quiz_answer', () => {
  const admin = getAdminClient()
  let orgId: string
  let adminUserId: string
  let studentId: string
  let studentClient: SupabaseClient
  let questionIds: string[]
  let refs: Awaited<ReturnType<typeof seedReferenceData>>
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

    refs = await seedReferenceData({
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
    await cleanupReferenceData({ admin, refs: [refs] })
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

  it('scores MC answer via the correct_option_id column after options.correct is stripped', async () => {
    // #823 (mig 109): the answer key moved out of options[].correct (stripped on
    // write by the sanitize trigger) into the REVOKE-gated correct_option_id
    // column. Prove the seeded question's stored options carry NO `correct` key,
    // yet scoring against the column still marks 'b' correct.
    const { data: qRow, error: qErr } = await admin
      .from('questions')
      .select('options, correct_option_id')
      .eq('id', questionIds[0])
      .single<{ options: Array<Record<string, unknown>>; correct_option_id: string }>()
    expect(qErr).toBeNull()
    for (const opt of qRow!.options) {
      expect('correct' in opt).toBe(false)
    }
    expect(qRow!.correct_option_id).toBe('b')

    const sessionId = await startSession()
    const { data, error } = await studentClient.rpc('submit_quiz_answer', {
      p_session_id: sessionId,
      p_question_id: questionIds[0],
      p_selected_option: 'b',
      p_response_time_ms: 4000,
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
    const { data: answers, error: answersErr } = await admin
      .from('quiz_session_answers')
      .select('id')
      .eq('session_id', sessionId)
      .eq('question_id', questionIds[0])
    expect(answersErr).toBeNull()
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
    const sessionId = await startSession([questionIds[0]!])

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

    const { data: answers, error: answersErr } = await admin
      .from('quiz_session_answers')
      .select('id')
      .eq('session_id', sessionId)
      .eq('question_id', questionIds[2])
    expect(answersErr).toBeNull()
    expect(answers).toHaveLength(1)

    const { data: responses, error: responsesErr } = await admin
      .from('student_responses')
      .select('id')
      .eq('session_id', sessionId)
      .eq('question_id', questionIds[2])
      .eq('student_id', studentId)
    expect(responsesErr).toBeNull()
    expect(responses?.length).toBeGreaterThanOrEqual(1)
  })

  it('rejects an exam-mode session with unsupported_session_mode', async () => {
    // submit_quiz_answer returns is_correct/explanation/correct_option_id
    // immediately — accepting an exam-mode session would be a mid-exam answer
    // oracle (whitelist narrowed in mig 095b, PR #830). Exam-mode sessions
    // start via dedicated RPCs, so admin-insert the row directly here.
    const { data: sessRow, error: sessErr } = await admin
      .from('quiz_sessions')
      .insert({
        organization_id: orgId,
        student_id: studentId,
        mode: 'mock_exam',
        subject_id: refs.subjectId,
        config: { question_ids: [questionIds[0]] },
        total_questions: 1,
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single<{ id: string }>()
    if (sessErr) throw new Error(`exam session insert: ${sessErr.message}`)
    const examSessionId = sessRow.id

    try {
      const { error } = await studentClient.rpc('submit_quiz_answer', {
        p_session_id: examSessionId,
        p_question_id: questionIds[0],
        p_selected_option: 'b',
        p_response_time_ms: 1000,
      })
      expect(error).not.toBeNull()
      expect(error?.message).toContain('unsupported_session_mode')
    } finally {
      // Force-end + soft-delete the admin-inserted session so it cannot leak
      // into other tests' active-session views. Never throw in finally.
      const { error: endErr } = await admin
        .from('quiz_sessions')
        .update({
          ended_at: new Date().toISOString(),
          deleted_at: new Date().toISOString(),
        })
        .eq('id', examSessionId)
      if (endErr) {
        console.error('[exam-session cleanup] session left active:', endErr.message)
      }
    }
  })

  it('rejects a soft-deleted caller', async () => {
    // Mig 095b (PR #830) adds an explicit active-user gate right after the
    // auth check, mirroring batch_submit_quiz (mig 095c).
    const sessionId = await startSession()

    // Soft-delete the student mid-session.
    const { error: softDeleteErr } = await admin
      .from('users')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', studentId)
    if (softDeleteErr) throw new Error(`soft-delete setup: ${softDeleteErr.message}`)

    try {
      const { error } = await studentClient.rpc('submit_quiz_answer', {
        p_session_id: sessionId,
        p_question_id: questionIds[0],
        p_selected_option: 'b',
        p_response_time_ms: 1000,
      })
      expect(error).not.toBeNull()
      expect(error?.message).toContain('user not found or inactive')
    } finally {
      // Restore so later tests and afterAll cleanup see an active student.
      const { error: restoreErr } = await admin
        .from('users')
        .update({ deleted_at: null })
        .eq('id', studentId)
      if (restoreErr) {
        console.error('[soft-delete restore] student row left soft-deleted:', restoreErr.message)
      }
    }
  })
})
