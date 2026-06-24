import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupReferenceData, cleanupTestData } from './cleanup'
import { seedReferenceData } from './seed'
import { createTestOrg, createTestUser, getAdminClient } from './setup'

// #828: the BEFORE INSERT trigger trg_enforce_blank_index_shape_{qsa,sr} enforces
// the write-time invariant `question_type = 'dialog_fill' <=> blank_index IS NOT NULL`
// on both answer tables (quiz_session_answers, student_responses) via a cross-table
// question_type lookup the single-row *_answer_shape_check CHECK cannot do.
//
// Non-vacuity (code-style.md §7): the trigger has NO current_role exemption, so the
// service-role inserts below ARE validated by it (unlike quiz_sessions_protect_immutable
// mig 079, which exempts service_role). Each REJECT fixture is chosen to PASS the
// existing CHECK and fail ONLY the trigger — proving the trigger does something the
// CHECK structurally cannot:
//   * a short_answer row with blank_index >= 0 (CHECK text-branch allows it; trigger
//     rejects because the question is not dialog_fill)
//   * a dialog_fill row with blank_index NULL (CHECK text-branch allows it; trigger
//     rejects because dialog_fill requires a blank_index)
// The ACCEPT controls confirm the trigger does not over-reject legitimate shapes.

// Expected RAISE prose from the trigger (mig 131), shared by the reject cases on
// both tables. Asserting on the MESSAGE — not SQLSTATE — is intentional: the
// trigger raises 'check_violation' (23514), the SAME code as the mig-095
// answer_shape_check, so only the message distinguishes a trigger rejection from a
// CHECK rejection (the non-vacuity this suite exists to prove). Keep these in sync
// with the RAISE text in 131_enforce_blank_index_dialog_fill.sql.
const BLANK_FORBIDDEN_MSG = /blank_index must be NULL/i
const BLANK_REQUIRED_MSG = /blank_index is required for dialog_fill/i

