import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupReferenceData, cleanupTestData } from './cleanup'
import { requireRpcResult } from './guards'
import { seedReferenceData } from './seed'
import {
  createTestOrg,
  createTestUser,
  getAdminClient,
  getAnonClient,
  getAuthenticatedClient,
} from './setup'

// Red-team Vectors EL1-EL6 (guard rejections) + EM (output contract) —
// check_non_mc_answer immediate-feedback grader (mig 119, #697 Phase 2).
//
// The grading branches (short_answer normalize/compare, dialog_fill per-blank
// loop + full-coverage rule) only run when the function is EXECUTED, not at
// CREATE-time. A `db reset` proves the body parses; this file proves it grades.

type CheckNonMcResult = {
  is_correct: boolean
  correct_answer: string | null
  blanks: Array<{ index: number; is_correct: boolean; canonical: string }> | null
  explanation_text: string | null
  explanation_image_url: string | null
}

/** Runtime-guard the jsonb result (code-style.md §5 — cast guard applies in tests). */
function asResult(data: unknown): CheckNonMcResult {
  if (!data || typeof data !== 'object') {
    throw new Error('check_non_mc_answer returned a non-object')
  }
  return requireRpcResult<CheckNonMcResult>(data, 'check_non_mc_answer')
}

async function insertQuestion(
  admin: SupabaseClient,
  row: Record<string, unknown>,
): Promise<string> {
  const { data, error } = await admin.from('questions').insert(row).select('id').single()
  if (error) throw new Error(`insertQuestion: ${error.message}`)
  const id = requireRpcResult<{ id: string }>(data, 'insertQuestion').id
  if (typeof id !== 'string' || id.length === 0) throw new Error('insertQuestion: no id')
  return id
}

