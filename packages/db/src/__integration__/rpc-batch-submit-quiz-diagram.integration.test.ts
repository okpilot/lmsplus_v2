import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanupReferenceData, cleanupTestData, clearActiveSessions } from './cleanup'
import { requireRpcResult } from './guards'
import { seedReferenceData } from './seed'
import { createTestOrg, createTestUser, getAdminClient, getAuthenticatedClient } from './setup'

// batch_submit_quiz dispatches the `diagram_label` type (mig 155, #697 Phase 6).
// These behaviors only run when the function EXECUTES against real rows — a
// `db reset` proves only that the body parses:
//   * per-zone row persistence (one quiz_session_answers row per submitted
//     zone, response_text = the PLACED LABEL's text, blank_index = the
//     SERVER-DERIVED zone ordinal — not the client's dedup-only blank_index —
//     selected_option_id NULL),
//   * the per-zone INSERTs survive the mig-151 widened blank_index trigger,
//   * the DISTINCT-question partial-credit roll-up folds per-zone rows into a
//     fractional numerator (2-of-3 zones → 66.67%, correct_count 2),
//   * the INVERTED self-defence (distractors + partial submission ALLOWED;
//     duplicate zone/label placement REJECTED — this is NOT ordering's
//     complete-permutation check),
//   * REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated on
//     _grade_record_diagram_label is covered separately
//     (rpc-grade-record-diagram-revoke.integration.test.ts).

type Zone = { id: string; x: number; y: number; w: number; h: number }
type Label = { id: string; text: string }
type AnswerEntry = { zone_id: string; label_id: string }
type DiagramConfig = { image_ref: string; zones: Zone[]; labels: Label[]; answer: AnswerEntry[] }

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

