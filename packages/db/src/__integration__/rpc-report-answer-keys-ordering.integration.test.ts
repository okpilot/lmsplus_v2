import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupReferenceData, cleanupTestData } from './cleanup'
import { requireRpcResult, requireRpcRows } from './guards'
import { seedReferenceData } from './seed'
import { createTestOrg, createTestUser, getAdminClient, getAuthenticatedClient } from './setup'

// get_report_answer_keys reveals the `ordering` canonical sequence in the
// post-session report (mig 140, #697 Phase 5). One row PER SLOT: answer_key = the
// item TEXT at that slot (canonical = stored array order), blank_index = 0-based
// slot. The WITH ORDINALITY expansion + the answer-key column read under SECURITY
// DEFINER (bypassing the mig-094 REVOKE) only run when the function EXECUTES — a
// `db reset` proves only that the body parses. Sibling of the Phase 4 file
// (rpc-report-answer-keys.integration.test.ts).

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

describe('RPC: get_report_answer_keys — ordering per-slot keys', () => {
  const admin = getAdminClient()
  let orgId = ''
  let adminUserId: string
  let bankId: string
  let studentClient: SupabaseClient
  let refs: Awaited<ReturnType<typeof seedReferenceData>> | null = null
  const userIds: string[] = []
  const suffix = Date.now()

  let orderingId: string

  // Canonical sequence = ARRAY ORDER. Opaque ids (not 1..N).
  const ITEMS = [
    { id: 'ord-a', text: 'MAYDAY MAYDAY MAYDAY' },
    { id: 'ord-b', text: 'Golf Bravo Charlie' },
    { id: 'ord-c', text: 'engine failure' },
  ]
  const CANONICAL_IDS = ITEMS.map((i) => i.id)
  const CANONICAL_TEXTS = ITEMS.map((i) => i.text)

  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `Test Org OrderKeys ${suffix}`,
      slug: `test-orderkeys-${suffix}`,
    })
    adminUserId = await createTestUser({
      admin,
      orgId,
      email: `admin-orderkeys-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'admin',
    })
    userIds.push(adminUserId)
    const studentId = await createTestUser({
      admin,
      orgId,
      email: `student-orderkeys-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(studentId)
    studentClient = await getAuthenticatedClient({
      email: `student-orderkeys-${suffix}@test.local`,
      password: 'test-pass-123',
    })
    refs = await seedReferenceData({
      admin,
      subjectCode: `OK${suffix}`,
      subjectName: `OrderKeys Subject ${suffix}`,
      topicCode: `OK${suffix}-01`,
      topicName: `OrderKeys Topic ${suffix}`,
    })

    const { data: bank, error: bankErr } = await admin
      .from('question_banks')
      .insert({ organization_id: orgId, name: `OrderKeys Bank ${suffix}`, created_by: adminUserId })
      .select('id')
      .single()
    if (bankErr) throw new Error(`seed bank: ${bankErr.message}`)
    bankId = requireRpcResult<{ id: string }>(bank, 'question_banks insert').id

    orderingId = await insertQuestion(admin, {
      organization_id: orgId,
      bank_id: bankId,
      subject_id: refs.subjectId,
      topic_id: refs.topicId,
      subtopic_id: null,
      difficulty: 'medium',
      status: 'active',
      created_by: adminUserId,
      question_type: 'ordering',
      question_text: 'Sequence the distress call',
      ordering_items: ITEMS,
      explanation_text: 'Ordering explanation',
    })
  })

  afterAll(async () => {
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
  }, 30_000)

  /** Start + answer the ordering question through batch_submit_quiz (sets ended_at →
   *  completed), returning the session id. */
  async function completeOrderingSession(client: SupabaseClient): Promise<string> {
    const { data: sd, error: startErr } = await client.rpc('start_quiz_session', {
      p_mode: 'quick_quiz',
      p_subject_id: refs!.subjectId,
      p_topic_id: refs!.topicId,
      p_question_ids: [orderingId],
    })
    if (startErr) throw new Error(`startSession: ${startErr.message}`)
    if (typeof sd !== 'string') throw new Error('startSession: no session id')
    const sessionId = sd
    const answers = CANONICAL_IDS.map((id, i) => ({
      question_id: orderingId,
      selected_option: id,
      blank_index: i,
      response_time_ms: 1000,
    }))
    const { error: submitErr } = await client.rpc('batch_submit_quiz', {
      p_session_id: sessionId,
      p_answers: answers,
    })
    if (submitErr) throw new Error(`batch_submit_quiz: ${submitErr.message}`)
    return sessionId
  }

  it('returns one canonical-text row per slot keyed by 0-based blank index for a completed owned session', async () => {
    const sessionId = await completeOrderingSession(studentClient)
    const { data, error } = await studentClient.rpc('get_report_answer_keys', {
      p_session_id: sessionId,
    })
    expect(error).toBeNull()
    const rows = asRows(data)
    expect(rows).toHaveLength(CANONICAL_TEXTS.length)
    for (const r of rows) {
      expect(r.question_id).toBe(orderingId)
      expect(r.question_type).toBe('ordering')
    }
    const byIndex = new Map(rows.map((r) => [r.blank_index, r.answer_key]))
    expect(byIndex.get(0)).toBe(CANONICAL_TEXTS[0])
    expect(byIndex.get(1)).toBe(CANONICAL_TEXTS[1])
    expect(byIndex.get(2)).toBe(CANONICAL_TEXTS[2])
    // 0-based slots, contiguous from 0.
    expect(rows.map((r) => r.blank_index).sort((a, b) => Number(a) - Number(b))).toEqual([0, 1, 2])
  })

  it("rejects another student reading the owner's completed ordering session", async () => {
    const studentBId = await createTestUser({
      admin,
      orgId,
      email: `studentB-orderkeys-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(studentBId)
    const studentBClient = await getAuthenticatedClient({
      email: `studentB-orderkeys-${suffix}@test.local`,
      password: 'test-pass-123',
    })
    const sessionId = await completeOrderingSession(studentClient)
    // Non-vacuity: the owner CAN read the ordering keys, so the attacker's rejection
    // is the ownership gate firing, not an empty session.
    const { data: ownerData, error: ownerErr } = await studentClient.rpc('get_report_answer_keys', {
      p_session_id: sessionId,
    })
    expect(ownerErr).toBeNull()
    expect(asRows(ownerData)).toHaveLength(CANONICAL_TEXTS.length)
    const { error } = await studentBClient.rpc('get_report_answer_keys', {
      p_session_id: sessionId,
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('Session not found, not owned, or not completed')
  })

  it('rejects a still-in-progress ordering session that has not ended', async () => {
    const { data: sd, error: startErr } = await studentClient.rpc('start_quiz_session', {
      p_mode: 'quick_quiz',
      p_subject_id: refs!.subjectId,
      p_topic_id: refs!.topicId,
      p_question_ids: [orderingId],
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
