import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupReferenceData, cleanupTestData } from './cleanup'
import { requireRpcResult } from './guards'
import { seedReferenceData } from './seed'
import { createTestOrg, createTestUser, getAdminClient, getAuthenticatedClient } from './setup'

// batch_submit_quiz dispatches the `ordering` type (migs 138/139, #697 Phase 5).
// These behaviors only run when the function EXECUTES against real rows — a
// `db reset` proves only that the body parses:
//   * per-slot row persistence (one quiz_session_answers row per slot,
//     response_text = item text, blank_index = slot, selected_option_id NULL),
//   * the per-slot INSERTs survive the widened mig-135 blank_index trigger
//     (an ordering row with non-null blank_index must NOT raise check_violation),
//   * the DISTINCT-question partial-credit roll-up folds per-slot rows into a
//     fractional numerator (3-of-5 ordering → 60%, correct_count 3),
//   * REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated on _grade_record_ordering.

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

describe('RPC: batch_submit_quiz — ordering dispatch + partial credit + helper REVOKE', () => {
  const admin = getAdminClient()
  let orgId = ''
  let adminUserId: string
  let studentId: string
  let bankId: string
  let studentClient: SupabaseClient
  let refs: Awaited<ReturnType<typeof seedReferenceData>> | null = null
  const userIds: string[] = []
  const suffix = Date.now()

  let orderingId: string

  // A 5-item ordering question — used for the 3-of-5 partial-credit assertion.
  // Canonical sequence = ARRAY ORDER. Opaque ids (not 1..N).
  const ITEMS = [
    { id: 'oi-a', text: 'MAYDAY MAYDAY MAYDAY' },
    { id: 'oi-b', text: 'callsign Golf Bravo Charlie' },
    { id: 'oi-c', text: 'nature engine failure' },
    { id: 'oi-d', text: 'position five miles north' },
    { id: 'oi-e', text: 'intentions forced landing' },
  ]
  const CANONICAL_IDS = ITEMS.map((i) => i.id)
  const ITEM_TEXT = new Map(ITEMS.map((i) => [i.id, i.text]))

  /** Build the fan-out payload the client produces: one entry per slot, item id in
   *  selected_option, slot in blank_index (mirrors the dialog_fill expansion). */
  function orderPayload(qId: string, orderIds: string[]): Array<Record<string, unknown>> {
    return orderIds.map((id, i) => ({
      question_id: qId,
      selected_option: id,
      blank_index: i,
      response_time_ms: 1000,
    }))
  }

  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `Test Org BatchOrder ${suffix}`,
      slug: `test-batchorder-${suffix}`,
    })
    adminUserId = await createTestUser({
      admin,
      orgId,
      email: `admin-batchorder-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'admin',
    })
    userIds.push(adminUserId)
    studentId = await createTestUser({
      admin,
      orgId,
      email: `student-batchorder-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(studentId)
    studentClient = await getAuthenticatedClient({
      email: `student-batchorder-${suffix}@test.local`,
      password: 'test-pass-123',
    })
    refs = await seedReferenceData({
      admin,
      subjectCode: `BO${suffix}`,
      subjectName: `BatchOrder Subject ${suffix}`,
      topicCode: `BO${suffix}-01`,
      topicName: `BatchOrder Topic ${suffix}`,
    })

    const { data: bank, error: bankErr } = await admin
      .from('question_banks')
      .insert({
        organization_id: orgId,
        name: `BatchOrder Bank ${suffix}`,
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
      question_text: 'Sequence the distress call (5 items)',
      ordering_items: ITEMS,
      explanation_text: 'Ordering explanation',
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

  it('persists one quiz_session_answers row per slot (item text, blank_index=slot, selected_option_id NULL)', async () => {
    // The per-slot INSERTs must survive the widened mig-135 trigger — an ordering
    // row with a non-null blank_index must NOT raise check_violation.
    const sessionId = await startSession([orderingId])
    const { error } = await studentClient.rpc('batch_submit_quiz', {
      p_session_id: sessionId,
      p_answers: orderPayload(orderingId, CANONICAL_IDS),
    })
    expect(error).toBeNull()

    const { data: rows, error: rowsErr } = await admin
      .from('quiz_session_answers')
      .select('selected_option_id, response_text, blank_index, is_correct')
      .eq('session_id', sessionId)
      .eq('question_id', orderingId)
      .order('blank_index', { ascending: true })
    expect(rowsErr).toBeNull()
    if (!Array.isArray(rows)) throw new Error('expected an array of answer rows')
    expect(rows).toHaveLength(CANONICAL_IDS.length)
    const typed = rows as Array<{
      selected_option_id: string | null
      response_text: string | null
      blank_index: number | null
      is_correct: boolean
    }>
    expect(typed.map((r) => r.blank_index)).toEqual([0, 1, 2, 3, 4])
    for (const r of typed) {
      expect(r.selected_option_id).toBeNull()
      expect(r.is_correct).toBe(true)
    }
    // response_text is the ITEM TEXT placed at each slot, not the item id.
    expect(typed.map((r) => r.response_text)).toEqual(CANONICAL_IDS.map((id) => ITEM_TEXT.get(id)))
  })

  it('scores a 5-item ordering answered 3-of-5-correct as 60% with correct_count 3 (partial credit)', async () => {
    // ONLY this single ordering question is in the session, so the score isolates the
    // partial-credit math. Submit a sequence with exactly 3 items in their canonical
    // slot and 2 displaced: keep slots 0,1,2 canonical; swap slots 3 and 4.
    //   submitted = [a, b, c, e, d]  (e,d are NOT canonical at slots 3,4)
    // → 3 correct slots of 5 → credit = LEAST(3/5,1) = 0.6, answered=1 →
    //   round(0.6*100,2)=60.00; correct_count=3.
    // Slots 0,1,2 canonical; slots 3,4 swapped (item 4 at slot 3, item 3 at slot 4).
    const submitted = [0, 1, 2, 4, 3].map((i) => ITEMS[i]!.id)
    const sessionId = await startSession([orderingId])
    const { data, error } = await studentClient.rpc('batch_submit_quiz', {
      p_session_id: sessionId,
      p_answers: orderPayload(orderingId, submitted),
    })
    expect(error).toBeNull()
    const result = asBatchResult(data)
    expect(result.answered_count).toBe(1)
    expect(result.correct_count).toBe(3)
    expect(Number(result.score_percentage)).toBeCloseTo(60, 2)
    // results[] carries one entry per slot — 3 correct, 2 wrong.
    const slotResults = result.results.filter((r) => r.question_id === orderingId)
    expect(slotResults).toHaveLength(5)
    expect(slotResults.filter((r) => r.is_correct)).toHaveLength(3)
    expect(slotResults.filter((r) => !r.is_correct)).toHaveLength(2)
  })

  it('scores a fully-correct ordering as 100% with correct_count equal to the item count', async () => {
    const sessionId = await startSession([orderingId])
    const { data, error } = await studentClient.rpc('batch_submit_quiz', {
      p_session_id: sessionId,
      p_answers: orderPayload(orderingId, CANONICAL_IDS),
    })
    expect(error).toBeNull()
    const result = asBatchResult(data)
    expect(result.correct_count).toBe(CANONICAL_IDS.length)
    expect(Number(result.score_percentage)).toBeCloseTo(100, 2)
    const slotResults = result.results.filter((r) => r.question_id === orderingId)
    expect(slotResults).toHaveLength(CANONICAL_IDS.length)
    for (const r of slotResults) expect(r.is_correct).toBe(true)
  })

  it('rejects an ordering answer that repeats an item across two slots', async () => {
    // Self-defence (#998 CR #466): a forged payload reusing the same item id in two
    // slots is not a permutation. The (question_id, blank_index) guard passes (the slots
    // differ), so the dispatcher's count(DISTINCT selected_option) = N guard must reject
    // it before any per-slot row reaches the immutable quiz_session_answers table.
    const dupIds = [
      CANONICAL_IDS[0]!,
      CANONICAL_IDS[0]!,
      CANONICAL_IDS[2]!,
      CANONICAL_IDS[3]!,
      CANONICAL_IDS[4]!,
    ]
    const sessionId = await startSession([orderingId])
    const { error } = await studentClient.rpc('batch_submit_quiz', {
      p_session_id: sessionId,
      p_answers: orderPayload(orderingId, dupIds),
    })
    expect(error).not.toBeNull()
    expect((error?.message ?? '').toLowerCase()).toContain('permutation')
    // Non-vacuity: the RAISE aborts the whole function, so nothing was persisted.
    const { data: rows, error: rowsErr } = await admin
      .from('quiz_session_answers')
      .select('id')
      .eq('session_id', sessionId)
      .eq('question_id', orderingId)
    expect(rowsErr).toBeNull()
    expect(rows ?? []).toHaveLength(0)
  })

  it('rejects an ordering answer that omits a slot', async () => {
    // Self-defence (#998 CR #466): a subset submission (4 of 5 slots) has count(*) < N,
    // so the dispatcher rejects it rather than persist a partial, ungradeable sequence.
    const subset = CANONICAL_IDS.slice(0, 4)
    const sessionId = await startSession([orderingId])
    const { error } = await studentClient.rpc('batch_submit_quiz', {
      p_session_id: sessionId,
      p_answers: orderPayload(orderingId, subset),
    })
    expect(error).not.toBeNull()
    expect((error?.message ?? '').toLowerCase()).toContain('permutation')
    const { data: rows, error: rowsErr } = await admin
      .from('quiz_session_answers')
      .select('id')
      .eq('session_id', sessionId)
      .eq('question_id', orderingId)
    expect(rowsErr).toBeNull()
    expect(rows ?? []).toHaveLength(0)
  })

  it('forbids a direct authenticated call to the internal _grade_record_ordering helper (42501)', async () => {
    // REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated (mig 138): the helper must
    // not be callable via PostgREST by an authenticated user — a direct call would
    // bypass the dispatcher's auth/owner/mode guards and forge graded rows. The
    // payload is SIGNATURE-VALID (not `{}`): with a wrong arg shape PostgREST returns
    // PGRST202 from overload resolution BEFORE the EXECUTE permission check, so the
    // assertion would pass vacuously even if the REVOKE regressed (code-style.md §7).
    const dummyId = '00000000-0000-0000-0000-000000000000'
    const payload = {
      p_session_id: dummyId,
      p_student_id: studentId,
      p_org_id: orgId,
      p_question_id: orderingId,
      p_slot: 0,
      p_item_id: CANONICAL_IDS[0],
      p_ordering_items: ITEMS,
      p_response_time: 0,
    }
    // Positive control (§7 non-vacuity): the admin (service-role) call must resolve the
    // signature — it will fail later (FK/owner), but NOT with PGRST202 — so a PGRST202 in
    // the authenticated call below genuinely means REVOKE, not an argument-shape drift.
    const { error: signatureErr } = await admin.rpc('_grade_record_ordering', payload)
    expect(signatureErr?.code, `signature must resolve: ${signatureErr?.message}`).not.toBe(
      'PGRST202',
    )
    const { error } = await studentClient.rpc('_grade_record_ordering', payload)
    expect(error, '_grade_record_ordering must be uncallable by authenticated').not.toBeNull()
    const code = (error as { code?: string }).code
    const message = (error?.message ?? '').toLowerCase()
    const denied =
      code === '42501' ||
      code === 'PGRST202' ||
      message.includes('permission denied') ||
      message.includes('could not find the function') ||
      message.includes('does not exist')
    expect(denied, `_grade_record_ordering error was ${code}: ${error?.message}`).toBe(true)
  })
})
