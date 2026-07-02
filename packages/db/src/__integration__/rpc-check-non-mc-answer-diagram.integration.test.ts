import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanupReferenceData, cleanupTestData, clearActiveSessions } from './cleanup'
import { requireRpcResult } from './guards'
import { seedReferenceData } from './seed'
import {
  createTestOrg,
  createTestUser,
  getAdminClient,
  getAnonClient,
  getAuthenticatedClient,
} from './setup'

// check_non_mc_answer grades the `diagram_label` type for immediate feedback
// (mig 153, #697 Phase 6). Correctness is a SET comparison (order in the
// p_mapping array is meaningless, unlike ordering): every zone must be
// covered exactly once and each submitted {zone_id,label_id} pair must match
// the canonical diagram_config.answer entry for that zone. The diagram branch
// + the 4-way answer_type_mismatch parity (every OTHER branch's mismatch
// guard now also rejects a non-NULL p_mapping) only run when the function
// EXECUTES against real rows — a `db reset` proves only that it parses.
// Mirrors the EL guard / EM output-contract coverage of the Phase 2 sibling
// and the ordering sibling (rpc-check-non-mc-answer-ordering.integration.test.ts).

type Zone = { id: string; x: number; y: number; w: number; h: number }
type Label = { id: string; text: string }
type AnswerEntry = { zone_id: string; label_id: string }
type DiagramConfig = { image_ref: string; zones: Zone[]; labels: Label[]; answer: AnswerEntry[] }

