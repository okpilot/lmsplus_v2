import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupReferenceData, cleanupTestData } from './cleanup'
import { requireRpcResult, requireRpcRows } from './guards'
import { seedReferenceData } from './seed'
import { createTestOrg, createTestUser, getAdminClient, getAuthenticatedClient } from './setup'

// get_quiz_questions delivers the `diagram_label` question type (mig 152, #697
// Phase 6). The public delivery is {image_ref, zones, labels(shuffled)} — the
// answer key (diagram_config.answer, the zone_id -> label_id mapping) is
// OMITTED entirely, and labels are SHUFFLED (ORDER BY random()) so array
// position cannot leak which label maps to which zone. These behaviors only
// run when the function EXECUTES against real rows — a `db reset` proves only
// that the body parses.

type Zone = { id: string; x: number; y: number; w: number; h: number }
type Label = { id: string; text: string }
type AnswerEntry = { zone_id: string; label_id: string }
type DiagramConfig = { image_ref: string; zones: Zone[]; labels: Label[]; answer: AnswerEntry[] }

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

describe('RPC: get_quiz_questions — diagram_label delivery (answer stripped, labels shuffled)', () => {
  const admin = getAdminClient()
  let orgId = ''
  let adminUserId: string
  let bankId: string
  let studentClient: SupabaseClient
  let refs: Awaited<ReturnType<typeof seedReferenceData>> | null = null
  const userIds: string[] = []
  const suffix = Date.now()

  let diagramId: string
  let mcId: string

  // Zone ids and label ids use UNRELATED naming schemes (mig 150 header
  // security invariant) — no zone_id == label_id, no parallel naming.
  const ZONES: Zone[] = [
    { id: 'zone-nw', x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
    { id: 'zone-ne', x: 0.6, y: 0.1, w: 0.2, h: 0.2 },
    { id: 'zone-sw', x: 0.1, y: 0.6, w: 0.2, h: 0.2 },
  ]
  const LABELS: Label[] = [
    { id: 'lbl-alpha', text: 'Upwind Leg' },
    { id: 'lbl-bravo', text: 'Crosswind Leg' },
    { id: 'lbl-charlie', text: 'Downwind Leg' },
    { id: 'lbl-distract', text: 'Base Leg (unused)' },
  ]
  const ANSWER: AnswerEntry[] = [
    { zone_id: 'zone-nw', label_id: 'lbl-alpha' },
    { zone_id: 'zone-ne', label_id: 'lbl-bravo' },
    { zone_id: 'zone-sw', label_id: 'lbl-charlie' },
  ]
  const DIAGRAM_CONFIG: DiagramConfig = {
    image_ref: 'rwy-27-09-lh-pattern',
    zones: ZONES,
    labels: LABELS,
    answer: ANSWER,
  }

  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `Test Org DiagramQQ ${suffix}`,
      slug: `test-diagramqq-${suffix}`,
    })
    adminUserId = await createTestUser({
      admin,
      orgId,
      email: `admin-diagramqq-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'admin',
    })
    userIds.push(adminUserId)
    const studentId = await createTestUser({
      admin,
      orgId,
      email: `student-diagramqq-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(studentId)
    studentClient = await getAuthenticatedClient({
      email: `student-diagramqq-${suffix}@test.local`,
      password: 'test-pass-123',
    })
    refs = await seedReferenceData({
      admin,
      subjectCode: `DQ${suffix}`,
      subjectName: `DiagramQQ Subject ${suffix}`,
      topicCode: `DQ${suffix}-01`,
      topicName: `DiagramQQ Topic ${suffix}`,
    })

    const { data: bank, error: bankErr } = await admin
      .from('question_banks')
      .insert({ organization_id: orgId, name: `DiagramQQ Bank ${suffix}`, created_by: adminUserId })
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

    diagramId = await insertQuestion(admin, {
      ...base,
      question_type: 'diagram_label',
      question_text: 'Label the traffic pattern',
      diagram_config: DIAGRAM_CONFIG,
      explanation_text: 'Diagram explanation',
    })
    mcId = await insertQuestion(admin, {
      ...base,
      question_type: 'multiple_choice',
      question_text: 'MC question',
      options: [
        { id: 'a', text: 'A' },
        { id: 'b', text: 'B' },
      ],
      correct_option_id: 'a',
      explanation_text: 'MC explanation',
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

  type QuizQuestionRow = {
    id: string
    question_type: string
    options: unknown
    ordering_items_shuffled: unknown
    diagram_config_public: unknown
  }

  async function fetchRow(ids: string[], targetId: string): Promise<QuizQuestionRow> {
    const { data, error } = await studentClient.rpc('get_quiz_questions', { p_question_ids: ids })
    expect(error).toBeNull()
    const rows = requireRpcRows<QuizQuestionRow>(data, 'get_quiz_questions')
    const row = rows.find((r) => r.id === targetId)
    if (!row) throw new Error(`row for ${targetId} not in response`)
    return row
  }

  it('delivers {image_ref, zones, labels} with the answer key omitted and labels shuffled', async () => {
    // Non-vacuity: the diagram question exists with its full config before probing as student.
    const { data: exists, error: existsErr } = await admin
      .from('questions')
      .select('id')
      .eq('id', diagramId)
      .single<{ id: string }>()
    expect(existsErr).toBeNull()
    expect(exists?.id).toBe(diagramId)

    const row = await fetchRow([diagramId], diagramId)
    expect(row.question_type).toBe('diagram_label')
    expect(row.options).toBeNull()
    expect(row.ordering_items_shuffled).toBeNull()

    if (
      row.diagram_config_public === null ||
      typeof row.diagram_config_public !== 'object' ||
      Array.isArray(row.diagram_config_public)
    ) {
      throw new Error('diagram_config_public is not an object')
    }
    const config = row.diagram_config_public as Record<string, unknown>
    expect(Object.keys(config).sort()).toEqual(['image_ref', 'labels', 'zones'])
    expect(config.image_ref).toBe(DIAGRAM_CONFIG.image_ref)

    // zones pass through unchanged — not the answer key, only geometry.
    if (!Array.isArray(config.zones)) throw new Error('zones is not an array')
    expect(config.zones).toEqual(ZONES)

    // labels: shuffled {id,text} — assert the SET matches, not the order.
    if (!Array.isArray(config.labels)) throw new Error('labels is not an array')
    const labels = config.labels as Array<Record<string, unknown>>
    expect(labels).toHaveLength(LABELS.length)
    for (const l of labels) {
      expect(Object.keys(l).sort()).toEqual(['id', 'text'])
    }
    expect((labels as Label[]).map((l) => l.id).sort()).toEqual(LABELS.map((l) => l.id).sort())
    expect((labels as Label[]).map((l) => l.text).sort()).toEqual(LABELS.map((l) => l.text).sort())

    // The answer key must never surface on the delivered payload.
    expect('answer' in config).toBe(false)
  })

  it('returns diagram_config_public null for a multiple_choice row', async () => {
    const row = await fetchRow([mcId], mcId)
    expect(row.question_type).toBe('multiple_choice')
    expect(row.diagram_config_public).toBeNull()
    if (!Array.isArray(row.options)) throw new Error('MC options is not an array')
  })

  it('strips extra author-only keys from a zone at delivery, keeping exactly {id,x,y,w,h}', async () => {
    // mig 152: zones are now re-projected to exactly {id,x,y,w,h} — any other
    // author-side metadata on a zone object must not survive to delivery.
    const zoneWithExtraKey = {
      id: 'zone-extra',
      x: 0.3,
      y: 0.3,
      w: 0.15,
      h: 0.15,
      internal_note: 'author scratch note — must never reach the student payload',
    }
    const configWithExtraKey = {
      image_ref: 'rwy-27-09-lh-pattern',
      zones: [zoneWithExtraKey],
      labels: [{ id: 'lbl-solo', text: 'Solo Label' }],
      answer: [{ zone_id: 'zone-extra', label_id: 'lbl-solo' }],
    }
    const extraKeyId = await insertQuestion(admin, {
      organization_id: orgId,
      bank_id: bankId,
      subject_id: refs!.subjectId,
      topic_id: refs!.topicId,
      subtopic_id: null,
      difficulty: 'medium',
      status: 'active',
      created_by: adminUserId,
      question_type: 'diagram_label',
      question_text: 'Zone carries an extra author-only key',
      diagram_config: configWithExtraKey,
      explanation_text: 'Extra-key explanation',
    })

    const row = await fetchRow([extraKeyId], extraKeyId)
    if (
      row.diagram_config_public === null ||
      typeof row.diagram_config_public !== 'object' ||
      Array.isArray(row.diagram_config_public)
    ) {
      throw new Error('diagram_config_public is not an object')
    }
    const deliveredConfig = row.diagram_config_public as Record<string, unknown>
    if (!Array.isArray(deliveredConfig.zones)) throw new Error('zones is not an array')
    const deliveredZone = deliveredConfig.zones[0] as Record<string, unknown>
    expect(Object.keys(deliveredZone).sort()).toEqual(['h', 'id', 'w', 'x', 'y'])
    expect('internal_note' in deliveredZone).toBe(false)
  })
})
