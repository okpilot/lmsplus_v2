import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupReferenceData, cleanupTestData } from './cleanup'
import { seedQuestions, seedReferenceData } from './seed'
import { createTestOrg, createTestUser, getAdminClient, getAuthenticatedClient } from './setup'

// Issue #551 — historical-scoring contract (docs/database.md §3, security.md §15).
//
// batch_submit_quiz's bulk-fetch (CREATE TEMP TABLE _batch_questions ... FROM
// questions WHERE id = ANY(config.question_ids)) intentionally carries NO
// `deleted_at IS NULL` filter: session membership is pinned to the immutable
// config.question_ids snapshot locked at session start (FOR UPDATE). A question
// soft-deleted AFTER the session began must therefore still be fetched and scored
// with full data (correct option, explanation text, explanation image).
//
// A regression once removed this carve-out and went 14 days undetected because the
// Vitest unit suite mocks the RPC. Only a real-Postgres integration test against
// the live function can protect the contract — that is this file.
describe('RPC: batch_submit_quiz — soft-delete mid-session scoring', () => {
  const admin = getAdminClient()
  let orgId: string
  let adminUserId: string
  let studentClient: SupabaseClient
  let questionId: string
  let questionIdWrong: string
  let refs: Awaited<ReturnType<typeof seedReferenceData>>
  const userIds: string[] = []
  const suffix = Date.now()

  const EXPLANATION_IMAGE_URL = 'https://example.com/expl.png'

  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `Test Org Batch ${suffix}`,
      slug: `test-batch-${suffix}`,
    })

    adminUserId = await createTestUser({
      admin,
      orgId,
      email: `admin-batch-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'admin',
    })
    userIds.push(adminUserId)

    const studentId = await createTestUser({
      admin,
      orgId,
      email: `student-batch-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(studentId)

    studentClient = await getAuthenticatedClient({
      email: `student-batch-${suffix}@test.local`,
      password: 'test-pass-123',
    })

    refs = await seedReferenceData({
      admin,
      subjectCode: `BS${suffix}`,
      subjectName: `Batch Subject ${suffix}`,
      topicCode: `BS${suffix}-01`,
      topicName: `Batch Topic ${suffix}`,
    })

    const seeded = await seedQuestions({
      admin,
      orgId,
      createdBy: adminUserId,
      subjectId: refs.subjectId,
      topicId: refs.topicId,
      count: 2,
    })
    // Two questions: one for the correct-answer test, one for the wrong-answer
    // test. Each test soft-deletes its own question, so they must not share one.
    const [seededId, seededIdWrong] = seeded.questionIds
    if (!seededId || !seededIdWrong) {
      throw new Error('seedQuestions(count:2) returned fewer than two question ids')
    }
    questionId = seededId
    questionIdWrong = seededIdWrong

    // seedQuestions leaves explanation_image_url NULL (column is TEXT NULL).
    // Populate it so the assertion below can prove the soft-deleted question's
    // image URL still flows through the bulk-fetch.
    const { error: imgErr } = await admin
      .from('questions')
      .update({ explanation_image_url: EXPLANATION_IMAGE_URL })
      .eq('id', questionId)
    if (imgErr) throw new Error(`set explanation_image_url: ${imgErr.message}`)
  })

  afterAll(async () => {
    await cleanupTestData({ admin, orgId, userIds })
    await cleanupReferenceData({ admin, refs: [refs] })
  })

  it('scores a question soft-deleted after the session started', async () => {
    // a. Start a session as the student. This pins questionId into the immutable
    //    config.question_ids snapshot (locked FOR UPDATE at session start).
    const { data: sessionData, error: startErr } = await studentClient.rpc('start_quiz_session', {
      p_mode: 'quick_quiz',
      p_subject_id: refs.subjectId,
      p_topic_id: refs.topicId,
      p_question_ids: [questionId],
    })
    expect(startErr).toBeNull()
    // start_quiz_session returns the session uuid as a plain string. Narrow before
    // use (code-style §5) instead of an unguarded cast.
    if (typeof sessionData !== 'string') {
      throw new Error('start_quiz_session did not return a session id string')
    }
    const sessionId = sessionData
    expect(sessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)

    // b. Soft-delete the question MID-SESSION (after start, before submit).
    const { data: delData, error: delErr } = await admin
      .from('questions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', questionId)
      .select('id')
    if (delErr) throw new Error(`soft-delete: ${delErr.message}`)
    // Non-vacuity (code-style.md §5): prove the soft-delete actually hit the row,
    // so the scoring assertions below genuinely exercise the §15 carve-out rather
    // than passing because the row was never deleted.
    if (!delData?.length) throw new Error('soft-delete: zero rows affected')

    // c. Derive the correct option id + seeded explanation from the question itself.
    //    Service role bypasses RLS, so the now-soft-deleted row is still readable.
    //    Don't blindly trust 'b' — read the options and find correct === true.
    const { data: qRow, error: qErr } = await admin
      .from('questions')
      .select('options, explanation_text')
      .eq('id', questionId)
      .single()
    expect(qErr).toBeNull()
    const options = qRow?.options as unknown as Array<{ id: string; correct: boolean }>
    expect(Array.isArray(options)).toBe(true)
    const correctOption = options.find((o) => o.correct === true)
    if (!correctOption) throw new Error('seeded question has no correct option')
    const correctOptionId = correctOption.id
    const seededExplanation = qRow?.explanation_text as unknown as string
    expect(typeof seededExplanation).toBe('string')
    expect(seededExplanation.length).toBeGreaterThan(0)

    // d. Submit as the STUDENT. Payload key is `selected_option` (not
    //    `selected_option_id`) and `response_time_ms` is a number — matching the
    //    real callers (session-replay.spec.ts, batch-submit-time-limit.spec.ts)
    //    and the function's `v_answer->>'selected_option'` / `->>'response_time_ms'`
    //    extraction.
    const { data, error } = await studentClient.rpc('batch_submit_quiz', {
      p_session_id: sessionId,
      p_answers: [
        { question_id: questionId, selected_option: correctOptionId, response_time_ms: 5000 },
      ],
    })

    expect(error).toBeNull()

    // batch_submit_quiz RETURNS jsonb — a single OBJECT, not an array.
    // Cast with a runtime guard (code-style.md §5) before consuming.
    const result = data as unknown as {
      results: Array<{
        question_id: string
        is_correct: boolean
        correct_option_id: string
        explanation_text: string
        explanation_image_url: string | null
      }>
      total_questions: number
      answered_count: number
      passed: boolean | null
    }
    if (!result || typeof result !== 'object') {
      throw new Error('batch_submit_quiz returned an invalid result structure')
    }
    expect(Array.isArray(result.results)).toBe(true)
    expect(result.results).toHaveLength(1)

    const scored = result.results[0]
    if (!scored) throw new Error('expected exactly one scored result')

    // The soft-deleted question was still fetched and scored with full data.
    expect(scored.question_id).toBe(questionId)
    expect(scored.correct_option_id).toBe(correctOptionId)
    expect(scored.explanation_text).toBe(seededExplanation)
    expect(scored.explanation_image_url).toBe(EXPLANATION_IMAGE_URL)
    expect(scored.is_correct).toBe(true)

    // Session-level tallies reflect the single answered question.
    expect(result.total_questions).toBe(1)
    expect(result.answered_count).toBe(1)
    // quick_quiz (study mode) never sets a pass mark — passed stays NULL.
    expect(result.passed).toBeNull()
  })

  it('returns the correct-option key even when a wrong answer is submitted for a soft-deleted question', async () => {
    // Guards against a regression that nulls correct_option_id on a wrong answer:
    // the answer-key feedback (which option WAS correct) must survive the §15
    // soft-delete carve-out regardless of whether the student answered correctly.
    const { data: sessionData, error: startErr } = await studentClient.rpc('start_quiz_session', {
      p_mode: 'quick_quiz',
      p_subject_id: refs.subjectId,
      p_topic_id: refs.topicId,
      p_question_ids: [questionIdWrong],
    })
    expect(startErr).toBeNull()
    if (typeof sessionData !== 'string') {
      throw new Error('start_quiz_session did not return a session id string')
    }
    const sessionId = sessionData

    // Soft-delete mid-session (after start, before submit).
    const { data: delData, error: delErr } = await admin
      .from('questions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', questionIdWrong)
      .select('id')
    if (delErr) throw new Error(`soft-delete: ${delErr.message}`)
    if (!delData?.length) throw new Error('soft-delete: zero rows affected')

    // Derive both the correct option and a distinct wrong option from the seed.
    const { data: qRow, error: qErr } = await admin
      .from('questions')
      .select('options')
      .eq('id', questionIdWrong)
      .single()
    expect(qErr).toBeNull()
    const options = qRow?.options as unknown as Array<{ id: string; correct: boolean }>
    expect(Array.isArray(options)).toBe(true)
    const correctOption = options.find((o) => o.correct === true)
    const wrongOption = options.find((o) => o.correct === false)
    if (!correctOption || !wrongOption) {
      throw new Error('seeded question needs one correct and one wrong option')
    }

    const { data, error } = await studentClient.rpc('batch_submit_quiz', {
      p_session_id: sessionId,
      p_answers: [
        { question_id: questionIdWrong, selected_option: wrongOption.id, response_time_ms: 5000 },
      ],
    })
    expect(error).toBeNull()

    const result = data as unknown as {
      results: Array<{ question_id: string; is_correct: boolean; correct_option_id: string }>
      passed: boolean | null
    }
    if (!result || typeof result !== 'object') {
      throw new Error('batch_submit_quiz returned an invalid result structure')
    }
    expect(Array.isArray(result.results)).toBe(true)
    expect(result.results).toHaveLength(1)

    const scored = result.results[0]
    if (!scored) throw new Error('expected exactly one scored result')

    // Wrong answer scored as incorrect, but the correct-option key is STILL returned.
    expect(scored.question_id).toBe(questionIdWrong)
    expect(scored.is_correct).toBe(false)
    expect(scored.correct_option_id).toBe(correctOption.id)
    // quick_quiz (study mode) never sets a pass mark — passed stays NULL.
    expect(result.passed).toBeNull()
  })
})
