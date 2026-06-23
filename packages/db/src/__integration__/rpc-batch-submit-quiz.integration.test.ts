import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupReferenceData, cleanupTestData } from './cleanup'
import { requireRpcResult } from './guards'
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
    //    The MC answer key now lives in the REVOKE-gated correct_option_id column
    //    (#823, mig 111) — the `correct` flag is stripped from options on write.
    //    Service role bypasses both RLS and the column REVOKE, so the soft-deleted
    //    row's key is still readable. Read the column rather than trusting 'b'.
    const { data: qRow, error: qErr } = await admin
      .from('questions')
      .select('correct_option_id, explanation_text')
      .eq('id', questionId)
      .single()
    expect(qErr).toBeNull()
    const correctOptionId = qRow?.correct_option_id as unknown as string
    if (typeof correctOptionId !== 'string' || correctOptionId.length === 0) {
      throw new Error('seeded question has no correct_option_id')
    }
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
    const result = requireRpcResult<{
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
    }>(data, 'batch_submit_quiz')
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

    // Derive the correct option from the REVOKE-gated key column (#823, mig 111),
    // then pick a distinct wrong option from the remaining option ids. The seeded
    // options are always {a,b,c,d}, so any id != correct is a valid wrong answer.
    const { data: qRow, error: qErr } = await admin
      .from('questions')
      .select('correct_option_id')
      .eq('id', questionIdWrong)
      .single()
    expect(qErr).toBeNull()
    const correctOptionId = qRow?.correct_option_id as unknown as string
    if (typeof correctOptionId !== 'string' || correctOptionId.length === 0) {
      throw new Error('seeded question has no correct_option_id')
    }
    const wrongOptionId = (['a', 'b', 'c', 'd'] as const).find((id) => id !== correctOptionId)
    if (!wrongOptionId) throw new Error('could not derive a distinct wrong option')

    const { data, error } = await studentClient.rpc('batch_submit_quiz', {
      p_session_id: sessionId,
      p_answers: [
        { question_id: questionIdWrong, selected_option: wrongOptionId, response_time_ms: 5000 },
      ],
    })
    expect(error).toBeNull()

    const result = requireRpcResult<{
      results: Array<{ question_id: string; is_correct: boolean; correct_option_id: string }>
      passed: boolean | null
    }>(data, 'batch_submit_quiz')
    expect(Array.isArray(result.results)).toBe(true)
    expect(result.results).toHaveLength(1)

    const scored = result.results[0]
    if (!scored) throw new Error('expected exactly one scored result')

    // Wrong answer scored as incorrect, but the correct-option key is STILL returned.
    expect(scored.question_id).toBe(questionIdWrong)
    expect(scored.is_correct).toBe(false)
    expect(scored.correct_option_id).toBe(correctOptionId)
    // quick_quiz (study mode) never sets a pass mark — passed stays NULL.
    expect(result.passed).toBeNull()
  })
})

