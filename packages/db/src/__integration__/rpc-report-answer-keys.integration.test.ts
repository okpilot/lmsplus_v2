import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupReferenceData, cleanupTestData } from './cleanup'
import { requireRpcResult, requireRpcRows } from './guards'
import { seedReferenceData } from './seed'
import {
  createTestOrg,
  createTestUser,
  getAdminClient,
  getAnonClient,
  getAuthenticatedClient,
} from './setup'

// get_report_answer_keys (mig 133, #697 VFR RT Training Phase 4) — non-MC
// answer-key delivery for the post-session report. Type-aware sibling of
// get_report_correct_options (mig 114, MC). Returns the short_answer canonical
// (one row/question) and dialog_fill per-blank canonicals (one row/blank); MC
// questions return NOTHING.
//
// The body (DISTINCT ON dedupe, blanks_config jsonb expansion, type filtering)
// and the answer-key column reads under SECURITY DEFINER (bypassing the mig 094
// REVOKE) only run when the function is EXECUTED — a `db reset` proves the body
// parses; this file proves it delivers the keys and enforces every guard.

type AnswerKeyRow = {
  question_id: string
  question_type: string
  blank_index: number | null
  answer_key: string | null
}

function asRows(data: unknown): AnswerKeyRow[] {
  return requireRpcRows<AnswerKeyRow>(data, 'get_report_answer_keys')
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

describe('RPC: get_report_answer_keys — non-MC report keys + guards', () => {
  const admin = getAdminClient()
  // Sentinels so a mid-beforeAll failure leaves these falsy-checkable in afterAll
  // (vitest still runs afterAll if beforeAll throws) — an unassigned `let orgId: string`
  // would make the cleanup throw a SECOND error and mask the real setup failure.
  let orgId = ''
  let adminUserId: string
  let studentId: string
  let bankId: string
  let studentClient: SupabaseClient
  let refs: Awaited<ReturnType<typeof seedReferenceData>> | null = null
  const userIds: string[] = []
  const suffix = Date.now()

  let saId: string
  let dfId: string
  let mcId: string

  const SA_CANONICAL = 'mayday mayday mayday'
  const DF_B0 = 'cleared'
  const DF_B1 = 'runway two seven'
  const DF_B2 = 'wind calm'

  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `Test Org ReportKeys ${suffix}`,
      slug: `test-reportkeys-${suffix}`,
    })
    adminUserId = await createTestUser({
      admin,
      orgId,
      email: `admin-reportkeys-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'admin',
    })
    userIds.push(adminUserId)
    studentId = await createTestUser({
      admin,
      orgId,
      email: `student-reportkeys-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(studentId)
    studentClient = await getAuthenticatedClient({
      email: `student-reportkeys-${suffix}@test.local`,
      password: 'test-pass-123',
    })
    refs = await seedReferenceData({
      admin,
      subjectCode: `RK${suffix}`,
      subjectName: `ReportKeys Subject ${suffix}`,
      topicCode: `RK${suffix}-01`,
      topicName: `ReportKeys Topic ${suffix}`,
    })

    const { data: bank, error: bankErr } = await admin
      .from('question_banks')
      .insert({
        organization_id: orgId,
        name: `ReportKeys Bank ${suffix}`,
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

    saId = await insertQuestion(admin, {
      ...base,
      question_type: 'short_answer',
      question_text: 'Distress call?',
      canonical_answer: SA_CANONICAL,
      explanation_text: 'SA explanation',
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
    // Per-step error accumulator (code-style.md §7): each step isolated, errors collected,
    // surfaced together at the end so one failure can't skip the next. Sentinel presence
    // guards (`if (orgId)` / `if (refs)`) keep a mid-beforeAll failure from running a step
    // against unassigned state and throwing a second, masking error.
    const errors: string[] = []

    if (orgId) {
      try {
        await cleanupTestData({ admin, orgId, userIds })
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e))
      }
    }

    // FK-ordering gate (code-style.md §7 dependent step): cleanupReferenceData deletes the
    // seeded easa_subjects/easa_topics that are FK parents of the questions cleanupTestData
    // removes, so it must stay gated behind a clean test cleanup (errors.length === 0) to
    // avoid a 23503 FK violation. The presence guard adds the mid-beforeAll-failure case.
    if (refs && errors.length === 0) {
      try {
        await cleanupReferenceData({ admin, refs: [refs] })
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e))
      }
    }

    if (errors.length > 0) throw new Error(`afterAll: ${errors.join('; ')}`)
  })

  /**
   * Start a quick_quiz session for the given question ids, answer them through
   * batch_submit_quiz (which writes quiz_session_answers AND sets ended_at →
   * completed session), and return the session id. The report RPC reads the
   * answered questions of a completed, owned session.
   */
  async function completeSession(
    client: SupabaseClient,
    qIds: string[],
    answers: Array<Record<string, unknown>>,
  ): Promise<string> {
    const { data: sd, error: startErr } = await client.rpc('start_quiz_session', {
      p_mode: 'quick_quiz',
      // refs is assigned in beforeAll; completeSession only runs inside tests, after it.
      p_subject_id: refs!.subjectId,
      p_topic_id: refs!.topicId,
      p_question_ids: qIds,
    })
    if (startErr) throw new Error(`startSession: ${startErr.message}`)
    if (typeof sd !== 'string') throw new Error('startSession: no session id')
    const sessionId = sd

    const { error: submitErr } = await client.rpc('batch_submit_quiz', {
      p_session_id: sessionId,
      p_answers: answers,
    })
    if (submitErr) throw new Error(`batch_submit_quiz: ${submitErr.message}`)
    return sessionId
  }

  // ── delivery: short_answer ──────────────────────────────────────────────────
  it('returns the short_answer canonical as one row for a completed owned session', async () => {
    const sessionId = await completeSession(
      studentClient,
      [saId],
      [{ question_id: saId, response_text: SA_CANONICAL, response_time_ms: 4000 }],
    )
    const { data, error } = await studentClient.rpc('get_report_answer_keys', {
      p_session_id: sessionId,
    })
    expect(error).toBeNull()
    const rows = asRows(data)
    expect(rows).toHaveLength(1)
    const row = rows[0]
    if (!row) throw new Error('expected one short_answer key row')
    expect(row.question_id).toBe(saId)
    expect(row.question_type).toBe('short_answer')
    expect(row.blank_index).toBeNull()
    expect(row.answer_key).toBe(SA_CANONICAL)
  })

  // ── delivery: dialog_fill ───────────────────────────────────────────────────
  it('returns one canonical row per dialog_fill blank, keyed by blank index', async () => {
    const sessionId = await completeSession(
      studentClient,
      [dfId],
      [
        { question_id: dfId, blank_index: 0, response_text: DF_B0, response_time_ms: 1000 },
        { question_id: dfId, blank_index: 1, response_text: DF_B1, response_time_ms: 1000 },
        { question_id: dfId, blank_index: 2, response_text: DF_B2, response_time_ms: 1000 },
      ],
    )
    const { data, error } = await studentClient.rpc('get_report_answer_keys', {
      p_session_id: sessionId,
    })
    expect(error).toBeNull()
    const rows = asRows(data)
    expect(rows).toHaveLength(3)
    for (const r of rows) {
      expect(r.question_id).toBe(dfId)
      expect(r.question_type).toBe('dialog_fill')
    }
    const byIndex = new Map(rows.map((r) => [r.blank_index, r.answer_key]))
    expect(byIndex.get(0)).toBe(DF_B0)
    expect(byIndex.get(1)).toBe(DF_B1)
    expect(byIndex.get(2)).toBe(DF_B2)
  })

  // ── all-MC session returns nothing (not an error) ───────────────────────────
  it('returns zero rows and no error for an all-MC completed session', async () => {
    const sessionId = await completeSession(
      studentClient,
      [mcId],
      [{ question_id: mcId, selected_option: 'b', response_time_ms: 2000 }],
    )
    const { data, error } = await studentClient.rpc('get_report_answer_keys', {
      p_session_id: sessionId,
    })
    expect(error).toBeNull()
    const rows = asRows(data)
    expect(rows).toHaveLength(0)
  })

  // ── mixed-type session returns only the non-MC keys ─────────────────────────
  it('delivers non-MC keys but omits the MC question in a mixed-type session', async () => {
    const sessionId = await completeSession(
      studentClient,
      [mcId, saId, dfId],
      [
        { question_id: mcId, selected_option: 'b', response_time_ms: 1000 },
        { question_id: saId, response_text: SA_CANONICAL, response_time_ms: 1000 },
        { question_id: dfId, blank_index: 0, response_text: DF_B0, response_time_ms: 1000 },
        { question_id: dfId, blank_index: 1, response_text: DF_B1, response_time_ms: 1000 },
        { question_id: dfId, blank_index: 2, response_text: DF_B2, response_time_ms: 1000 },
      ],
    )
    const { data, error } = await studentClient.rpc('get_report_answer_keys', {
      p_session_id: sessionId,
    })
    expect(error).toBeNull()
    const rows = asRows(data)
    // 1 short_answer row + 3 dialog_fill blank rows; the MC question is absent.
    expect(rows).toHaveLength(4)
    expect(rows.some((r) => r.question_id === mcId)).toBe(false)
    expect(rows.filter((r) => r.question_id === saId)).toHaveLength(1)
    expect(rows.filter((r) => r.question_id === dfId)).toHaveLength(3)
  })

  // ── guard: unauthenticated ──────────────────────────────────────────────────
  it('rejects an unauthenticated caller with Not authenticated', async () => {
    // Seed a real completed, owned session so the rejection is about auth, not a
    // missing session.
    const sessionId = await completeSession(
      studentClient,
      [saId],
      [{ question_id: saId, response_text: SA_CANONICAL, response_time_ms: 4000 }],
    )
    const anon = getAnonClient()
    const { error } = await anon.rpc('get_report_answer_keys', { p_session_id: sessionId })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('Not authenticated')
  })

  // ── guard: soft-deleted caller ──────────────────────────────────────────────
  it('rejects a soft-deleted caller with user not found or inactive', async () => {
    const delStudentId = await createTestUser({
      admin,
      orgId,
      email: `studentDel-reportkeys-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(delStudentId)
    const delClient = await getAuthenticatedClient({
      email: `studentDel-reportkeys-${suffix}@test.local`,
      password: 'test-pass-123',
    })
    const sessionId = await completeSession(
      delClient,
      [saId],
      [{ question_id: saId, response_text: SA_CANONICAL, response_time_ms: 4000 }],
    )
    const { error: delErr } = await admin
      .from('users')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', delStudentId)
    if (delErr) throw new Error(`soft-delete: ${delErr.message}`)
    const { error } = await delClient.rpc('get_report_answer_keys', { p_session_id: sessionId })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('user not found or inactive')
  })

  // ── guard: non-owner ────────────────────────────────────────────────────────
  it("rejects another student reading the owner's completed session", async () => {
    const studentBId = await createTestUser({
      admin,
      orgId,
      email: `studentB-reportkeys-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(studentBId)
    const studentBClient = await getAuthenticatedClient({
      email: `studentB-reportkeys-${suffix}@test.local`,
      password: 'test-pass-123',
    })
    // The owner (studentA) completes a session that genuinely has non-MC keys.
    const sessionId = await completeSession(
      studentClient,
      [saId],
      [{ question_id: saId, response_text: SA_CANONICAL, response_time_ms: 4000 }],
    )
    // Non-vacuity: confirm via service-role that the session truly carries an
    // answered short_answer question (so the attacker's empty/rejected result is
    // not just an empty session). The victim's owned read returns the key.
    const { data: ownerData, error: ownerErr } = await studentClient.rpc('get_report_answer_keys', {
      p_session_id: sessionId,
    })
    expect(ownerErr).toBeNull()
    const ownerRows = asRows(ownerData)
    expect(ownerRows).toHaveLength(1)
    expect(ownerRows[0]?.answer_key).toBe(SA_CANONICAL)
    // The non-owner is rejected before any key is read.
    const { error } = await studentBClient.rpc('get_report_answer_keys', {
      p_session_id: sessionId,
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('Session not found, not owned, or not completed')
  })

  // ── guard: not-completed session (ended_at NULL) ────────────────────────────
  it('rejects a still-in-progress session that has not ended', async () => {
    const { data: sd, error: startErr } = await studentClient.rpc('start_quiz_session', {
      p_mode: 'quick_quiz',
      // refs is assigned in beforeAll; this test runs after it.
      p_subject_id: refs!.subjectId,
      p_topic_id: refs!.topicId,
      p_question_ids: [saId],
    })
    if (startErr) throw new Error(`startSession: ${startErr.message}`)
    if (typeof sd !== 'string') throw new Error('startSession: no session id')
    const sessionId = sd // started, never submitted → ended_at IS NULL
    const { error } = await studentClient.rpc('get_report_answer_keys', {
      p_session_id: sessionId,
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('Session not found, not owned, or not completed')
  })
})