describe('RPC: batch_submit_quiz — diagram_label dispatch + partial credit + self-defence', () => {
  const admin = getAdminClient()
  let orgId = ''
  let adminUserId: string
  let studentId: string
  let bankId: string
  let studentClient: SupabaseClient
  let refs: Awaited<ReturnType<typeof seedReferenceData>> | null = null
  const userIds: string[] = []
  const suffix = Date.now()

  let diagramId: string

  // 3 zones + 1 unused distractor label. Zone/label ids use UNRELATED naming
  // schemes (mig 150 header security invariant).
  const CONFIG: DiagramConfig = {
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
  const DISTRACTOR_TEXT = 'Base Leg (unused)'

  /** Build the fan-out payload the client produces: one entry per submitted
   *  zone placement. zone id in response_text, label id in selected_option;
   *  blank_index only satisfies the (question_id,blank_index) dedup-guard and
   *  is DISCARDED server-side — the grader derives the true zone ordinal. */
  function diagramPayload(
    qId: string,
    placements: Array<{ zoneId: string; labelId: string }>,
  ): Array<Record<string, unknown>> {
    return placements.map((p, i) => ({
      question_id: qId,
      selected_option: p.labelId,
      response_text: p.zoneId,
      blank_index: i,
      response_time_ms: 1000,
    }))
  }

  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `Test Org BatchDiagram ${suffix}`,
      slug: `test-batchdiagram-${suffix}`,
    })
    adminUserId = await createTestUser({
      admin,
      orgId,
      email: `admin-batchdiagram-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'admin',
    })
    userIds.push(adminUserId)
    studentId = await createTestUser({
      admin,
      orgId,
      email: `student-batchdiagram-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(studentId)
    studentClient = await getAuthenticatedClient({
      email: `student-batchdiagram-${suffix}@test.local`,
      password: 'test-pass-123',
    })
    refs = await seedReferenceData({
      admin,
      subjectCode: `BD${suffix}`,
      subjectName: `BatchDiagram Subject ${suffix}`,
      topicCode: `BD${suffix}-01`,
      topicName: `BatchDiagram Topic ${suffix}`,
    })

    const { data: bank, error: bankErr } = await admin
      .from('question_banks')
      .insert({
        organization_id: orgId,
        name: `BatchDiagram Bank ${suffix}`,
        created_by: adminUserId,
      })
      .select('id')
      .single()
    if (bankErr) throw new Error(`seed bank: ${bankErr.message}`)
    bankId = requireRpcResult<{ id: string }>(bank, 'question_banks insert').id

    diagramId = await insertQuestion(admin, {
      organization_id: orgId,
      bank_id: bankId,
      subject_id: refs.subjectId,
      topic_id: refs.topicId,
      subtopic_id: null,
      difficulty: 'medium',
      status: 'active',
      created_by: adminUserId,
      question_type: 'diagram_label',
      question_text: 'Label the traffic pattern (3 zones)',
      diagram_config: CONFIG,
      explanation_text: 'Diagram explanation',
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

  // Single-active-session invariant (#1011): each grading test starts a fresh
  // session for the reused test student, so clear any still-active session
  // left by the prior test before the next start RPC raises `another_session_active`.
  beforeEach(async () => {
    await clearActiveSessions({ admin, studentIds: [studentId] })
  })

  async function startSession(qIds: string[]): Promise<string> {
    const { data, error } = await studentClient.rpc('start_quiz_session', {
      p_mode: 'quick_quiz',
      // refs is assigned in beforeAll; non-null by the time any test runs.
      p_subject_id: refs!.subjectId,
      p_topic_id: refs!.topicId,
      p_question_ids: qIds,
    })
    if (error) throw new Error(`startSession: ${error.message}`)
    if (typeof data !== 'string') throw new Error('startSession: no session id')
    return data
  }

  it('persists one row per submitted zone (label text, derived zone-ordinal blank_index, no selected_option_id) and never places the unused distractor', async () => {
    const sessionId = await startSession([diagramId])
    const { error } = await studentClient.rpc('batch_submit_quiz', {
      p_session_id: sessionId,
      p_answers: diagramPayload(
        diagramId,
        CONFIG.answer.map((a) => ({ zoneId: a.zone_id, labelId: a.label_id })),
      ),
    })
    expect(error).toBeNull()

    const { data: rows, error: rowsErr } = await admin
      .from('quiz_session_answers')
      .select('selected_option_id, response_text, blank_index, is_correct')
      .eq('session_id', sessionId)
      .eq('question_id', diagramId)
      .order('blank_index', { ascending: true })
    expect(rowsErr).toBeNull()
    if (!Array.isArray(rows)) throw new Error('expected an array of answer rows')
    expect(rows).toHaveLength(3)
    const typed = rows as Array<{
      selected_option_id: string | null
      response_text: string | null
      blank_index: number | null
      is_correct: boolean
    }>
    // Server-derived zone ordinals: zone-nw=0, zone-ne=1, zone-sw=2 (CONFIG.zones order).
    expect(typed.map((r) => r.blank_index)).toEqual([0, 1, 2])
    for (const r of typed) {
      expect(r.selected_option_id).toBeNull()
      expect(r.is_correct).toBe(true)
    }
    // response_text is the PLACED LABEL's display text, not its id.
    expect(typed.map((r) => r.response_text)).toEqual([
      'Upwind Leg',
      'Crosswind Leg',
      'Downwind Leg',
    ])
    expect(typed.map((r) => r.response_text)).not.toContain(DISTRACTOR_TEXT)
  })

  it('scores a 2-of-3-zone submission (leftover distractor, one zone unanswered) as 66.67% with correct_count 2', async () => {
    // Only zone-nw and zone-ne answered correctly; zone-sw and the distractor
    // label are both left unplaced — partial submission is explicitly ALLOWED
    // (Decision 52), unlike ordering's forced complete permutation.
    const sessionId = await startSession([diagramId])
    const { data, error } = await studentClient.rpc('batch_submit_quiz', {
      p_session_id: sessionId,
      p_answers: diagramPayload(diagramId, [
        { zoneId: 'zone-nw', labelId: 'lbl-alpha' },
        { zoneId: 'zone-ne', labelId: 'lbl-bravo' },
      ]),
    })
    expect(error).toBeNull()
    const result = asBatchResult(data)
    expect(result.answered_count).toBe(1)
    expect(result.correct_count).toBe(2)
    expect(Number(result.score_percentage)).toBeCloseTo(66.67, 2)
  })

  it('scores a fully-correct 3-zone diagram submission as 100% with correct_count equal to the zone count', async () => {
    const sessionId = await startSession([diagramId])
    const { data, error } = await studentClient.rpc('batch_submit_quiz', {
      p_session_id: sessionId,
      p_answers: diagramPayload(
        diagramId,
        CONFIG.answer.map((a) => ({ zoneId: a.zone_id, labelId: a.label_id })),
      ),
    })
    expect(error).toBeNull()
    const result = asBatchResult(data)
    expect(result.correct_count).toBe(3)
    expect(Number(result.score_percentage)).toBeCloseTo(100, 2)
  })

  it('rejects a diagram answer that submits the same zone twice', async () => {
    const sessionId = await startSession([diagramId])
    const { error } = await studentClient.rpc('batch_submit_quiz', {
      p_session_id: sessionId,
      p_answers: diagramPayload(diagramId, [
        { zoneId: 'zone-nw', labelId: 'lbl-alpha' },
        { zoneId: 'zone-nw', labelId: 'lbl-bravo' },
      ]),
    })
    expect(error).not.toBeNull()
    expect((error?.message ?? '').toLowerCase()).toContain('duplicate')
    // Non-vacuity: the RAISE aborts the whole function, so nothing was persisted.
    const { data: rows, error: rowsErr } = await admin
      .from('quiz_session_answers')
      .select('id')
      .eq('session_id', sessionId)
      .eq('question_id', diagramId)
    expect(rowsErr).toBeNull()
    expect(rows ?? []).toHaveLength(0)
  })

  it('rejects a diagram answer that places the same label on two different zones', async () => {
    const sessionId = await startSession([diagramId])
    const { error } = await studentClient.rpc('batch_submit_quiz', {
      p_session_id: sessionId,
      p_answers: diagramPayload(diagramId, [
        { zoneId: 'zone-nw', labelId: 'lbl-alpha' },
        { zoneId: 'zone-ne', labelId: 'lbl-alpha' },
      ]),
    })
    expect(error).not.toBeNull()
    expect((error?.message ?? '').toLowerCase()).toContain('duplicate')
    const { data: rows, error: rowsErr } = await admin
      .from('quiz_session_answers')
      .select('id')
      .eq('session_id', sessionId)
      .eq('question_id', diagramId)
    expect(rowsErr).toBeNull()
    expect(rows ?? []).toHaveLength(0)
  })

  it('rejects a diagram answer that references a zone id not on the question', async () => {
    const sessionId = await startSession([diagramId])
    const { error } = await studentClient.rpc('batch_submit_quiz', {
      p_session_id: sessionId,
      p_answers: diagramPayload(diagramId, [{ zoneId: 'zone-unknown', labelId: 'lbl-alpha' }]),
    })
    expect(error).not.toBeNull()
    expect((error?.message ?? '').toLowerCase()).toContain('unknown zone')
    const { data: rows, error: rowsErr } = await admin
      .from('quiz_session_answers')
      .select('id')
      .eq('session_id', sessionId)
      .eq('question_id', diagramId)
    expect(rowsErr).toBeNull()
    expect(rows ?? []).toHaveLength(0)
  })
})
