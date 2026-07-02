import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupReferenceData, cleanupTestData } from './cleanup'
import { seedReferenceData } from './seed'
import { createTestOrg, createTestUser, getAdminClient } from './setup'

// mig 151 widens enforce_answer_blank_index_shape() (the BEFORE INSERT trigger
// on quiz_session_answers + student_responses, mig 131, widened to `ordering`
// by mig 144) from
//   question_type IN ('dialog_fill','ordering')            <=> blank_index IS NOT NULL
// to
//   question_type IN ('dialog_fill','ordering','diagram_label') <=> blank_index IS NOT NULL
// so the `diagram_label` type's per-zone rows (non-null blank_index,
// non-dialog_fill/ordering) are ACCEPTED instead of rejected by the old ELSE
// branch — an EXECUTION-time behavior invisible to `db reset`.
//
// Non-vacuity (code-style.md §7): the trigger has NO current_role exemption,
// so the service-role inserts below ARE validated by it. Each fixture is
// chosen to PASS the single-row *_answer_shape_check CHECK and exercise ONLY
// the trigger:
//   * a diagram_label row with blank_index set → ACCEPTED (the widening; old
//     trigger rejected),
//   * a diagram_label row with blank_index NULL → REJECTED (biconditional
//     requires the index),
//   * a short_answer / MC row with blank_index set → still REJECTED
//     (regression guard).

const BLANK_REQUIRED_MSG = /blank_index is required for diagram_label/i
const BLANK_FORBIDDEN_MSG = /blank_index must be NULL/i

const ZONE_LABEL_TEXT_0 = 'Upwind Leg'
const ZONE_LABEL_TEXT_1 = 'Crosswind Leg'