// VFR RT Phase 2 (#697, migs 120/121) — type-aware dispatch + partial-credit
// scoring + REVOKE-from-anon/authenticated helpers. These behaviors only run when
// the function EXECUTES against real rows (a `db reset` only proves the body parses):
//   * per-type row persistence (short_answer one row; dialog_fill N rows),
//   * the DISTINCT-question partial-credit roll-up (dialog_fill folds per-blank
//     rows into a fractional numerator — distinguishable from all-or-nothing),
//   * REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated on the _grade_record_* helpers.
describe('RPC: batch_submit_quiz — non-MC dispatch + partial credit + helper REVOKE', () => {
  const admin = getAdminClient()
  let orgId: string
  let adminUserId: string
  let studentId: string
  let bankId: string
  let studentClient: SupabaseClient
  let refs: Awaited<ReturnType<typeof seedReferenceData>>
  const userIds: string[] = []
  const suffix = Date.now() + 1 // avoid colliding with the first describe's suffix

  let shortAnswerId: string
  let dialogFillId: string
  let mcId: string

  const SA_CANONICAL = 'mayday mayday mayday'
  const DF_B0 = 'cleared'
  const DF_B1 = 'runway two seven'
  const DF_B2 = 'wind calm'

  async function insertQuestion(row: Record<string, unknown>): Promise<string> {
    const { data, error } = await admin.from('questions').insert(row).select('id').single()
    if (error) throw new Error(`insertQuestion: ${error.message}`)
    const id = requireRpcResult<{ id: string }>(data, 'insertQuestion').id
    if (typeof id !== 'string' || id.length === 0) throw new Error('insertQuestion: no id')
    return id
  }

  async function startSession(qIds: string[]): Promise<string> {
    const { data, error } = await studentClient.rpc('start_quiz_session', {
      p_mode: 'quick_quiz',
      p_subject_id: refs.subjectId,
      p_topic_id: refs.topicId,
      p_question_ids: qIds,
    })
    if (error) throw new Error(`startSession: ${error.message}`)
    if (typeof data !== 'string') throw new Error('startSession: no session id')
    return data
  }

  type BatchResult = {
    results: Array<{ question_id: string; is_correct: boolean }>
    total_questions: number
    answered_count: number
    correct_count: number
    score_percentage: number | string
    passed: boolean | null
  }
  function asBatchResult(data: unknown): BatchResult {
    return requireRpcResult<BatchResult>(data, 'batch_submit_quiz')
  }

  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `Test Org BatchNonMC ${suffix}`,
      slug: `test-batch-nonmc-${suffix}`,
    })
    adminUserId = await createTestUser({
      admin,
      orgId,
      email: `admin-batch-nonmc-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'admin',
    })
    userIds.push(adminUserId)
    studentId = await createTestUser({
      admin,
      orgId,
      email: `student-batch-nonmc-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(studentId)
    studentClient = await getAuthenticatedClient({
      email: `student-batch-nonmc-${suffix}@test.local`,
      password: 'test-pass-123',
    })
    refs = await seedReferenceData({
      admin,
      subjectCode: `BN${suffix}`,
      subjectName: `BatchNonMC Subject ${suffix}`,
      topicCode: `BN${suffix}-01`,
      topicName: `BatchNonMC Topic ${suffix}`,
    })

    const { data: bank, error: bankErr } = await admin
      .from('question_banks')
      .insert({
        organization_id: orgId,
        name: `BatchNonMC Bank ${suffix}`,
        created_by: adminUserId,
      })
      .select('id')
      .single()
    if (bankErr) throw new Error(`seed bank: ${bankErr.message}`)
    bankId = requireRpcResult<{ id: string }>(bank, 'question_banks insert').id

    const base = {
      organization_id: orgId,
      bank_id: bankId,
      subject_id: refs.subjectId,
      topic_id: refs.topicId,
      subtopic_id: null,
      difficulty: 'medium',
      status: 'active',
      created_by: adminUserId,
    }

    shortAnswerId = await insertQuestion({
      ...base,
      question_type: 'short_answer',
      question_text: 'Distress call?',
      canonical_answer: SA_CANONICAL,
      explanation_text: 'SA explanation',
    })
    dialogFillId = await insertQuestion({
      ...base,
      question_type: 'dialog_fill',
      question_text: 'Three-blank dialog',
      dialog_template: '[atc] {{0|cleared}} to land {{1|runway two seven}}, {{2|wind calm}}.',
      blanks_config: [
        { index: 0, canonical: DF_B0, synonyms: [] },
        { index: 1, canonical: DF_B1, synonyms: [] },
        { index: 2, canonical: DF_B2, synonyms: [] },
      ],
      explanation_text: 'DF explanation',
    })
    mcId = await insertQuestion({
      ...base,
      question_type: 'multiple_choice',
      question_text: 'MC question',
      options: [
        { id: 'a', text: 'A' },
        { id: 'b', text: 'B' },
        { id: 'c', text: 'C' },
        { id: 'd', text: 'D' },
      ],
      correct_option_id: 'b',
      explanation_text: 'MC explanation',
    })
  })

  afterAll(async () => {
    await cleanupTestData({ admin, orgId, userIds })
    await cleanupReferenceData({ admin, refs: [refs] })
  })

  it('persists exactly ONE quiz_session_answers row for a short_answer (blank_index/selected_option NULL)', async () => {
    const sessionId = await startSession([shortAnswerId])
    const { error } = await studentClient.rpc('batch_submit_quiz', {
      p_session_id: sessionId,
      p_answers: [
        { question_id: shortAnswerId, response_text: SA_CANONICAL, response_time_ms: 4000 },
      ],
    })
    expect(error).toBeNull()

    const { data: rows, error: rowsErr } = await admin
      .from('quiz_session_answers')
      .select('selected_option_id, response_text, blank_index, is_correct')
      .eq('session_id', sessionId)
      .eq('question_id', shortAnswerId)
    expect(rowsErr).toBeNull()
    if (!Array.isArray(rows)) throw new Error('expected an array of answer rows')
    expect(rows).toHaveLength(1)
    const row = rows[0] as {
      selected_option_id: string | null
      response_text: string | null
      blank_index: number | null
      is_correct: boolean
    }
    expect(row.selected_option_id).toBeNull()
    expect(row.blank_index).toBeNull()
    expect(row.response_text).toBe(SA_CANONICAL)
    expect(row.is_correct).toBe(true)
  })

  it('persists EXACTLY N quiz_session_answers rows for an N-blank dialog_fill (one per blank)', async () => {
    const sessionId = await startSession([dialogFillId])
    const { error } = await studentClient.rpc('batch_submit_quiz', {
      p_session_id: sessionId,
      p_answers: [
        { question_id: dialogFillId, blank_index: 0, response_text: DF_B0, response_time_ms: 1000 },
        { question_id: dialogFillId, blank_index: 1, response_text: DF_B1, response_time_ms: 1000 },
        { question_id: dialogFillId, blank_index: 2, response_text: DF_B2, response_time_ms: 1000 },
      ],
    })
    expect(error).toBeNull()

    const { data: rows, error: rowsErr } = await admin
      .from('quiz_session_answers')
      .select('blank_index, response_text, is_correct')
      .eq('session_id', sessionId)
      .eq('question_id', dialogFillId)
      .order('blank_index', { ascending: true })
    expect(rowsErr).toBeNull()
    if (!Array.isArray(rows)) throw new Error('expected an array of answer rows')
    expect(rows).toHaveLength(3)
    const typed = rows as Array<{ blank_index: number | null; is_correct: boolean }>
    expect(typed.map((r) => r.blank_index)).toEqual([0, 1, 2])
    for (const r of typed) expect(r.is_correct).toBe(true)
  })

  it('scores a 3-blank dialog_fill answered 2-of-3 as 66.67% (partial credit, not all-or-nothing)', async () => {
    // ONLY a single partially-correct dialog_fill question in the session, so the
    // score isolates the partial-credit math: correct_credit = LEAST(2/3,1) =
    // 0.6667, answered = 1 → round(0.6667*100,2) = 66.67. An all-or-nothing
    // grader would yield 0.00; a per-row grader would yield 66.67 only via the
    // partial-credit roll-up. correct_count = 0 (question not fully correct).
    const sessionId = await startSession([dialogFillId])
    const { data, error } = await studentClient.rpc('batch_submit_quiz', {
      p_session_id: sessionId,
      p_answers: [
        { question_id: dialogFillId, blank_index: 0, response_text: DF_B0, response_time_ms: 1000 },
        { question_id: dialogFillId, blank_index: 1, response_text: DF_B1, response_time_ms: 1000 },
        {
          question_id: dialogFillId,
          blank_index: 2,
          response_text: 'wrong',
          response_time_ms: 1000,
        },
      ],
    })
    expect(error).toBeNull()
    const result = asBatchResult(data)
    expect(Number(result.score_percentage)).toBeCloseTo(66.67, 2)
    expect(result.answered_count).toBe(1)
    expect(result.correct_count).toBe(0)
    // results[] carries ONE entry per answer-payload element (per blank for
    // dialog_fill, not per question), each reflecting that blank's correctness.
    // The 3 blank entries here are 2 correct + 1 wrong.
    const dfResults = result.results.filter((r) => r.question_id === dialogFillId)
    expect(dfResults).toHaveLength(3)
    expect(dfResults.filter((r) => r.is_correct)).toHaveLength(2)
    expect(dfResults.filter((r) => !r.is_correct)).toHaveLength(1)
  })

  it('counts correct_count as fully-correct questions only (3-blank df fully correct → 1)', async () => {
    const sessionId = await startSession([dialogFillId])
    const { data, error } = await studentClient.rpc('batch_submit_quiz', {
      p_session_id: sessionId,
      p_answers: [
        { question_id: dialogFillId, blank_index: 0, response_text: DF_B0, response_time_ms: 1000 },
        { question_id: dialogFillId, blank_index: 1, response_text: DF_B1, response_time_ms: 1000 },
        { question_id: dialogFillId, blank_index: 2, response_text: DF_B2, response_time_ms: 1000 },
      ],
    })
    expect(error).toBeNull()
    const result = asBatchResult(data)
    expect(result.correct_count).toBe(1)
    expect(Number(result.score_percentage)).toBeCloseTo(100, 2)
    // All 3 per-blank result entries are correct.
    const dfResults = result.results.filter((r) => r.question_id === dialogFillId)
    expect(dfResults).toHaveLength(3)
    for (const r of dfResults) expect(r.is_correct).toBe(true)
  })

  it('scores an MC-only session identically (regression — dispatch did not change MC math)', async () => {
    const sessionId = await startSession([mcId])
    const { data, error } = await studentClient.rpc('batch_submit_quiz', {
      p_session_id: sessionId,
      p_answers: [{ question_id: mcId, selected_option: 'b', response_time_ms: 2000 }],
    })
    expect(error).toBeNull()
    const result = asBatchResult(data)
    expect(result.answered_count).toBe(1)
    expect(result.correct_count).toBe(1)
    expect(Number(result.score_percentage)).toBeCloseTo(100, 2)
    const scored = result.results.find((r) => r.question_id === mcId)
    expect(scored?.is_correct).toBe(true)
  })

  it('forbids a direct authenticated call to the internal _grade_record_* helpers (42501)', async () => {
    // REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated (mig 120, fixed #952):
    // the helpers must not be callable via PostgREST by an authenticated user —
    // a direct call would bypass the dispatcher's auth/owner/mode guards and forge
    // graded rows. REVOKE FROM PUBLIC alone is insufficient (Supabase also grants
    // anon/authenticated via ALTER DEFAULT PRIVILEGES; CI caught this gap).
    // Signature-valid payloads (not `{}`): with the wrong argument shape
    // PostgREST returns PGRST202 from overload resolution *before* the EXECUTE
    // permission check, so the test would pass even if the REVOKE regressed
    // (code-style.md §7 — negative assertions must be non-vacuous). Type-valid
    // dummy values matching each helper's mig-120 signature force the call far
    // enough to hit the permission check.
    const dummyId = '00000000-0000-0000-0000-000000000000'
    const helpers = [
      {
        fn: '_grade_record_mc',
        args: {
          p_session_id: dummyId,
          p_student_id: studentId,
          p_org_id: orgId,
          p_question_id: mcId,
          p_selected: 'a',
          p_correct_option: 'a',
          p_options: [],
          p_response_time: 0,
        },
      },
      {
        fn: '_grade_record_short_answer',
        args: {
          p_session_id: dummyId,
          p_student_id: studentId,
          p_org_id: orgId,
          p_question_id: mcId,
          p_response_text: 'x',
          p_canonical: 'x',
          p_synonyms: [],
          p_response_time: 0,
        },
      },
      {
        fn: '_grade_record_dialog_fill',
        args: {
          p_session_id: dummyId,
          p_student_id: studentId,
          p_org_id: orgId,
          p_question_id: mcId,
          p_blank_index: 0,
          p_response_text: 'x',
          p_blanks_config: [],
          p_response_time: 0,
        },
      },
    ] as const
    for (const { fn, args } of helpers) {
      const { error } = await studentClient.rpc(fn, args)
      // Either Postgres permission-denied (42501) or PostgREST function-not-found
      // (PGRST202, because the revoked function is not exposed in the schema cache).
      // Both prove the authenticated role cannot execute it. We assert it is NOT a
      // successful (null-error) call.
      expect(error, `helper ${fn} must be uncallable`).not.toBeNull()
      const code = (error as { code?: string }).code
      const message = (error?.message ?? '').toLowerCase()
      const denied =
        code === '42501' ||
        code === 'PGRST202' ||
        message.includes('permission denied') ||
        message.includes('could not find the function') ||
        message.includes('does not exist')
      expect(denied, `helper ${fn} error was ${code}: ${error?.message}`).toBe(true)
    }
  })

  it('re-flags an expired exam as expired on retry, not as a zero-score completion', async () => {
    // #839: the idempotent-replay branch used to DROP the expired flag, so a retry
    // of an expired submit looked like a normal 0-score completion. The replay now
    // detects the 'exam.expired' / 'internal_exam.expired' audit event and re-returns
    // expired:true. Service-role INSERT with a backdated started_at trips the
    // timer-expiry guard on first submit (mig 079 exempts service_role from the
    // immutability trigger on INSERT), avoiding a 30-minute real wait.
    const oldStartedAt = new Date(Date.now() - (1800 + 60) * 1000).toISOString()
    const { data: inserted, error: insErr } = await admin
      .from('quiz_sessions')
      .insert({
        organization_id: orgId,
        student_id: studentId,
        mode: 'mock_exam',
        subject_id: refs.subjectId,
        config: { question_ids: [mcId], pass_mark: 75 },
        total_questions: 1,
        time_limit_seconds: 1800,
        started_at: oldStartedAt,
      })
      .select('id')
      .single()
    if (insErr) throw new Error(`backdated session insert: ${insErr.message}`)
    const expiredSessionId = requireRpcResult<{ id: string }>(inserted, 'quiz_sessions insert').id
    const answers = [{ question_id: mcId, selected_option: 'b', response_time_ms: 1000 }]

    // First submit trips the expiry guard (fresh path → expired:true).
    const { data: first, error: firstErr } = await studentClient.rpc('batch_submit_quiz', {
      p_session_id: expiredSessionId,
      p_answers: answers,
    })
    expect(firstErr).toBeNull()
    expect(requireRpcResult<{ expired?: boolean }>(first, 'batch_submit_quiz').expired).toBe(true)

    // Retry of the now-ended session hits the idempotent-replay branch.
    const { data: replay, error: replayErr } = await studentClient.rpc('batch_submit_quiz', {
      p_session_id: expiredSessionId,
      p_answers: answers,
    })
    expect(replayErr).toBeNull()
    const replayResult = requireRpcResult<BatchResult & { expired?: boolean }>(
      replay,
      'batch_submit_quiz',
    )
    // Clean boolean true (EXISTS, not a count) and otherwise the identical zeroed payload.
    expect(replayResult.expired).toBe(true)
    expect(replayResult.results).toEqual([])
    expect(Number(replayResult.answered_count)).toBe(0)
    expect(Number(replayResult.correct_count)).toBe(0)
    expect(Number(replayResult.score_percentage)).toBe(0)
    expect(replayResult.passed).toBe(false)
  })
})
