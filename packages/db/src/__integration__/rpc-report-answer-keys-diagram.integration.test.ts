import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupReferenceData, cleanupTestData } from './cleanup'
import { requireRpcResult, requireRpcRows } from './guards'
import { seedReferenceData } from './seed'
import { createTestOrg, createTestUser, getAdminClient, getAuthenticatedClient } from './setup'

// get_report_answer_keys reveals the `diagram_label` canonical zone->label
// mapping in the post-session report (mig 156, #697 Phase 6). One row PER
// ZONE: blank_index = the zone's 0-based ordinal position within
// diagram_config.zones (the SAME index _grade_record_diagram_label derives —
// mig 154), answer_key = a 2-HOP RESOLVE (zone -> diagram_config.answer entry
// for that zone_id -> that entry's label_id -> the matching diagram_config.labels
// entry's text) — NOT a single-expression projection like ordering's
// `elem->>'text'`, because the canonical answer for a zone is not embedded in
// the zone object itself. This only runs when the function EXECUTES against
// real rows — a `db reset` proves only that the body parses. Sibling of the
// Phase 5 ordering file (rpc-report-answer-keys-ordering.integration.test.ts).

type Zone = { id: string; x: number; y: number; w: number; h: number }
type Label = { id: string; text: string }
type AnswerEntry = { zone_id: string; label_id: string }
type DiagramConfig = { image_ref: string; zones: Zone[]; labels: Label[]; answer: AnswerEntry[] }

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

describe('RPC: get_report_answer_keys — diagram_label per-zone keys (2-hop resolve)', () => {
  const admin = getAdminClient()
  let orgId = ''
  let adminUserId: string
  let bankId: string
  let studentClient: SupabaseClient
  let refs: Awaited<ReturnType<typeof seedReferenceData>> | null = null
  const userIds: string[] = []
  const suffix = Date.now()

  let diagramId: string

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
  const CANONICAL_TEXTS = ['Upwind Leg', 'Crosswind Leg', 'Downwind Leg']

  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `Test Org DiagramKeys ${suffix}`,
      slug: `test-diagramkeys-${suffix}`,
    })
    adminUserId = await createTestUser({
      admin,
      orgId,
      email: `admin-diagramkeys-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'admin',
    })
    userIds.push(adminUserId)
    const studentId = await createTestUser({
      admin,
      orgId,
      email: `student-diagramkeys-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(studentId)
    studentClient = await getAuthenticatedClient({
      email: `student-diagramkeys-${suffix}@test.local`,
      password: 'test-pass-123',
    })
    refs = await seedReferenceData({
      admin,
      subjectCode: `DK${suffix}`,
      subjectName: `DiagramKeys Subject ${suffix}`,
      topicCode: `DK${suffix}-01`,
      topicName: `DiagramKeys Topic ${suffix}`,
    })

    const { data: bank, error: bankErr } = await admin
      .from('question_banks')
      .insert({
        organization_id: orgId,
        name: `DiagramKeys Bank ${suffix}`,
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
      question_text: 'Label the traffic pattern',
      diagram_config: CONFIG,
      explanation_text: 'Diagram explanation',
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

  /** Start + fully-and-correctly answer the diagram question through
   *  batch_submit_quiz (sets ended_at → completed), returning the session id. */
  async function completeDiagramSession(client: SupabaseClient): Promise<string> {
    const { data: sd, error: startErr } = await client.rpc('start_quiz_session', {
      p_mode: 'quick_quiz',
      p_subject_id: refs!.subjectId,
      p_topic_id: refs!.topicId,
      p_question_ids: [diagramId],
    })
    if (startErr) throw new Error(`startSession: ${startErr.message}`)
    if (typeof sd !== 'string') throw new Error('startSession: no session id')
    const sessionId = sd
    const answers = CONFIG.answer.map((a, i) => ({
      question_id: diagramId,
      selected_option: a.label_id,
      response_text: a.zone_id,
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

  it('returns one canonical-label-text row per zone keyed by the derived zone-ordinal blank index for a completed owned session', async () => {
    const sessionId = await completeDiagramSession(studentClient)
    const { data, error } = await studentClient.rpc('get_report_answer_keys', {
      p_session_id: sessionId,
    })
    expect(error).toBeNull()
    const rows = asRows(data)
    expect(rows).toHaveLength(CANONICAL_TEXTS.length)
    for (const r of rows) {
      expect(r.question_id).toBe(diagramId)
      expect(r.question_type).toBe('diagram_label')
    }
    const byIndex = new Map(rows.map((r) => [r.blank_index, r.answer_key]))
    // Alignment for all 3 zones (>= 2 required): zone-nw=0, zone-ne=1, zone-sw=2
    // — the SAME ordinal _grade_record_diagram_label derives, resolved via the
    // 2-hop zone -> answer entry -> label text lookup.
    expect(byIndex.get(0)).toBe(CANONICAL_TEXTS[0])
    expect(byIndex.get(1)).toBe(CANONICAL_TEXTS[1])
    expect(byIndex.get(2)).toBe(CANONICAL_TEXTS[2])
    expect(rows.map((r) => r.blank_index).sort((a, b) => Number(a) - Number(b))).toEqual([0, 1, 2])
  })

  it("rejects another student reading the owner's completed diagram session", async () => {
    const studentBId = await createTestUser({
      admin,
      orgId,
      email: `studentB-diagramkeys-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(studentBId)
    const studentBClient = await getAuthenticatedClient({
      email: `studentB-diagramkeys-${suffix}@test.local`,
      password: 'test-pass-123',
    })
    const sessionId = await completeDiagramSession(studentClient)
    // Non-vacuity: the owner CAN read the diagram keys, so the attacker's
    // rejection is the ownership gate firing, not an empty session.
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

  it('rejects a still-in-progress diagram session that has not ended', async () => {
    const { data: sd, error: startErr } = await studentClient.rpc('start_quiz_session', {
      p_mode: 'quick_quiz',
      p_subject_id: refs!.subjectId,
      p_topic_id: refs!.topicId,
      p_question_ids: [diagramId],
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