type CheckNonMcResult = {
  is_correct: boolean
  correct_answer: string | null
  blanks: unknown
  correct_order: string[] | null
  correct_mapping: AnswerEntry[] | null
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

describe('RPC: check_non_mc_answer — diagram_label grading + guards', () => {
  const admin = getAdminClient()
  let orgId = ''
  let adminUserId: string
  let studentId: string
  let bankId: string
  let studentClient: SupabaseClient
  let refs: Awaited<ReturnType<typeof seedReferenceData>> | null = null
  const userIds: string[] = []
  const suffix = Date.now()

  let diagramAId: string
  let diagramBId: string
  let saId: string

  // CONFIG_A: 3 zones, one unused distractor label. Zone/label ids use
  // UNRELATED naming schemes (mig 150 header security invariant).
  const CONFIG_A: DiagramConfig = {
    image_ref: 'rwy-27-09-lh-pattern',
    zones: [
      { id: 'zone-nw', x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
      { id: 'zone-ne', x: 0.6, y: 0.1, w: 0.2, h: 0.2 },
      { id: 'zone-sw', x: 0.1, y: 0.6, w: 0.2, h: 0.2 },
    ],
    labels: [
      { id: 'lbl-alpha', text: 'Upwind Leg' },
      { id: 'lbl-bravo', text: 'Crosswind Leg' },
      { id: 'lbl-charlie', text: 'Downwind Leg' },
      { id: 'lbl-distract', text: 'Base Leg (unused)' },
    ],
    answer: [
      { zone_id: 'zone-nw', label_id: 'lbl-alpha' },
      { zone_id: 'zone-ne', label_id: 'lbl-bravo' },
      { zone_id: 'zone-sw', label_id: 'lbl-charlie' },
    ],
  }
  // CONFIG_B: distinct zone/label ids and a distinct canonical mapping — proves
  // the RPC re-reads diagram_config per question rather than returning a
  // hardcoded value (code-style.md §7 "assert the full output contract").
  const CONFIG_B: DiagramConfig = {
    image_ref: 'rwy-27-09-lh-pattern',
    zones: [
      { id: 'zone-x1', x: 0.3, y: 0.3, w: 0.1, h: 0.1 },
      { id: 'zone-x2', x: 0.7, y: 0.7, w: 0.1, h: 0.1 },
    ],
    labels: [
      { id: 'lbl-q8', text: 'Right Base' },
      { id: 'lbl-q9', text: 'Left Base' },
    ],
    answer: [
      { zone_id: 'zone-x1', label_id: 'lbl-q9' },
      { zone_id: 'zone-x2', label_id: 'lbl-q8' },
    ],
  }
  const SA_CANONICAL = 'wilco'

  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `Test Org DiagramNonMC ${suffix}`,
      slug: `test-diagramnonmc-${suffix}`,
    })
    adminUserId = await createTestUser({
      admin,
      orgId,
      email: `admin-diagramnonmc-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'admin',
    })
    userIds.push(adminUserId)
    studentId = await createTestUser({
      admin,
      orgId,
      email: `student-diagramnonmc-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(studentId)
    studentClient = await getAuthenticatedClient({
      email: `student-diagramnonmc-${suffix}@test.local`,
      password: 'test-pass-123',
    })
    refs = await seedReferenceData({
      admin,
      subjectCode: `DN${suffix}`,
      subjectName: `DiagramNonMC Subject ${suffix}`,
      topicCode: `DN${suffix}-01`,
      topicName: `DiagramNonMC Topic ${suffix}`,
    })

    const { data: bank, error: bankErr } = await admin
      .from('question_banks')
      .insert({
        organization_id: orgId,
        name: `DiagramNonMC Bank ${suffix}`,
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

    diagramAId = await insertQuestion(admin, {
      ...base,
      question_type: 'diagram_label',
      question_text: 'Label the traffic pattern (A)',
      diagram_config: CONFIG_A,
      explanation_text: 'Diagram A explanation',
    })
    diagramBId = await insertQuestion(admin, {
      ...base,
      question_type: 'diagram_label',
      question_text: 'Label the traffic pattern (B)',
      diagram_config: CONFIG_B,
      explanation_text: 'Diagram B explanation',
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
    // §7 per-step accumulator: isolate each cleanup so a failure in one does not
    // skip the next (and leak rows). Reference cleanup is FK-dependent on test
    // cleanup, so it is gated on `errors.length === 0`.
    const errors: string[] = []
    if (orgId) {
      try {
        await cleanupTestData({ admin, orgId, userIds })
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e))
      }
    }
    if (refs && errors.length === 0) {
      try {
        await cleanupReferenceData({ admin, refs: [refs] })
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e))
      }
    }
    if (errors.length > 0) throw new Error(`afterAll: ${errors.join('; ')}`)
  })

  // Single-active-session invariant (#1011): each test starts a fresh session for
  // the reused test student, so clear any still-active session left by the prior
  // test before the next start RPC raises `another_session_active`.
  beforeEach(async () => {
    await clearActiveSessions({ admin, studentIds: [studentId] })
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

  // ── output contract: correct / incorrect / anti-hardcode / partial ─────────
  it('grades a fully-correct mapping as is_correct:true and reveals the canonical mapping', async () => {
    const sessionId = await startSession(studentClient, [diagramAId])
    const { data, error } = await studentClient.rpc('check_non_mc_answer', {
      p_question_id: diagramAId,
      p_session_id: sessionId,
      p_mapping: CONFIG_A.answer,
    })
    expect(error).toBeNull()
    const result = asResult(data)
    expect(result.is_correct).toBe(true)
    expect(result.correct_answer).toBeNull()
    expect(result.blanks).toBeNull()
    expect(result.correct_order).toBeNull()
    expect(result.correct_mapping).toEqual(CONFIG_A.answer)
    expect(result.explanation_text).toBe('Diagram A explanation')
  })

  it('grades a correct mapping submitted in a shuffled order as is_correct:true (set comparison, not positional)', async () => {
    // The grader (mig 153) compares the submitted {zone_id,label_id} SET, so a
    // correct mapping in a different array order must still grade true. Every
    // other is_correct case submits CONFIG_A.answer in canonical order — without
    // this case a regression to positional/array-ordinal comparison would pass
    // them all.
    const shuffled = [...CONFIG_A.answer].reverse()
    const sessionId = await startSession(studentClient, [diagramAId])
    const { data, error } = await studentClient.rpc('check_non_mc_answer', {
      p_question_id: diagramAId,
      p_session_id: sessionId,
      p_mapping: shuffled,
    })
    expect(error).toBeNull()
    const result = asResult(data)
    expect(result.is_correct).toBe(true)
    expect(result.correct_mapping).toEqual(CONFIG_A.answer)
  })

  it('grades a mapping with two swapped zones as is_correct:false but still reveals the canonical mapping', async () => {
    const swapped: AnswerEntry[] = [
      { zone_id: 'zone-nw', label_id: 'lbl-bravo' },
      { zone_id: 'zone-ne', label_id: 'lbl-alpha' },
      { zone_id: 'zone-sw', label_id: 'lbl-charlie' },
    ]
    const sessionId = await startSession(studentClient, [diagramAId])
    const { data, error } = await studentClient.rpc('check_non_mc_answer', {
      p_question_id: diagramAId,
      p_session_id: sessionId,
      p_mapping: swapped,
    })
    expect(error).toBeNull()
    const result = asResult(data)
    expect(result.is_correct).toBe(false)
    expect(result.correct_mapping).toEqual(CONFIG_A.answer)
  })

  it('grades a fully-correct mapping for a second, distinct diagram question with its own canonical mapping', async () => {
    // Anti-hardcode: a distinct fixture (CONFIG_B) with an unrelated id scheme
    // and a different canonical mapping than CONFIG_A.
    const sessionId = await startSession(studentClient, [diagramBId])
    const { data, error } = await studentClient.rpc('check_non_mc_answer', {
      p_question_id: diagramBId,
      p_session_id: sessionId,
      p_mapping: CONFIG_B.answer,
    })
    expect(error).toBeNull()
    const result = asResult(data)
    expect(result.is_correct).toBe(true)
    expect(result.correct_mapping).toEqual(CONFIG_B.answer)
    expect(result.correct_mapping).not.toEqual(CONFIG_A.answer)
  })

  it('grades a partial mapping (fewer entries than zones) as is_correct:false (full-coverage rule)', async () => {
    const partial = CONFIG_A.answer.slice(0, 2)
    const sessionId = await startSession(studentClient, [diagramAId])
    const { data, error } = await studentClient.rpc('check_non_mc_answer', {
      p_question_id: diagramAId,
      p_session_id: sessionId,
      p_mapping: partial,
    })
    expect(error).toBeNull()
    const result = asResult(data)
    expect(result.is_correct).toBe(false)
    expect(result.correct_mapping).toEqual(CONFIG_A.answer)
  })

  // ── guard rejections ────────────────────────────────────────────────────────
  it('rejects an unauthenticated caller', async () => {
    const anon = getAnonClient()
    const sessionId = await startSession(studentClient, [diagramAId])
    const { error } = await anon.rpc('check_non_mc_answer', {
      p_question_id: diagramAId,
      p_session_id: sessionId,
      p_mapping: CONFIG_A.answer,
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('not_authenticated')
  })

  it('rejects a diagram mapping submitted during a mock exam', async () => {
    const { data: sessRow, error: sessErr } = await admin
      .from('quiz_sessions')
      .insert({
        organization_id: orgId,
        student_id: studentId,
        mode: 'mock_exam',
        subject_id: refs!.subjectId,
        config: { question_ids: [diagramAId] },
        total_questions: 1,
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single<{ id: string }>()
    if (sessErr) throw new Error(`mock_exam session insert: ${sessErr.message}`)
    // sessErr checked above; PostgREST .single() returns a row or an error, never both null.
    const examSessionId = sessRow!.id
    try {
      const { data, error } = await studentClient.rpc('check_non_mc_answer', {
        p_question_id: diagramAId,
        p_session_id: examSessionId,
        p_mapping: CONFIG_A.answer,
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

  it('rejects a diagram mapping submitted during an internal exam', async () => {
    const { data: sessRow, error: sessErr } = await admin
      .from('quiz_sessions')
      .insert({
        organization_id: orgId,
        student_id: studentId,
        mode: 'internal_exam',
        subject_id: refs!.subjectId,
        config: { question_ids: [diagramAId] },
        total_questions: 1,
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single<{ id: string }>()
    if (sessErr) throw new Error(`internal_exam session insert: ${sessErr.message}`)
    // sessErr checked above; PostgREST .single() returns a row or an error, never both null.
    const examSessionId = sessRow!.id
    try {
      const { error } = await studentClient.rpc('check_non_mc_answer', {
        p_question_id: diagramAId,
        p_session_id: examSessionId,
        p_mapping: CONFIG_A.answer,
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

  it('rejects a soft-deleted caller', async () => {
    const delStudentId = await createTestUser({
      admin,
      orgId,
      email: `studentDel-diagramnonmc-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(delStudentId)
    const delClient = await getAuthenticatedClient({
      email: `studentDel-diagramnonmc-${suffix}@test.local`,
      password: 'test-pass-123',
    })
    const delSessionId = await startSession(delClient, [diagramAId])
    try {
      const { error: delErr } = await admin
        .from('users')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', delStudentId)
      if (delErr) throw new Error(`soft-delete: ${delErr.message}`)
      const { error } = await delClient.rpc('check_non_mc_answer', {
        p_question_id: diagramAId,
        p_session_id: delSessionId,
        p_mapping: CONFIG_A.answer,
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
      email: `studentB-diagramnonmc-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(studentBId)
    const studentBClient = await getAuthenticatedClient({
      email: `studentB-diagramnonmc-${suffix}@test.local`,
      password: 'test-pass-123',
    })
    const sessionId = await startSession(studentClient, [diagramAId])
    const { error } = await studentBClient.rpc('check_non_mc_answer', {
      p_question_id: diagramAId,
      p_session_id: sessionId,
      p_mapping: CONFIG_A.answer,
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('session not found or not owned')
  })

  it('rejects a question that is not a member of the session config', async () => {
    // Session pins the short_answer question; submit a diagram id not in it.
    const sessionId = await startSession(studentClient, [saId])
    const { error } = await studentClient.rpc('check_non_mc_answer', {
      p_question_id: diagramAId,
      p_session_id: sessionId,
      p_mapping: CONFIG_A.answer,
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('does not belong to session')
  })

  it('rejects a diagram_label question answered with free text', async () => {
    const sessionId = await startSession(studentClient, [diagramAId])
    const { error } = await studentClient.rpc('check_non_mc_answer', {
      p_question_id: diagramAId,
      p_session_id: sessionId,
      p_response_text: 'some text',
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('answer_type_mismatch')
  })

  it('rejects a diagram_label question answered with dialog-fill blanks', async () => {
    const sessionId = await startSession(studentClient, [diagramAId])
    const { error } = await studentClient.rpc('check_non_mc_answer', {
      p_question_id: diagramAId,
      p_session_id: sessionId,
      p_blank_answers: [{ blank_index: 0, response_text: 'x' }],
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('answer_type_mismatch')
  })

  it('rejects a diagram_label question answered with an ordering payload', async () => {
    const sessionId = await startSession(studentClient, [diagramAId])
    const { error } = await studentClient.rpc('check_non_mc_answer', {
      p_question_id: diagramAId,
      p_session_id: sessionId,
      p_order: ['a', 'b'],
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('answer_type_mismatch')
  })

  it('rejects a short-answer question answered with a diagram mapping payload', async () => {
    // The 4-way parity added by mig 153: every non-diagram branch's mismatch
    // guard also rejects a non-NULL p_mapping.
    const sessionId = await startSession(studentClient, [saId])
    const { error } = await studentClient.rpc('check_non_mc_answer', {
      p_question_id: saId,
      p_session_id: sessionId,
      p_mapping: CONFIG_A.answer,
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('answer_type_mismatch')
  })

  it('rejects a non-array diagram mapping payload instead of surfacing a raw JSON error', async () => {
    // The jsonb_typeof array guard (mig 153) rejects a scalar/object p_mapping
    // cleanly, before it can reach jsonb_array_length and surface a raw 22023.
    const sessionId = await startSession(studentClient, [diagramAId])
    const { error } = await studentClient.rpc('check_non_mc_answer', {
      p_question_id: diagramAId,
      p_session_id: sessionId,
      p_mapping: { not: 'array' } as unknown as AnswerEntry[],
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('answer_type_mismatch')
    expect(error?.code).not.toBe('22023')
  })

  it('rejects a diagram mapping whose elements are scalars instead of {zone_id,label_id} objects', async () => {
    // Per-element guard (mig 153): each p_mapping array element must be a JSON
    // object, mirroring the dialog_fill per-entry guard — a scalar element
    // must be rejected cleanly, not throw a raw error when the function tries
    // to read zone_id/label_id off it.
    const sessionId = await startSession(studentClient, [diagramAId])
    const { error } = await studentClient.rpc('check_non_mc_answer', {
      p_question_id: diagramAId,
      p_session_id: sessionId,
      p_mapping: [1, 2, 3] as unknown as AnswerEntry[],
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('answer_type_mismatch')
    expect(error?.code).not.toBe('22023')
  })
})
