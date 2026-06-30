import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanupReferenceData, cleanupTestData, clearActiveSessions } from './cleanup'
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

  // Single-active-session invariant (#1011): each test starts a fresh session for
  // the reused test student, so clear any still-active session left by the prior
  // test before the next start RPC raises `another_session_active`.
  beforeEach(async () => {
    await clearActiveSessions({ admin, orgId })
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
    // #823 (mig 111): the answer key moved out of options[].correct (stripped on
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

  it("keeps the first answer's result on a duplicate submit with a different option", async () => {
    // #856 (mig 112): a duplicate submit for the same (session, question) is a true
    // no-op on student state — the answer row is ON CONFLICT DO NOTHING, and
    // student_responses + fsrs_cards are only written when the answer row was newly
    // inserted. The duplicate path re-reads the persisted is_correct and returns THAT,
    // so a later wrong option must NOT flip the stored result or fsrs_cards.
    const sessionId = await startSession()

    // First submit the CORRECT option ('b' is the seeded answer key).
    const { data: first, error: firstErr } = await studentClient.rpc('submit_quiz_answer', {
      p_session_id: sessionId,
      p_question_id: questionIds[0],
      p_selected_option: 'b',
      p_response_time_ms: 5000,
    })
    expect(firstErr).toBeNull()
    expect(first?.[0].is_correct).toBe(true)

    // Duplicate submit with a DIFFERENT (wrong) option for the same question.
    const { data: dup, error: dupErr } = await studentClient.rpc('submit_quiz_answer', {
      p_session_id: sessionId,
      p_question_id: questionIds[0],
      p_selected_option: 'a',
      p_response_time_ms: 1000,
    })
    expect(dupErr).toBeNull()
    // Returns the persisted first answer's result, not this call's wrong option.
    expect(dup?.[0].is_correct).toBe(true)

    // The duplicate did not flip the FSRS last-was-correct signal either.
    const { data: card, error: cardErr } = await admin
      .from('fsrs_cards')
      .select('last_was_correct')
      .eq('student_id', studentId)
      .eq('question_id', questionIds[0])
      .single<{ last_was_correct: boolean }>()
    expect(cardErr).toBeNull()
    expect(card?.last_was_correct).toBe(true)
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

  it('accepts a submission for a question soft-deleted mid-session (§15 carve-out, #855)', async () => {
    // #855 Option 1 (carve-out both): a question that was a frozen config.question_ids
    // member at session start stays submittable even after an admin soft-deletes it
    // mid-session — aligned with check_quiz_answer. Use a DEDICATED question (index 4,
    // outside the default 0..3 slice) and restore in finally so the shared pool is not
    // polluted for sibling tests.
    const targetQuestion = questionIds[4]
    if (!targetQuestion) throw new Error('expected at least 5 seeded questions')
    const sessionId = await startSession([targetQuestion])

    // Soft-delete the question AFTER the session froze its config.question_ids membership.
    const { error: softDeleteErr } = await admin
      .from('questions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', targetQuestion)
    if (softDeleteErr) throw new Error(`soft-delete setup: ${softDeleteErr.message}`)

    try {
      // Non-vacuity precondition: the question is genuinely soft-deleted, so a green
      // result proves the carve-out — not that the question was still active.
      const { data: precheck, error: precheckErr } = await admin
        .from('questions')
        .select('deleted_at')
        .eq('id', targetQuestion)
        .single()
      if (precheckErr) throw new Error(`precheck: ${precheckErr.message}`)
      expect(precheck?.deleted_at).not.toBeNull()

      // The carve-out: submit still succeeds and reads the soft-deleted question's key.
      const { data, error } = await studentClient.rpc('submit_quiz_answer', {
        p_session_id: sessionId,
        p_question_id: targetQuestion,
        p_selected_option: 'b',
        p_response_time_ms: 4000,
      })
      expect(error).toBeNull()
      expect(data?.[0].is_correct).toBe(true)
      expect(data?.[0].correct_option_id).toBe('b')

      // The answer was actually recorded (the behavior under test, not just a no-op accept).
      const { data: recorded, error: recordedErr } = await admin
        .from('quiz_session_answers')
        .select('is_correct')
        .eq('session_id', sessionId)
        .eq('question_id', targetQuestion)
        .is('blank_index', null)
        .single()
      if (recordedErr) throw new Error(`recorded read: ${recordedErr.message}`)
      expect(recorded?.is_correct).toBe(true)
    } finally {
      // Restore so afterAll cleanup and any sibling test see an active question.
      const { error: restoreErr } = await admin
        .from('questions')
        .update({ deleted_at: null })
        .eq('id', targetQuestion)
      if (restoreErr) {
        console.error('[#855 question restore] question row left soft-deleted:', restoreErr.message)
      }
    }
  })
})
