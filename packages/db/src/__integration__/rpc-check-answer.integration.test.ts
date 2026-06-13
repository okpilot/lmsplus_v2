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
})