describe('RPC: check_non_mc_answer — guards (EL) + output contract (EM)', () => {
  const admin = getAdminClient()
  let orgId: string
  let adminUserId: string
  let studentId: string
  let bankId: string
  let studentClient: SupabaseClient
  let refs: Awaited<ReturnType<typeof seedReferenceData>>
  const userIds: string[] = []
  const suffix = Date.now()

  // short_answer: one passing-seed, one failing-seed (≥2 distinct seeds per type).
  let saCorrectId: string
  let saWrongId: string
  // dialog_fill: 3-blank question used for full-correct, 2-of-3, and missing-blank.
  let dfId: string
  let mcId: string

  const SA_CANONICAL = 'mayday mayday mayday'
  const DF_B0 = 'cleared'
  const DF_B1 = 'runway two seven'
  const DF_B2 = 'wind calm'

  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `Test Org NonMC ${suffix}`,
      slug: `test-nonmc-${suffix}`,
    })
    adminUserId = await createTestUser({
      admin,
      orgId,
      email: `admin-nonmc-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'admin',
    })
    userIds.push(adminUserId)
    studentId = await createTestUser({
      admin,
      orgId,
      email: `student-nonmc-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(studentId)
    studentClient = await getAuthenticatedClient({
      email: `student-nonmc-${suffix}@test.local`,
      password: 'test-pass-123',
    })
    refs = await seedReferenceData({
      admin,
      subjectCode: `NM${suffix}`,
      subjectName: `NonMC Subject ${suffix}`,
      topicCode: `NM${suffix}-01`,
      topicName: `NonMC Topic ${suffix}`,
    })

    const { data: bank, error: bankErr } = await admin
      .from('question_banks')
      .insert({ organization_id: orgId, name: `NonMC Bank ${suffix}`, created_by: adminUserId })
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

    saCorrectId = await insertQuestion(admin, {
      ...base,
      question_type: 'short_answer',
      question_text: 'Distress call?',
      canonical_answer: SA_CANONICAL,
      explanation_text: 'SA explanation',
    })
    saWrongId = await insertQuestion(admin, {
      ...base,
      question_type: 'short_answer',
      question_text: 'Another short answer?',
      canonical_answer: 'squawk seven seven zero zero',
      explanation_text: 'SA wrong-seed explanation',
    })
    dfId = await insertQuestion(admin, {
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
    mcId = await insertQuestion(admin, {
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

  /** Start a smart_review session pinning the given question ids. */
  async function startSession(qIds: string[]): Promise<string> {
    const { data, error } = await studentClient.rpc('start_quiz_session', {
      p_mode: 'smart_review',
      p_subject_id: null,
      p_topic_id: null,
      p_question_ids: qIds,
    })
    if (error) throw new Error(`startSession: ${error.message}`)
    if (typeof data !== 'string') throw new Error('startSession: no session id')
    return data
  }

  // ── EL1: unauthenticated ───────────────────────────────────────────────────
  it('EL1 — rejects an unauthenticated caller with not_authenticated', async () => {
    const anon = getAnonClient()
    // anon needs a session id; reuse a real session id but call without auth.
    const sessionId = await startSession([saCorrectId])
    const { error } = await anon.rpc('check_non_mc_answer', {
      p_question_id: saCorrectId,
      p_session_id: sessionId,
      p_response_text: SA_CANONICAL,
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('not_authenticated')
  })

  // ── EL2: non-whitelist mode (mock_exam session) ─────────────────────────────
  it('EL2 — rejects a mock_exam session with unsupported_session_mode', async () => {
    const { data: sessRow, error: sessErr } = await admin
      .from('quiz_sessions')
      .insert({
        organization_id: orgId,
        student_id: studentId,
        mode: 'mock_exam',
        subject_id: refs.subjectId,
        config: { question_ids: [saCorrectId] },
        total_questions: 1,
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single<{ id: string }>()
    if (sessErr) throw new Error(`mock_exam session insert: ${sessErr.message}`)
    const examSessionId = sessRow.id
    try {
      const { data, error } = await studentClient.rpc('check_non_mc_answer', {
        p_question_id: saCorrectId,
        p_session_id: examSessionId,
        p_response_text: SA_CANONICAL,
      })
      expect(error).not.toBeNull()
      expect(error?.message).toContain('unsupported_session_mode')
      expect(data).toBeNull()
    } finally {
      const { error: endErr } = await admin
        .from('quiz_sessions')
        .update({ ended_at: new Date().toISOString(), deleted_at: new Date().toISOString() })
        .eq('id', examSessionId)
      if (endErr) console.error('[EL2 cleanup] session left active:', endErr.message)
    }
  })

  // ── EL3: soft-deleted caller ────────────────────────────────────────────────
  it('EL3 — rejects a soft-deleted caller with user_not_found_or_inactive', async () => {
    const delStudentId = await createTestUser({
      admin,
      orgId,
      email: `studentDel-nonmc-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(delStudentId)
    const delClient = await getAuthenticatedClient({
      email: `studentDel-nonmc-${suffix}@test.local`,
      password: 'test-pass-123',
    })
    const { data: sd, error: startErr } = await delClient.rpc('start_quiz_session', {
      p_mode: 'smart_review',
      p_subject_id: null,
      p_topic_id: null,
      p_question_ids: [saCorrectId],
    })
    if (startErr) throw new Error(`startSession (del): ${startErr.message}`)
    if (typeof sd !== 'string') throw new Error('startSession (del): no session id')
    const delSessionId = sd
    try {
      const { error: delErr } = await admin
        .from('users')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', delStudentId)
      if (delErr) throw new Error(`soft-delete: ${delErr.message}`)
      const { error } = await delClient.rpc('check_non_mc_answer', {
        p_question_id: saCorrectId,
        p_session_id: delSessionId,
        p_response_text: SA_CANONICAL,
      })
      expect(error).not.toBeNull()
      expect(error?.message).toContain('user_not_found_or_inactive')
    } finally {
      const { error: endErr } = await admin
        .from('quiz_sessions')
        .update({ ended_at: new Date().toISOString(), deleted_at: new Date().toISOString() })
        .eq('id', delSessionId)
      if (endErr) console.error('[EL3 cleanup] session left active:', endErr.message)
    }
  })

  // ── EL4: non-owner (another student's session) ──────────────────────────────
  it("EL4 — rejects another student's session as not owned", async () => {
    const studentBId = await createTestUser({
      admin,
      orgId,
      email: `studentB-nonmc-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(studentBId)
    const studentBClient = await getAuthenticatedClient({
      email: `studentB-nonmc-${suffix}@test.local`,
      password: 'test-pass-123',
    })
    // studentA owns the session; studentB tries to answer against it.
    const sessionId = await startSession([saCorrectId])
    const { error } = await studentBClient.rpc('check_non_mc_answer', {
      p_question_id: saCorrectId,
      p_session_id: sessionId,
      p_response_text: SA_CANONICAL,
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('session not found or not owned')
  })

  // ── EL5: question not a member of the session ───────────────────────────────
  it('EL5 — rejects a question that is not in the session config', async () => {
    const sessionId = await startSession([saCorrectId])
    const { error } = await studentClient.rpc('check_non_mc_answer', {
      p_question_id: saWrongId, // not in this session's question_ids
      p_session_id: sessionId,
      p_response_text: 'anything',
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('does not belong to session')
  })

  // ── EL6: answer_type_mismatch + invalid_blank_index ─────────────────────────
  it('EL6 — rejects short_answer called with blank_answers (answer_type_mismatch)', async () => {
    const sessionId = await startSession([saCorrectId])
    const { error } = await studentClient.rpc('check_non_mc_answer', {
      p_question_id: saCorrectId,
      p_session_id: sessionId,
      p_blank_answers: [{ blank_index: 0, response_text: 'x' }],
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('answer_type_mismatch')
  })

  it('EL6 — rejects dialog_fill called with response_text (answer_type_mismatch)', async () => {
    const sessionId = await startSession([dfId])
    const { error } = await studentClient.rpc('check_non_mc_answer', {
      p_question_id: dfId,
      p_session_id: sessionId,
      p_response_text: 'some text',
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('answer_type_mismatch')
  })

  it('EL6 — rejects a dialog_fill blank_index not in blanks_config (invalid_blank_index)', async () => {
    const sessionId = await startSession([dfId])
    const { error } = await studentClient.rpc('check_non_mc_answer', {
      p_question_id: dfId,
      p_session_id: sessionId,
      p_blank_answers: [{ blank_index: 99, response_text: 'x' }],
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('invalid_blank_index')
  })

  // ── EM: output contract — short_answer ──────────────────────────────────────
  it('EM — short_answer correct returns is_correct:true and the canonical answer', async () => {
    const sessionId = await startSession([saCorrectId])
    const { data, error } = await studentClient.rpc('check_non_mc_answer', {
      p_question_id: saCorrectId,
      p_session_id: sessionId,
      p_response_text: SA_CANONICAL,
    })
    expect(error).toBeNull()
    const result = asResult(data)
    expect(result.is_correct).toBe(true)
    expect(result.correct_answer).toBe(SA_CANONICAL)
    expect(result.blanks).toBeNull()
    expect(result.explanation_text).toBe('SA explanation')
  })

  it('EM — short_answer wrong returns is_correct:false (distinct failing seed)', async () => {
    // saWrongId canonical is 'squawk seven seven zero zero' — answer with the
    // OTHER question's canonical so a hardcoded-true regression fails here.
    const sessionId = await startSession([saWrongId])
    const { data, error } = await studentClient.rpc('check_non_mc_answer', {
      p_question_id: saWrongId,
      p_session_id: sessionId,
      p_response_text: SA_CANONICAL,
    })
    expect(error).toBeNull()
    const result = asResult(data)
    expect(result.is_correct).toBe(false)
    expect(result.correct_answer).toBe('squawk seven seven zero zero')
  })

  // ── EM: output contract — dialog_fill ───────────────────────────────────────
  it('EM — dialog_fill all blanks correct returns is_correct:true with per-blank results', async () => {
    const sessionId = await startSession([dfId])
    const { data, error } = await studentClient.rpc('check_non_mc_answer', {
      p_question_id: dfId,
      p_session_id: sessionId,
      p_blank_answers: [
        { blank_index: 0, response_text: DF_B0 },
        { blank_index: 1, response_text: DF_B1 },
        { blank_index: 2, response_text: DF_B2 },
      ],
    })
    expect(error).toBeNull()
    const result = asResult(data)
    expect(result.is_correct).toBe(true)
    expect(result.correct_answer).toBeNull()
    if (!Array.isArray(result.blanks)) throw new Error('blanks is not an array')
    expect(result.blanks).toHaveLength(3)
    for (const b of result.blanks) {
      expect(b.is_correct).toBe(true)
    }
    expect(result.blanks.map((b) => b.canonical)).toEqual([DF_B0, DF_B1, DF_B2])
  })

  it('EM — dialog_fill 2-of-3 blanks correct returns is_correct:FALSE (full-coverage rule)', async () => {
    // All 3 blanks submitted, blank 2 wrong → 2 true + 1 false, top-level FALSE.
    const sessionId = await startSession([dfId])
    const { data, error } = await studentClient.rpc('check_non_mc_answer', {
      p_question_id: dfId,
      p_session_id: sessionId,
      p_blank_answers: [
        { blank_index: 0, response_text: DF_B0 },
        { blank_index: 1, response_text: DF_B1 },
        { blank_index: 2, response_text: 'totally wrong' },
      ],
    })
    expect(error).toBeNull()
    const result = asResult(data)
    expect(result.is_correct).toBe(false)
    if (!Array.isArray(result.blanks)) throw new Error('blanks is not an array')
    const byIndex = new Map(result.blanks.map((b) => [b.index, b.is_correct]))
    expect(byIndex.get(0)).toBe(true)
    expect(byIndex.get(1)).toBe(true)
    expect(byIndex.get(2)).toBe(false)
  })

  it('EM — dialog_fill with a blank omitted (2 of 3 submitted, both correct) returns is_correct:FALSE (coverage)', async () => {
    // Only blanks 0 and 1 submitted (both correct); blank 2 missing → coverage
    // rule makes top-level FALSE even though every submitted blank is correct.
    const sessionId = await startSession([dfId])
    const { data, error } = await studentClient.rpc('check_non_mc_answer', {
      p_question_id: dfId,
      p_session_id: sessionId,
      p_blank_answers: [
        { blank_index: 0, response_text: DF_B0 },
        { blank_index: 1, response_text: DF_B1 },
      ],
    })
    expect(error).toBeNull()
    const result = asResult(data)
    expect(result.is_correct).toBe(false)
    if (!Array.isArray(result.blanks)) throw new Error('blanks is not an array')
    expect(result.blanks).toHaveLength(2)
    for (const b of result.blanks) {
      expect(b.is_correct).toBe(true)
    }
  })

  it('EM — rejects calling MC through this non-MC grader (unsupported_question_type)', async () => {
    const sessionId = await startSession([mcId])
    const { error } = await studentClient.rpc('check_non_mc_answer', {
      p_question_id: mcId,
      p_session_id: sessionId,
      p_response_text: 'b',
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('unsupported_question_type')
  })
})
