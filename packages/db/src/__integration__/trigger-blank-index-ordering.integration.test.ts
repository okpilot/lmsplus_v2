import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupReferenceData, cleanupTestData } from './cleanup'
import { seedReferenceData } from './seed'
import { createTestOrg, createTestUser, getAdminClient } from './setup'

// mig 135 widens enforce_answer_blank_index_shape() (the BEFORE INSERT trigger on
// quiz_session_answers + student_responses, mig 131) from
//   question_type = 'dialog_fill'           <=> blank_index IS NOT NULL
// to
//   question_type IN ('dialog_fill','ordering') <=> blank_index IS NOT NULL
// so the `ordering` type's per-slot rows (non-null blank_index, non-dialog_fill)
// are ACCEPTED instead of rejected by the old ELSE branch — an EXECUTION-time
// behavior invisible to `db reset`.
//
// Non-vacuity (code-style.md §7): the trigger has NO current_role exemption, so the
// service-role inserts below ARE validated by it. Each fixture is chosen to PASS the
// single-row *_answer_shape_check CHECK and exercise ONLY the trigger:
//   * an ordering row with blank_index set → ACCEPTED (the widening; old trigger rejected),
//   * an ordering row with blank_index NULL → REJECTED (biconditional requires the index),
//   * a short_answer / MC row with blank_index set → still REJECTED (regression guard).

const BLANK_REQUIRED_MSG = /blank_index is required for ordering/i
const BLANK_FORBIDDEN_MSG = /blank_index must be NULL/i

const ITEMS = [
  { id: 'tr-a', text: 'MAYDAY MAYDAY MAYDAY' },
  { id: 'tr-b', text: 'Golf Bravo Charlie' },
]
const ITEM_0_TEXT = ITEMS[0]!.text
const ITEM_1_TEXT = ITEMS[1]!.text

describe('Trigger: enforce blank_index <=> dialog_fill OR ordering on answer inserts', () => {
  const admin = getAdminClient()
  const suffix = Date.now()

  let orgId = ''
  let studentId: string
  let bankId: string
  let sessionId: string
  let mcQId: string
  let saQId: string
  let orderingQId: string
  let refs: Awaited<ReturnType<typeof seedReferenceData>> | null = null
  const userIds: string[] = []

  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `Test Org OrderBlankIdx ${suffix}`,
      slug: `test-orderblankidx-${suffix}`,
    })
    const adminUserId = await createTestUser({
      admin,
      orgId,
      email: `admin-orderblankidx-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'admin',
    })
    userIds.push(adminUserId)
    studentId = await createTestUser({
      admin,
      orgId,
      email: `student-orderblankidx-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(studentId)
    refs = await seedReferenceData({
      admin,
      subjectCode: `OB${suffix}`,
      subjectName: `OrderBlankIdx Subject ${suffix}`,
      topicCode: `OB${suffix}-01`,
      topicName: `OrderBlankIdx Topic ${suffix}`,
    })

    const { data: bank, error: bErr } = await admin
      .from('question_banks')
      .insert({
        organization_id: orgId,
        name: `OrderBlankIdx Bank ${suffix}`,
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
          // blanks_config/ordering_items are NOT NULL; set on every row so PostgREST's
          // batch column-alignment doesn't null/default-fill from a sibling row.
          blanks_config: [],
          ordering_items: [],
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
          options: [],
        },
        {
          ...base,
          question_text: `ORDER ${suffix}?`,
          question_type: 'ordering',
          ordering_items: ITEMS,
          blanks_config: [],
          options: [],
        },
      ])
      .select('id, question_type')
    if (qErr) throw new Error(`questions insert: ${qErr.message}`)
    if (!Array.isArray(qs) || qs.length !== 3) throw new Error('questions insert: unexpected shape')
    mcQId = qs.find((q) => q.question_type === 'multiple_choice')!.id
    saQId = qs.find((q) => q.question_type === 'short_answer')!.id
    orderingQId = qs.find((q) => q.question_type === 'ordering')!.id

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

  it('accepts an ordering answer that carries a blank_index', async () => {
    const { error } = await admin.from('quiz_session_answers').insert({
      session_id: sessionId,
      question_id: orderingQId,
      response_text: ITEM_0_TEXT,
      blank_index: 0,
      is_correct: true,
      response_time_ms: 1000,
    })
    expect(error).toBeNull()
  })

  it('rejects an ordering answer missing its blank_index', async () => {
    const { error } = await admin.from('quiz_session_answers').insert({
      session_id: sessionId,
      question_id: orderingQId,
      response_text: ITEM_0_TEXT, // CHECK text-branch allows blank_index NULL; the trigger rejects it.
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
      blank_index: 1, // non-dialog_fill/non-ordering type with a blank_index → trigger rejects.
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

  it('accepts an ordering student_response with a non-NULL blank_index', async () => {
    const { error } = await admin.from('student_responses').insert({
      organization_id: orgId,
      student_id: studentId,
      question_id: orderingQId,
      session_id: sessionId,
      response_text: ITEM_1_TEXT,
      blank_index: 1,
      is_correct: true,
      response_time_ms: 1000,
    })
    expect(error).toBeNull()
  })

  it('rejects an ordering student_response missing its blank_index', async () => {
    const { error } = await admin.from('student_responses').insert({
      organization_id: orgId,
      student_id: studentId,
      question_id: orderingQId,
      session_id: sessionId,
      response_text: ITEM_0_TEXT, // CHECK text-branch allows blank_index NULL; the trigger rejects it.
      is_correct: true,
      response_time_ms: 1000,
    })
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(BLANK_REQUIRED_MSG)
  })
})
