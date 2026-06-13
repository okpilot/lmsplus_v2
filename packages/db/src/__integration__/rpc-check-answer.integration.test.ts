import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupReferenceData, cleanupTestData } from './cleanup'
import { seedQuestions, seedReferenceData } from './seed'
import { createTestOrg, createTestUser, getAdminClient, getAuthenticatedClient } from './setup'

type CheckAnswerResult = {
  is_correct: boolean
  correct_option_id: string
  explanation_text: string | null
  explanation_image_url: string | null
}

describe('RPC: check_quiz_answer', () => {
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
      name: `Test Org CheckAnswer ${suffix}`,
      slug: `test-checkanswer-${suffix}`,
    })

    adminUserId = await createTestUser({
      admin,
      orgId,
      email: `admin-checkanswer-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'admin',
    })
    userIds.push(adminUserId)

    studentId = await createTestUser({
      admin,
      orgId,
      email: `student-checkanswer-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(studentId)

    studentClient = await getAuthenticatedClient({
      email: `student-checkanswer-${suffix}@test.local`,
      password: 'test-pass-123',
    })

    refs = await seedReferenceData({
      admin,
      subjectCode: `C${suffix}`,
      subjectName: `CheckAnswer Subject ${suffix}`,
      topicCode: `C${suffix}-01`,
      topicName: `CheckAnswer Topic ${suffix}`,
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

  /** Start a smart_review session whose config.question_ids holds the given IDs. */
  async function startSession(qIds?: string[]) {
    const ids = qIds ?? questionIds.slice(0, 3)
    const { data, error } = await studentClient.rpc('start_quiz_session', {
      p_mode: 'smart_review',
      p_subject_id: null,
      p_topic_id: null,
      p_question_ids: ids,
    })
    if (error) throw new Error(`startSession: ${error.message}`)
    return data as string
  }

  it('marks the answer correct and returns the key from questions.correct_option_id', async () => {
    // Regression guard for #823 (mig 109 + mig 115): the answer key moved out of
    // options[].correct (stripped on write) into the REVOKE-gated
    // correct_option_id column. First prove the stored options carry NO `correct`
    // key, yet check_quiz_answer still scores 'b' correct by reading the column.
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
    const { data, error } = await studentClient.rpc('check_quiz_answer', {
      p_question_id: questionIds[0],
      p_selected_option_id: 'b',
      p_session_id: sessionId,
    })
    expect(error).toBeNull()
    const result = data as CheckAnswerResult
    expect(result.is_correct).toBe(true)
    expect(result.correct_option_id).toBe('b')
  })

  it('marks the answer incorrect when the student selects a wrong option', async () => {
    const sessionId = await startSession()
    const { data, error } = await studentClient.rpc('check_quiz_answer', {
      p_question_id: questionIds[0],
      p_selected_option_id: 'a',
      p_session_id: sessionId,
    })
    expect(error).toBeNull()
    const result = data as CheckAnswerResult
    expect(result.is_correct).toBe(false)
    // The key is still surfaced so the UI can reveal the right answer.
    expect(result.correct_option_id).toBe('b')
  })

  it('returns the question explanation fields', async () => {
    const sessionId = await startSession()
    const { data, error } = await studentClient.rpc('check_quiz_answer', {
      p_question_id: questionIds[0],
      p_selected_option_id: 'b',
      p_session_id: sessionId,
    })
    expect(error).toBeNull()
    const result = data as CheckAnswerResult
    expect(result.explanation_text).toBe('Explanation for question 1')
    expect(result.explanation_image_url).toBeNull()
  })

  it('rejects a question that is not in the session config.question_ids', async () => {
    // Session only carries questionIds[0..2]; ask about a question outside it.
    const sessionId = await startSession([questionIds[0]!, questionIds[1]!])
    const { error } = await studentClient.rpc('check_quiz_answer', {
      p_question_id: questionIds[4],
      p_selected_option_id: 'b',
      p_session_id: sessionId,
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('does not belong to session')
  })

  it("rejects another student's session as not owned", async () => {
    const studentBId = await createTestUser({
      admin,
      orgId,
      email: `studentB-checkanswer-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(studentBId)

    const studentBClient = await getAuthenticatedClient({
      email: `studentB-checkanswer-${suffix}@test.local`,
      password: 'test-pass-123',
    })

    // StudentA owns the session; studentB tries to check an answer against it.
    const sessionId = await startSession()
    const { error } = await studentBClient.rpc('check_quiz_answer', {
      p_question_id: questionIds[0],
      p_selected_option_id: 'b',
      p_session_id: sessionId,
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('session not found or not owned')
  })

  it('rejects an exam-mode session with unsupported_session_mode', async () => {
    // check_quiz_answer returns is_correct/explanation/correct_option_id
    // immediately — accepting an exam-mode session would be a mid-exam answer
    // oracle (#823 / mig 115 hardening, PR #856). Exam-mode sessions start via
    // dedicated RPCs, so admin-insert the row directly here.
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
      const { error } = await studentClient.rpc('check_quiz_answer', {
        p_question_id: questionIds[0],
        p_selected_option_id: 'b',
        p_session_id: examSessionId,
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

  it('rejects a soft-deleted caller with user not found or inactive', async () => {
    // The active-user gate (mirrors submit_quiz_answer, mig 110) must fail closed
    // before the session read, so a soft-deleted account with a still-valid JWT
    // cannot keep reading the answer key. Create a throwaway student, obtain its
    // JWT while active, then soft-delete it and call with the live client.
    const deletedStudentId = await createTestUser({
      admin,
      orgId,
      email: `studentDel-checkanswer-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(deletedStudentId)
    const deletedStudentClient = await getAuthenticatedClient({
      email: `studentDel-checkanswer-${suffix}@test.local`,
      password: 'test-pass-123',
    })

    const { data: sessionId, error: startErr } = await deletedStudentClient.rpc(
      'start_quiz_session',
      {
        p_mode: 'smart_review',
        p_subject_id: null,
        p_topic_id: null,
        p_question_ids: questionIds.slice(0, 3),
      },
    )
    if (startErr) throw new Error(`startSession (deleted student): ${startErr.message}`)

    try {
      const { error: delErr } = await admin
        .from('users')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', deletedStudentId)
      if (delErr) throw new Error(`soft-delete student: ${delErr.message}`)

      const { error } = await deletedStudentClient.rpc('check_quiz_answer', {
        p_question_id: questionIds[0],
        p_selected_option_id: 'b',
        p_session_id: sessionId as string,
      })
      expect(error).not.toBeNull()
      expect(error?.message).toContain('user not found or inactive')
    } finally {
      // Soft-delete the orphaned active session so it cannot leak. Never throw.
      const { error: endErr } = await admin
        .from('quiz_sessions')
        .update({
          ended_at: new Date().toISOString(),
          deleted_at: new Date().toISOString(),
        })
        .eq('id', sessionId as string)
      if (endErr) {
        console.error('[deleted-student session cleanup] left active:', endErr.message)
      }
    }
  })
})