describe('Trigger: enforce blank_index <=> dialog_fill on answer inserts', () => {
  const admin = getAdminClient()
  const suffix = Date.now()

  let orgId: string
  let studentId: string
  let bankId: string
  let sessionId: string
  let mcQId: string
  let saQId: string
  let dfQId: string
  let refs: Awaited<ReturnType<typeof seedReferenceData>>
  const userIds: string[] = []

  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `Test Org BlankIdx ${suffix}`,
      slug: `test-blankidx-${suffix}`,
    })

    const adminUserId = await createTestUser({
      admin,
      orgId,
      email: `admin-blankidx-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'admin',
    })
    userIds.push(adminUserId)

    studentId = await createTestUser({
      admin,
      orgId,
      email: `student-blankidx-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(studentId)

    refs = await seedReferenceData({
      admin,
      subjectCode: `B${suffix}`,
      subjectName: `BlankIdx Subject ${suffix}`,
      topicCode: `B${suffix}-01`,
      topicName: `BlankIdx Topic ${suffix}`,
    })

    const { data: bank, error: bErr } = await admin
      .from('question_banks')
      .insert({ organization_id: orgId, name: `BlankIdx Bank ${suffix}`, created_by: adminUserId })
      .select('id')
      .single<{ id: string }>()
    if (bErr) throw new Error(`bank insert: ${bErr.message}`)
    bankId = bank!.id

    // One question of each type. Required per-type columns are set per the
    // questions_question_type_columns_check discriminator (mig 094).
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
          // blanks_config is NOT NULL; set it on every row so PostgREST's batch
          // column-alignment doesn't null-fill it from the dialog_fill row below.
          blanks_config: [],
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
          options: [],
        },
        {
          ...base,
          question_text: `DF ${suffix}?`,
          question_type: 'dialog_fill',
          dialog_template: 'Cleared to land runway {{0|two seven}}.',
          blanks_config: [{ index: 0, canonical: 'two seven' }],
          options: [],
        },
      ])
      .select('id, question_type')
    if (qErr) throw new Error(`questions insert: ${qErr.message}`)
    if (!Array.isArray(qs) || qs.length !== 3) throw new Error('questions insert: unexpected shape')
    mcQId = qs.find((q) => q.question_type === 'multiple_choice')!.id
    saQId = qs.find((q) => q.question_type === 'short_answer')!.id
    dfQId = qs.find((q) => q.question_type === 'dialog_fill')!.id

    const { data: session, error: sErr } = await admin
      .from('quiz_sessions')
      .insert({ organization_id: orgId, student_id: studentId, mode: 'quick_quiz', config: {} })
      .select('id')
      .single<{ id: string }>()
    if (sErr) throw new Error(`session insert: ${sErr.message}`)
    sessionId = session!.id
  })

  afterAll(async () => {
    await cleanupTestData({ admin, orgId, userIds })
    await cleanupReferenceData({ admin, refs: [refs] })
  })

  // ---- quiz_session_answers ----

  it('accepts a multiple_choice answer with a NULL blank_index', async () => {
    const { error } = await admin.from('quiz_session_answers').insert({
      session_id: sessionId,
      question_id: mcQId,
      selected_option_id: 'b',
      is_correct: true,
      response_time_ms: 1000,
    })
    expect(error).toBeNull()
  })

  it('accepts a short_answer answer with a NULL blank_index', async () => {
    const { error } = await admin.from('quiz_session_answers').insert({
      session_id: sessionId,
      question_id: saQId,
      response_text: 'wilco',
      is_correct: true,
      response_time_ms: 1000,
    })
    expect(error).toBeNull()
  })

  it('accepts a dialog_fill answer with a non-NULL blank_index', async () => {
    const { error } = await admin.from('quiz_session_answers').insert({
      session_id: sessionId,
      question_id: dfQId,
      response_text: 'two seven',
      blank_index: 0,
      is_correct: true,
      response_time_ms: 1000,
    })
    expect(error).toBeNull()
  })

  it('rejects a short_answer answer carrying a blank_index (passes CHECK, trips trigger)', async () => {
    const { error } = await admin.from('quiz_session_answers').insert({
      session_id: sessionId,
      question_id: saQId,
      response_text: 'wilco',
      blank_index: 2, // CHECK text-branch allows blank_index >= 0; the trigger rejects it.
      is_correct: true,
      response_time_ms: 1000,
    })
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(BLANK_FORBIDDEN_MSG)
  })

  it('rejects a dialog_fill answer missing its blank_index (passes CHECK, trips trigger)', async () => {
    const { error } = await admin.from('quiz_session_answers').insert({
      session_id: sessionId,
      question_id: dfQId,
      response_text: 'two seven', // CHECK text-branch allows blank_index NULL; the trigger rejects it.
      is_correct: true,
      response_time_ms: 1000,
    })
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(BLANK_REQUIRED_MSG)
  })

  // ---- student_responses (same trigger, second table) ----

  it('accepts a multiple_choice student_response with a NULL blank_index', async () => {
    const { error } = await admin.from('student_responses').insert({
      organization_id: orgId,
      student_id: studentId,
      question_id: mcQId,
      session_id: sessionId,
      selected_option_id: 'b',
      is_correct: true,
      response_time_ms: 1000,
    })
    expect(error).toBeNull()
  })

  it('accepts a dialog_fill student_response with a non-NULL blank_index', async () => {
    const { error } = await admin.from('student_responses').insert({
      organization_id: orgId,
      student_id: studentId,
      question_id: dfQId,
      session_id: sessionId,
      response_text: 'two seven',
      blank_index: 0,
      is_correct: true,
      response_time_ms: 1000,
    })
    expect(error).toBeNull()
  })

  it('rejects a short_answer student_response carrying a blank_index (passes CHECK, trips trigger)', async () => {
    const { error } = await admin.from('student_responses').insert({
      organization_id: orgId,
      student_id: studentId,
      question_id: saQId,
      session_id: sessionId,
      response_text: 'wilco',
      blank_index: 1,
      is_correct: true,
      response_time_ms: 1000,
    })
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(BLANK_FORBIDDEN_MSG)
  })

  it('rejects a dialog_fill student_response missing its blank_index (passes CHECK, trips trigger)', async () => {
    const { error } = await admin.from('student_responses').insert({
      organization_id: orgId,
      student_id: studentId,
      question_id: dfQId,
      session_id: sessionId,
      response_text: 'two seven',
      is_correct: true,
      response_time_ms: 1000,
    })
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(BLANK_REQUIRED_MSG)
  })
})
