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

// check_non_mc_answer grades the `ordering` type for immediate feedback (mig 137,
// #697 Phase 5). The ordering branch (full-coverage id-sequence comparison +
// canonical-text reveal) and the answer_type_mismatch guard only run when the
// function EXECUTES against real rows — a `db reset` proves only that it parses.
// Mirrors the EL guard / EM output-contract coverage of the Phase 2 sibling
// (rpc-check-non-mc-answer.integration.test.ts).

type CheckNonMcResult = {
  is_correct: boolean
  correct_answer: string | null
  blanks: unknown
  correct_order: string[] | null
  explanation_text: string | null
  explanation_image_url: string | null
}

function asResult(data: unknown): CheckNonMcResult {
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

describe('RPC: check_non_mc_answer — ordering grading + guards', () => {
  const admin = getAdminClient()
  let orgId: string
  let adminUserId: string
  let studentId: string
  let bankId: string
  let studentClient: SupabaseClient
  let refs: Awaited<ReturnType<typeof seedReferenceData>>
  const userIds: string[] = []
  const suffix = Date.now()

  let orderingId: string
  let saId: string

  // Canonical sequence = ARRAY ORDER. Opaque ids (not 1..N).
  const ITEMS = [
    { id: 'item-w', text: 'MAYDAY MAYDAY MAYDAY' },
    { id: 'item-x', text: 'Golf Bravo Charlie' },
    { id: 'item-y', text: 'engine failure' },
    { id: 'item-z', text: 'forced landing' },
  ]
  const CANONICAL_IDS = ITEMS.map((i) => i.id)
  const SA_CANONICAL = 'wilco'

  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `Test Org OrderNonMC ${suffix}`,
      slug: `test-ordernonmc-${suffix}`,
    })
    adminUserId = await createTestUser({
      admin,
      orgId,
      email: `admin-ordernonmc-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'admin',
    })
    userIds.push(adminUserId)
    studentId = await createTestUser({
      admin,
      orgId,
      email: `student-ordernonmc-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(studentId)
    studentClient = await getAuthenticatedClient({
      email: `student-ordernonmc-${suffix}@test.local`,
      password: 'test-pass-123',
    })
    refs = await seedReferenceData({
      admin,
      subjectCode: `ON${suffix}`,
      subjectName: `OrderNonMC Subject ${suffix}`,
      topicCode: `ON${suffix}-01`,
      topicName: `OrderNonMC Topic ${suffix}`,
    })

    const { data: bank, error: bankErr } = await admin
      .from('question_banks')
      .insert({
        organization_id: orgId,
        name: `OrderNonMC Bank ${suffix}`,
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

    orderingId = await insertQuestion(admin, {
      ...base,
      question_type: 'ordering',
      question_text: 'Sequence the distress call',
      ordering_items: ITEMS,
      explanation_text: 'Ordering explanation',
    })
    saId = await insertQuestion(admin, {
      ...base,
      question_type: 'short_answer',
      question_text: 'Acknowledge?',
      canonical_answer: SA_CANONICAL,
      explanation_text: 'SA explanation',
    })
  })

  afterAll(async () => {
    await cleanupTestData({ admin, orgId, userIds })
    await cleanupReferenceData({ admin, refs: [refs] })
  })

  /** Start a smart_review session pinning the given question ids. */
  async function startSession(
    client: SupabaseClient,
    qIds: string[],
    mode: 'smart_review' | 'quick_quiz' = 'smart_review',
  ): Promise<string> {
    const { data, error } = await client.rpc('start_quiz_session', {
      p_mode: mode,
      p_subject_id: null,
      p_topic_id: null,
      p_question_ids: qIds,
    })
    if (error) throw new Error(`startSession: ${error.message}`)
    if (typeof data !== 'string') throw new Error('startSession: no session id')
    return data
  }

  // ── output contract: correct ordering ───────────────────────────────────────
  it('grades a fully-correct order as is_correct:true and reveals the canonical text order', async () => {
    const sessionId = await startSession(studentClient, [orderingId])
    const { data, error } = await studentClient.rpc('check_non_mc_answer', {
      p_question_id: orderingId,
      p_session_id: sessionId,
      p_order: CANONICAL_IDS,
    })
    expect(error).toBeNull()
    const result = asResult(data)
    expect(result.is_correct).toBe(true)
    expect(result.correct_answer).toBeNull()
    expect(result.blanks).toBeNull()
    expect(result.correct_order).toEqual(CANONICAL_IDS)
    expect(result.explanation_text).toBe('Ordering explanation')
  })

  it('grades a permuted order as is_correct:false but still reveals the canonical id order', async () => {
    // Swap the first two ids → not the canonical sequence.
    const permuted = [CANONICAL_IDS[1], CANONICAL_IDS[0], CANONICAL_IDS[2], CANONICAL_IDS[3]]
    const sessionId = await startSession(studentClient, [orderingId])
    const { data, error } = await studentClient.rpc('check_non_mc_answer', {
      p_question_id: orderingId,
      p_session_id: sessionId,
      p_order: permuted,
    })
    expect(error).toBeNull()
    const result = asResult(data)
    expect(result.is_correct).toBe(false)
    expect(result.correct_order).toEqual(CANONICAL_IDS)
  })

  it('grades a wrong-length order as is_correct:false (full-coverage rule)', async () => {
    // Only the first 3 of 4 ids submitted, all in canonical position → still FALSE
    // because the length does not match (incomplete sequence).
    const tooShort = CANONICAL_IDS.slice(0, 3)
    const sessionId = await startSession(studentClient, [orderingId])
    const { data, error } = await studentClient.rpc('check_non_mc_answer', {
      p_question_id: orderingId,
      p_session_id: sessionId,
      p_order: tooShort,
    })
    expect(error).toBeNull()
    const result = asResult(data)
    expect(result.is_correct).toBe(false)
    expect(result.correct_order).toEqual(CANONICAL_IDS)
  })

  // ── guard rejections ────────────────────────────────────────────────────────
  it('rejects an unauthenticated caller with not_authenticated', async () => {
    const anon = getAnonClient()
    const sessionId = await startSession(studentClient, [orderingId])
    const { error } = await anon.rpc('check_non_mc_answer', {
      p_question_id: orderingId,
      p_session_id: sessionId,
      p_order: CANONICAL_IDS,
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('not_authenticated')
  })

  it('rejects a mock_exam session with unsupported_session_mode', async () => {
    const { data: sessRow, error: sessErr } = await admin
      .from('quiz_sessions')
      .insert({
        organization_id: orgId,
        student_id: studentId,
        mode: 'mock_exam',
        subject_id: refs.subjectId,
        config: { question_ids: [orderingId] },
        total_questions: 1,
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single<{ id: string }>()
    if (sessErr) throw new Error(`mock_exam session insert: ${sessErr.message}`)
    const examSessionId = sessRow.id
    try {
      const { data, error } = await studentClient.rpc('check_non_mc_answer', {
        p_question_id: orderingId,
        p_session_id: examSessionId,
        p_order: CANONICAL_IDS,
      })
      expect(error).not.toBeNull()
      expect(error?.message).toContain('unsupported_session_mode')
      expect(data).toBeNull()
    } finally {
      const { error: endErr } = await admin
        .from('quiz_sessions')
        .update({ ended_at: new Date().toISOString(), deleted_at: new Date().toISOString() })
        .eq('id', examSessionId)
      if (endErr) console.error('[mock_exam cleanup] session left active:', endErr.message)
    }
  })

  it('rejects an internal_exam session with unsupported_session_mode', async () => {
    const { data: sessRow, error: sessErr } = await admin
      .from('quiz_sessions')
      .insert({
        organization_id: orgId,
        student_id: studentId,
        mode: 'internal_exam',
        subject_id: refs.subjectId,
        config: { question_ids: [orderingId] },
        total_questions: 1,
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single<{ id: string }>()
    if (sessErr) throw new Error(`internal_exam session insert: ${sessErr.message}`)
    const examSessionId = sessRow.id
    try {
      const { error } = await studentClient.rpc('check_non_mc_answer', {
        p_question_id: orderingId,
        p_session_id: examSessionId,
        p_order: CANONICAL_IDS,
      })
      expect(error).not.toBeNull()
      expect(error?.message).toContain('unsupported_session_mode')
    } finally {
      const { error: endErr } = await admin
        .from('quiz_sessions')
        .update({ ended_at: new Date().toISOString(), deleted_at: new Date().toISOString() })
        .eq('id', examSessionId)
      if (endErr) console.error('[internal_exam cleanup] session left active:', endErr.message)
    }
  })

  it('rejects a soft-deleted caller with user_not_found_or_inactive', async () => {
    const delStudentId = await createTestUser({
      admin,
      orgId,
      email: `studentDel-ordernonmc-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(delStudentId)
    const delClient = await getAuthenticatedClient({
      email: `studentDel-ordernonmc-${suffix}@test.local`,
      password: 'test-pass-123',
    })
    const delSessionId = await startSession(delClient, [orderingId])
    try {
      const { error: delErr } = await admin
        .from('users')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', delStudentId)
      if (delErr) throw new Error(`soft-delete: ${delErr.message}`)
      const { error } = await delClient.rpc('check_non_mc_answer', {
        p_question_id: orderingId,
        p_session_id: delSessionId,
        p_order: CANONICAL_IDS,
      })
      expect(error).not.toBeNull()
      expect(error?.message).toContain('user_not_found_or_inactive')
    } finally {
      const { error: endErr } = await admin
        .from('quiz_sessions')
        .update({ ended_at: new Date().toISOString(), deleted_at: new Date().toISOString() })
        .eq('id', delSessionId)
      if (endErr) console.error('[soft-delete cleanup] session left active:', endErr.message)
    }
  })

  it("rejects another student's session as not owned", async () => {
    const studentBId = await createTestUser({
      admin,
      orgId,
      email: `studentB-ordernonmc-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(studentBId)
    const studentBClient = await getAuthenticatedClient({
      email: `studentB-ordernonmc-${suffix}@test.local`,
      password: 'test-pass-123',
    })
    const sessionId = await startSession(studentClient, [orderingId])
    const { error } = await studentBClient.rpc('check_non_mc_answer', {
      p_question_id: orderingId,
      p_session_id: sessionId,
      p_order: CANONICAL_IDS,
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('session not found or not owned')
  })

  it('rejects a question that is not a member of the session config', async () => {
    // Session pins the short_answer question; submit an ordering id not in it.
    const sessionId = await startSession(studentClient, [saId])
    const { error } = await studentClient.rpc('check_non_mc_answer', {
      p_question_id: orderingId,
      p_session_id: sessionId,
      p_order: CANONICAL_IDS,
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('does not belong to session')
  })

  it('rejects an ordering question answered with response_text (answer_type_mismatch)', async () => {
    const sessionId = await startSession(studentClient, [orderingId])
    const { error } = await studentClient.rpc('check_non_mc_answer', {
      p_question_id: orderingId,
      p_session_id: sessionId,
      p_response_text: 'some text',
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('answer_type_mismatch')
  })

  it('rejects an ordering question answered with blank_answers (answer_type_mismatch)', async () => {
    const sessionId = await startSession(studentClient, [orderingId])
    const { error } = await studentClient.rpc('check_non_mc_answer', {
      p_question_id: orderingId,
      p_session_id: sessionId,
      p_blank_answers: [{ blank_index: 0, response_text: 'x' }],
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('answer_type_mismatch')
  })

  it('rejects a short_answer question answered with p_order (answer_type_mismatch)', async () => {
    const sessionId = await startSession(studentClient, [saId])
    const { error } = await studentClient.rpc('check_non_mc_answer', {
      p_question_id: saId,
      p_session_id: sessionId,
      p_order: CANONICAL_IDS,
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('answer_type_mismatch')
  })
})
