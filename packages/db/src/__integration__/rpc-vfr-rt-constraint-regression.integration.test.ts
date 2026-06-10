/**
 * A.11 — Constraint regression tests (migs 095/095b/095c).
 *
 * The UNIQUE on quiz_session_answers was widened from (session_id, question_id)
 * to (session_id, question_id, blank_index) NULLS NOT DISTINCT. The ON CONFLICT
 * clauses in batch_submit_quiz (mig 095c) and submit_quiz_answer (mig 095b) were
 * updated to match. complete_quiz_session reads the table but does not INSERT.
 *
 * The critical failure mode is invisible to `db reset` / `db push`: plpgsql
 * resolves ON CONFLICT inference at EXECUTION time, not at CREATE OR REPLACE time
 * (code-style.md §5 / design.md § Migrations 095b+095c). A 42P10 only surfaces
 * when a student actually submits — which is exactly what these tests exercise.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupReferenceData, cleanupTestData } from './cleanup'
import { seedQuestions, seedReferenceData } from './seed'
import { createTestOrg, createTestUser, getAdminClient, getAuthenticatedClient } from './setup'

const admin = getAdminClient()
const suffix = Date.now()

describe('Constraint regression — batch_submit_quiz idempotency after mig 095/095c', () => {
  let orgId: string
  let adminUserId: string
  let studentClient: SupabaseClient
  let questionIds: string[]
  let refs: Awaited<ReturnType<typeof seedReferenceData>>
  const userIds: string[] = []

  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `Test Org BatchReg ${suffix}`,
      slug: `test-batchreg-${suffix}`,
    })
    adminUserId = await createTestUser({
      admin,
      orgId,
      email: `admin-batchreg-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'admin',
    })
    userIds.push(adminUserId)
    const studentId = await createTestUser({
      admin,
      orgId,
      email: `student-batchreg-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(studentId)
    studentClient = await getAuthenticatedClient({
      email: `student-batchreg-${suffix}@test.local`,
      password: 'test-pass-123',
    })
    refs = await seedReferenceData({
      admin,
      subjectCode: `BR${suffix}`,
      subjectName: `Batch Reg Subject ${suffix}`,
      topicCode: `BR${suffix}-01`,
      topicName: `Batch Reg Topic ${suffix}`,
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
    await cleanupReferenceData({ admin, refs: [refs] })
  })

  it('second batch_submit_quiz call with the same payload does not duplicate quiz_session_answers rows', async () => {
    // Start a quick_quiz session (legacy MC path — exercises the widened constraint)
    const { data: sessionData, error: startErr } = await studentClient.rpc('start_quiz_session', {
      p_mode: 'quick_quiz',
      p_subject_id: refs.subjectId,
      p_topic_id: refs.topicId,
      p_question_ids: questionIds.slice(0, 2),
    })
    expect(startErr).toBeNull()
    if (typeof sessionData !== 'string')
      throw new Error('start_quiz_session did not return a string')
    const sessionId = sessionData

    // Derive the correct option for qId1 so we have a deterministic payload
    const qId1 = questionIds[0]!
    const qId2 = questionIds[1]!
    const { data: q1Row, error: q1Err } = await admin
      .from('questions')
      .select('options')
      .eq('id', qId1)
      .single()
    expect(q1Err).toBeNull()
    const opts = q1Row?.options as unknown as Array<{ id: string; correct: boolean }>
    const correctOpt = opts.find((o) => o.correct)
    if (!correctOpt) throw new Error('seeded question has no correct option')

    const answers = [
      { question_id: qId1, selected_option: correctOpt.id, response_time_ms: 1000 },
      { question_id: qId2, selected_option: 'a', response_time_ms: 1000 },
    ]

    // First call — should succeed
    const { error: err1 } = await studentClient.rpc('batch_submit_quiz', {
      p_session_id: sessionId,
      p_answers: answers,
    })
    // 42P10 would surface here if the ON CONFLICT inference target is wrong
    expect(err1).toBeNull()

    // Second call — ON CONFLICT DO NOTHING; no duplicate row, no error
    const { error: err2 } = await studentClient.rpc('batch_submit_quiz', {
      p_session_id: sessionId,
      p_answers: answers,
    })
    // 42P10 would also surface here on the second call if the first accidentally
    // committed with a bug that left the constraint in an inconsistent state
    expect(err2).toBeNull()

    // Non-vacuity: exactly 2 rows in quiz_session_answers (one per question,
    // blank_index NULL for MC) — the second call wrote nothing
    const { data: answerRows, error: rowsErr } = await admin
      .from('quiz_session_answers')
      .select('id, question_id, blank_index')
      .eq('session_id', sessionId)
    expect(rowsErr).toBeNull()
    expect(answerRows).toHaveLength(2)
    for (const row of answerRows ?? []) {
      const r = row as { id: string; question_id: string; blank_index: unknown }
      expect(r.blank_index).toBeNull()
    }
  })

  it('submit_quiz_answer called twice for the same question does not duplicate quiz_session_answers rows', async () => {
    const { data: sessionData, error: startErr } = await studentClient.rpc('start_quiz_session', {
      p_mode: 'quick_quiz',
      p_subject_id: refs.subjectId,
      p_topic_id: refs.topicId,
      p_question_ids: [questionIds[2]!],
    })
    expect(startErr).toBeNull()
    if (typeof sessionData !== 'string')
      throw new Error('start_quiz_session did not return a string')
    const sessionId = sessionData

    // First submit
    const { error: err1 } = await studentClient.rpc('submit_quiz_answer', {
      p_session_id: sessionId,
      p_question_id: questionIds[2]!,
      p_selected_option: 'b',
      p_response_time_ms: 1000,
    })
    expect(err1).toBeNull()

    // Second submit — same question, ON CONFLICT DO NOTHING
    const { error: err2 } = await studentClient.rpc('submit_quiz_answer', {
      p_session_id: sessionId,
      p_question_id: questionIds[2]!,
      p_selected_option: 'b',
      p_response_time_ms: 1000,
    })
    expect(err2).toBeNull()

    const { data: answerRows, error: rowsErr } = await admin
      .from('quiz_session_answers')
      .select('id')
      .eq('session_id', sessionId)
    expect(rowsErr).toBeNull()
    expect(answerRows).toHaveLength(1)
  })

  it('complete_quiz_session executes without 42P10 against the widened constraint', async () => {
    // complete_quiz_session reads quiz_session_answers but never INSERTs into it,
    // so it needs no ON CONFLICT update. This test confirms the function still
    // executes cleanly after the schema widening (regression guard).
    //
    // We use submit_quiz_answer (not batch_submit_quiz) to answer questions here,
    // because batch_submit_quiz calls complete_quiz_session internally and would
    // mark the session ended before we have a chance to call it ourselves.
    const { data: sessionData, error: startErr } = await studentClient.rpc('start_quiz_session', {
      p_mode: 'quick_quiz',
      p_subject_id: refs.subjectId,
      p_topic_id: refs.topicId,
      p_question_ids: questionIds.slice(0, 2),
    })
    expect(startErr).toBeNull()
    if (typeof sessionData !== 'string')
      throw new Error('start_quiz_session did not return a string')
    const sessionId = sessionData

    // Answer via submit_quiz_answer (one question at a time). The session stays
    // open after each submit_quiz_answer call — complete_quiz_session is what
    // marks it ended.
    const { error: ans1Err } = await studentClient.rpc('submit_quiz_answer', {
      p_session_id: sessionId,
      p_question_id: questionIds[0]!,
      p_selected_option: 'b',
      p_response_time_ms: 1000,
    })
    expect(ans1Err).toBeNull()
    const { error: ans2Err } = await studentClient.rpc('submit_quiz_answer', {
      p_session_id: sessionId,
      p_question_id: questionIds[1]!,
      p_selected_option: 'a',
      p_response_time_ms: 1000,
    })
    expect(ans2Err).toBeNull()

    const { error: completeErr } = await studentClient.rpc('complete_quiz_session', {
      p_session_id: sessionId,
    })
    // The primary signal is no 42P10 error
    expect(completeErr).toBeNull()
  })
})