const DIAGRAM_CONFIG = {
  image_ref: 'rwy-27-09-lh-pattern',
  zones: [
    { id: 'zone-nw', x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
    { id: 'zone-ne', x: 0.6, y: 0.1, w: 0.2, h: 0.2 },
  ],
  labels: [
    { id: 'lbl-alpha', text: ZONE_LABEL_TEXT_0 },
    { id: 'lbl-bravo', text: ZONE_LABEL_TEXT_1 },
  ],
  answer: [
    { zone_id: 'zone-nw', label_id: 'lbl-alpha' },
    { zone_id: 'zone-ne', label_id: 'lbl-bravo' },
  ],
}

describe('Trigger: enforce blank_index <=> dialog_fill OR ordering OR diagram_label on answer inserts', () => {
  const admin = getAdminClient()
  const suffix = Date.now()

  let orgId = ''
  let studentId: string
  let bankId: string
  let sessionId: string
  let mcQId: string
  let saQId: string
  let diagramQId: string
  let refs: Awaited<ReturnType<typeof seedReferenceData>> | null = null
  const userIds: string[] = []

  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `Test Org DiagramBlankIdx ${suffix}`,
      slug: `test-diagramblankidx-${suffix}`,
    })
    const adminUserId = await createTestUser({
      admin,
      orgId,
      email: `admin-diagramblankidx-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'admin',
    })
    userIds.push(adminUserId)
    studentId = await createTestUser({
      admin,
      orgId,
      email: `student-diagramblankidx-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(studentId)
    refs = await seedReferenceData({
      admin,
      subjectCode: `DB${suffix}`,
      subjectName: `DiagramBlankIdx Subject ${suffix}`,
      topicCode: `DB${suffix}-01`,
      topicName: `DiagramBlankIdx Topic ${suffix}`,
    })

    const { data: bank, error: bErr } = await admin
      .from('question_banks')
      .insert({
        organization_id: orgId,
        name: `DiagramBlankIdx Bank ${suffix}`,
        created_by: adminUserId,
      })
      .select('id')
      .single<{ id: string }>()
    if (bErr) throw new Error(`bank insert: ${bErr.message}`)
    bankId = bank!.id

    const base = {
      organization_id: orgId,
      bank_id: bankId,
      subject_id: refs.subjectId,
      topic_id: refs.topicId,
      explanation_text: 'Explanation',
      difficulty: 'medium',
      status: 'active',
      created_by: adminUserId,
    }
    const { data: qs, error: qErr } = await admin
      .from('questions')
      .insert([
        {
          ...base,
          question_text: `MC ${suffix}?`,
          question_type: 'multiple_choice',
          correct_option_id: 'b',
          // blanks_config/ordering_items/diagram_config are set on every row so
          // PostgREST's batch column-alignment doesn't null/default-fill from a
          // sibling row.
          blanks_config: [],
          ordering_items: [],
          diagram_config: null,
          options: [
            { id: 'a', text: 'A' },
            { id: 'b', text: 'B' },
            { id: 'c', text: 'C' },
            { id: 'd', text: 'D' },
          ],
        },
        {
          ...base,
          question_text: `SA ${suffix}?`,
          question_type: 'short_answer',
          canonical_answer: 'wilco',
          blanks_config: [],
          ordering_items: [],
          diagram_config: null,
          options: [],
        },
        {
          ...base,
          question_text: `DIAGRAM ${suffix}?`,
          question_type: 'diagram_label',
          diagram_config: DIAGRAM_CONFIG,
          blanks_config: [],
          ordering_items: [],
          options: [],
        },
      ])
      .select('id, question_type')
    if (qErr) throw new Error(`questions insert: ${qErr.message}`)
    if (!Array.isArray(qs) || qs.length !== 3) throw new Error('questions insert: unexpected shape')
    mcQId = qs.find((q) => q.question_type === 'multiple_choice')!.id
    saQId = qs.find((q) => q.question_type === 'short_answer')!.id
    diagramQId = qs.find((q) => q.question_type === 'diagram_label')!.id

    const { data: session, error: sErr } = await admin
      .from('quiz_sessions')
      .insert({ organization_id: orgId, student_id: studentId, mode: 'quick_quiz', config: {} })
      .select('id')
      .single<{ id: string }>()
    if (sErr) throw new Error(`session insert: ${sErr.message}`)
    sessionId = session!.id
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

  // ---- quiz_session_answers ----

  it('accepts a diagram_label answer that carries a blank_index', async () => {
    const { error } = await admin.from('quiz_session_answers').insert({
      session_id: sessionId,
      question_id: diagramQId,
      response_text: ZONE_LABEL_TEXT_0,
      blank_index: 0,
      is_correct: true,
      response_time_ms: 1000,
    })
    expect(error).toBeNull()
  })

  it('rejects a diagram_label answer missing its blank_index', async () => {
    const { error } = await admin.from('quiz_session_answers').insert({
      session_id: sessionId,
      question_id: diagramQId,
      response_text: ZONE_LABEL_TEXT_0, // CHECK text-branch allows blank_index NULL; the trigger rejects it.
      is_correct: true,
      response_time_ms: 1000,
    })
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(BLANK_REQUIRED_MSG)
  })

  it('rejects a short_answer answer that carries a blank_index', async () => {
    const { error } = await admin.from('quiz_session_answers').insert({
      session_id: sessionId,
      question_id: saQId,
      response_text: 'wilco',
      blank_index: 1, // non-dialog_fill/ordering/diagram_label type with a blank_index → trigger rejects.
      is_correct: true,
      response_time_ms: 1000,
    })
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(BLANK_FORBIDDEN_MSG)
  })

  it('rejects a multiple_choice answer that carries a blank_index', async () => {
    const { error } = await admin.from('quiz_session_answers').insert({
      session_id: sessionId,
      question_id: mcQId,
      selected_option_id: 'b',
      blank_index: 0,
      is_correct: true,
      response_time_ms: 1000,
    })
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(BLANK_FORBIDDEN_MSG)
  })

  // ---- student_responses (same trigger, second table) ----

  it('accepts a diagram_label student_response with a non-NULL blank_index', async () => {
    const { error } = await admin.from('student_responses').insert({
      organization_id: orgId,
      student_id: studentId,
      question_id: diagramQId,
      session_id: sessionId,
      response_text: ZONE_LABEL_TEXT_1,
      blank_index: 1,
      is_correct: true,
      response_time_ms: 1000,
    })
    expect(error).toBeNull()
  })

  it('rejects a diagram_label student_response missing its blank_index', async () => {
    const { error } = await admin.from('student_responses').insert({
      organization_id: orgId,
      student_id: studentId,
      question_id: diagramQId,
      session_id: sessionId,
      response_text: ZONE_LABEL_TEXT_0, // CHECK text-branch allows blank_index NULL; the trigger rejects it.
      is_correct: true,
      response_time_ms: 1000,
    })
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(BLANK_REQUIRED_MSG)
  })
})
