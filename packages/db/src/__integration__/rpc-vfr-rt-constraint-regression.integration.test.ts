/**
 * A.11 — Constraint regression tests (mig 094).
 *
 * ## mig 094 — questions_question_type_columns_check (accepted_synonyms tightening)
 *
 * commit f8898771 added `accepted_synonyms = '{}'` to the multiple_choice and
 * dialog_fill branches of the CHECK — the original CHECK advertised
 * no-cross-contamination but left accepted_synonyms unguarded in those two
 * branches. A type-switch or admin-form bug could silently leave stale synonyms
 * on an MC or dialog_fill row. The CHECK now rejects that at the DB layer.
 *
 * These tests exercise the rejection paths (bad INSERT hits the CHECK and returns
 * a 23514 error) and a positive control (valid row inserts cleanly), confirming
 * the constraint fires correctly at execution time.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupReferenceData, cleanupTestData } from './cleanup'
import { fixtureSuffix } from './fixture-suffix'
import { seedReferenceData } from './seed'
import { createTestOrg, createTestUser, getAdminClient } from './setup'

const admin = getAdminClient()
const suffix = fixtureSuffix()

// ────────────────────────────────────────────────────────────────────────────
// mig 094 — questions_question_type_columns_check (accepted_synonyms branches)
// ────────────────────────────────────────────────────────────────────────────
//
// commit f8898771 tightened the CHECK to require accepted_synonyms = '{}'
// in the multiple_choice and dialog_fill branches. Before this commit a
// type-switch (or admin-form bug) could write non-empty synonyms on an MC or
// dialog_fill row without any DB-layer rejection.
//
// These tests INSERT invalid rows via the service-role admin client (which
// bypasses RLS) and assert a 23514 check-violation error is returned.
// A positive control confirms a valid row still inserts without error.
// No RPCs involved — the CHECK fires on the raw INSERT, independent of any
// plpgsql body, so execution-time deferral does not apply here.

describe('Constraint regression — mig 094 accepted_synonyms CHECK on multiple_choice and dialog_fill', () => {
  let orgId: string
  let adminUserId: string
  let bankId: string
  let refs: Awaited<ReturnType<typeof seedReferenceData>>
  const userIds: string[] = []

  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `Test Org SynCheck ${suffix}`,
      slug: `test-syncheck-${suffix}`,
    })
    adminUserId = await createTestUser({
      admin,
      orgId,
      email: `admin-syncheck-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'admin',
    })
    userIds.push(adminUserId)

    refs = await seedReferenceData({
      admin,
      subjectCode: `SC${suffix}`,
      subjectName: `SynCheck Subject ${suffix}`,
      topicCode: `SC${suffix}-01`,
      topicName: `SynCheck Topic ${suffix}`,
    })

    const { data: existingBank, error: lookupErr } = await admin
      .from('question_banks')
      .select('id')
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .maybeSingle()
    if (lookupErr) throw new Error(`bank lookup: ${lookupErr.message}`)
    if (existingBank) {
      bankId = (existingBank as { id: string }).id
    } else {
      const { data: bank, error: bErr } = await admin
        .from('question_banks')
        .insert({
          organization_id: orgId,
          name: `SynCheck Bank ${suffix}`,
          created_by: adminUserId,
        })
        .select('id')
        .single()
      if (bErr) throw new Error(`bank insert: ${bErr.message}`)
      bankId = (bank as { id: string }).id
    }
  })

  afterAll(async () => {
    if (orgId) await cleanupTestData({ admin, orgId, userIds })
    await cleanupReferenceData({ admin, refs: [refs] })
  })

  it('rejects a multiple_choice row with non-empty accepted_synonyms with a check-violation error', async () => {
    // Before f8898771 this INSERT would succeed silently, leaving stale synonyms
    // on an MC question. The tightened CHECK must reject it with 23514.
    const { error } = await admin.from('questions').insert({
      organization_id: orgId,
      bank_id: bankId,
      subject_id: refs.subjectId,
      topic_id: refs.topicId,
      question_text: 'MC with synonyms — should be rejected?',
      explanation_text: 'Explanation',
      question_type: 'multiple_choice',
      // Intentionally non-empty — this violates the new branch of the CHECK
      accepted_synonyms: ['stale_synonym'],
      // Set correct_option_id so the biconditional MC key CHECK
      // (questions_mc_correct_option_id_check, #823 mig 111) is satisfied and
      // the synonyms CHECK under test is the constraint that actually fires.
      correct_option_id: 'b',
      options: [
        { id: 'a', text: 'Option A' },
        { id: 'b', text: 'Option B' },
      ],
      difficulty: 'medium',
      status: 'active',
      created_by: adminUserId,
    })
    expect(error).not.toBeNull()
    // 23514 = check_violation (questions_question_type_columns_check)
    expect(error?.code).toBe('23514')
  })

  it('rejects a dialog_fill row with non-empty accepted_synonyms with a check-violation error', async () => {
    // dialog_fill uses per-blank synonyms inside blanks_config, not accepted_synonyms.
    // The tightened CHECK requires accepted_synonyms = '{}' for dialog_fill.
    const { error } = await admin.from('questions').insert({
      organization_id: orgId,
      bank_id: bankId,
      subject_id: refs.subjectId,
      topic_id: refs.topicId,
      question_text: 'DF with synonyms — should be rejected?',
      explanation_text: 'Explanation',
      question_type: 'dialog_fill',
      dialog_template: '[atc] Cleared to land. {{0}} report vacated.',
      blanks_config: [{ index: 0, canonical: 'wilco', synonyms: [] }],
      // Intentionally non-empty — this violates the new branch of the CHECK
      accepted_synonyms: ['stale_synonym'],
      options: [],
      difficulty: 'medium',
      status: 'active',
      created_by: adminUserId,
    })
    expect(error).not.toBeNull()
    // 23514 = check_violation (questions_question_type_columns_check)
    expect(error?.code).toBe('23514')
  })

  it('accepts a valid short_answer row with non-empty accepted_synonyms', async () => {
    // Positive control: the short_answer branch has NO constraint on accepted_synonyms
    // (it is the only type that legitimately uses it). This insert must succeed.
    const { data, error } = await admin
      .from('questions')
      .insert({
        organization_id: orgId,
        bank_id: bankId,
        subject_id: refs.subjectId,
        topic_id: refs.topicId,
        question_text: 'SA with synonyms — should be accepted?',
        explanation_text: 'Explanation',
        question_type: 'short_answer',
        canonical_answer: 'wilco',
        accepted_synonyms: ['roger', 'affirmative'],
        options: [],
        difficulty: 'medium',
        status: 'active',
        created_by: adminUserId,
      })
      .select('id, accepted_synonyms')
      .single<{ id: string; accepted_synonyms: string[] }>()
    expect(error).toBeNull()
    expect(data).not.toBeNull()
    expect(data?.accepted_synonyms).toEqual(['roger', 'affirmative'])
  })
})

// ────────────────────────────────────────────────────────────────────────────
// commit 13dce467 — negative blank_index guard in answer-shape CHECKs
// ────────────────────────────────────────────────────────────────────────────
//
// Both quiz_session_answers and student_responses previously accepted any
// integer blank_index value. The tightened CHECK adds
//   `AND (blank_index IS NULL OR blank_index >= 0)`
// to the text-response branch. A negative index would produce a
// UNIQUE-distinct row that inflates dialog_fill correct-row counts without
// corresponding to a real blank.
//
// quiz_session_answers has a NOT NULL FK to quiz_sessions, so a valid session
// row is required. We admin-INSERT a minimal quiz_sessions row directly
// (bypassing RLS) rather than going through the RPC to keep this describe
// block self-contained.
//
// student_responses.session_id is nullable, so no session FK is needed there.
//
// The CHECK fires on raw INSERT — no plpgsql body involved, so execution-time
// deferral does not apply (same reasoning as the mig 094 block above).

describe('Constraint regression — commit 13dce467 negative blank_index guard on answer-shape CHECKs', () => {
  let orgId: string
  let studentUserId: string
  let adminUserId: string
  let questionId: string
  let sessionId: string
  let refs: Awaited<ReturnType<typeof seedReferenceData>>
  const userIds: string[] = []

  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `Test Org BlankIdx ${suffix}`,
      slug: `test-blankidx-${suffix}`,
    })
    adminUserId = await createTestUser({
      admin,
      orgId,
      email: `admin-blankidx-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'admin',
    })
    userIds.push(adminUserId)

    studentUserId = await createTestUser({
      admin,
      orgId,
      email: `student-blankidx-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(studentUserId)

    refs = await seedReferenceData({
      admin,
      subjectCode: `BI${suffix}`,
      subjectName: `BlankIdx Subject ${suffix}`,
      topicCode: `BI${suffix}-01`,
      topicName: `BlankIdx Topic ${suffix}`,
    })

    // Seed a single dialog_fill question. dialog_fill is the question type whose
    // per-blank rows legitimately carry a blank_index (the scenario these tests
    // describe — a negative blank_index inflating dialog_fill correct-row counts).
    // It must be dialog_fill (not short_answer) so the blank_index ⇔ dialog_fill
    // write-time trigger (mig 131, #828) ACCEPTS a non-NULL blank_index — leaving
    // the mig-095 `blank_index >= 0` answer-shape CHECK (added by commit 13dce467)
    // as the constraint under
    // test for the -1 rejection (a short_answer row may carry no blank_index at all
    // under mig 131, so it could never reach that CHECK).
    const { data: bankRow, error: bankLookupErr } = await admin
      .from('question_banks')
      .select('id')
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .maybeSingle<{ id: string }>()
    if (bankLookupErr) throw new Error(`bank lookup: ${bankLookupErr.message}`)
    let bankId: string
    if (bankRow) {
      bankId = bankRow.id
    } else {
      const { data: newBank, error: bankErr } = await admin
        .from('question_banks')
        .insert({
          organization_id: orgId,
          name: `BlankIdx Bank ${suffix}`,
          created_by: adminUserId,
        })
        .select('id')
        .single<{ id: string }>()
      if (bankErr) throw new Error(`bank insert: ${bankErr.message}`)
      bankId = newBank.id
    }

    const { data: qRow, error: qErr } = await admin
      .from('questions')
      .insert({
        organization_id: orgId,
        bank_id: bankId,
        subject_id: refs.subjectId,
        topic_id: refs.topicId,
        question_text: 'BlankIdx fixture question',
        explanation_text: 'Explanation',
        question_type: 'dialog_fill',
        dialog_template: 'Cleared to land runway {{0|wilco}}.',
        blanks_config: [{ index: 0, canonical: 'wilco' }],
        accepted_synonyms: [],
        options: [],
        difficulty: 'medium',
        status: 'active',
        created_by: adminUserId,
      })
      .select('id')
      .single<{ id: string }>()
    if (qErr) throw new Error(`question insert: ${qErr.message}`)
    questionId = qRow.id

    // Admin-insert a minimal quiz_sessions row so quiz_session_answers tests
    // have a valid session FK. The service-role client bypasses RLS for this.
    const { data: sessRow, error: sessErr } = await admin
      .from('quiz_sessions')
      .insert({
        organization_id: orgId,
        student_id: studentUserId,
        mode: 'quick_quiz',
        subject_id: refs.subjectId,
        config: {},
        total_questions: 1,
      })
      .select('id')
      .single<{ id: string }>()
    if (sessErr) throw new Error(`session insert: ${sessErr.message}`)
    sessionId = sessRow.id
  })

  afterAll(async () => {
    if (orgId) await cleanupTestData({ admin, orgId, userIds })
    await cleanupReferenceData({ admin, refs: [refs] })
  })

  it('rejects a quiz_session_answers text-response row with blank_index = -1 with a check-violation error', async () => {
    // Before commit 13dce467 a negative blank_index would insert silently,
    // creating a UNIQUE-distinct row that inflates dialog_fill correct-row counts.
    const { error } = await admin.from('quiz_session_answers').insert({
      session_id: sessionId,
      question_id: questionId,
      selected_option_id: null,
      response_text: 'wilco',
      blank_index: -1, // violates the new >= 0 guard
      is_correct: true,
      response_time_ms: 500,
    })
    expect(error).not.toBeNull()
    // 23514 = check_violation (quiz_session_answers_answer_shape_check)
    expect(error?.code).toBe('23514')
  })

  it('accepts a quiz_session_answers text-response row with blank_index = 0', async () => {
    // Positive control: blank_index = 0 is a valid first-blank ordinal and
    // must be accepted by the tightened CHECK.
    const { data, error } = await admin
      .from('quiz_session_answers')
      .insert({
        session_id: sessionId,
        question_id: questionId,
        selected_option_id: null,
        response_text: 'wilco',
        blank_index: 0,
        is_correct: true,
        response_time_ms: 500,
      })
      .select('id, blank_index')
      .single<{ id: string; blank_index: number }>()
    expect(error).toBeNull()
    expect(data).not.toBeNull()
    expect(data?.blank_index).toBe(0)
  })

  it('rejects a student_responses text-response row with blank_index = -1 with a check-violation error', async () => {
    // student_responses mirrors the same CHECK tightening. session_id is nullable
    // so no session FK is required here.
    const { error } = await admin.from('student_responses').insert({
      organization_id: orgId,
      student_id: studentUserId,
      question_id: questionId,
      session_id: null,
      selected_option_id: null,
      response_text: 'wilco',
      blank_index: -1, // violates the new >= 0 guard
      is_correct: true,
      response_time_ms: 500,
    })
    expect(error).not.toBeNull()
    // 23514 = check_violation (student_responses_answer_shape_check)
    expect(error?.code).toBe('23514')
  })

  it('accepts a student_responses text-response row with blank_index = 0', async () => {
    // Positive control for the rejection test above: the same row shape with a
    // valid blank_index passes the CHECK, proving it admits valid shapes
    // (non-vacuous). student_responses is append-only — never update/delete it
    // here; the row is org-scoped and removed by the suite's org cleanup.
    const { data, error } = await admin
      .from('student_responses')
      .insert({
        organization_id: orgId,
        student_id: studentUserId,
        question_id: questionId,
        session_id: null,
        selected_option_id: null,
        response_text: 'wilco',
        blank_index: 0,
        is_correct: true,
        response_time_ms: 500,
      })
      .select('id, blank_index')
      .single<{ id: string; blank_index: number }>()
    expect(error).toBeNull()
    expect(data).not.toBeNull()
    expect(data?.blank_index).toBe(0)
  })
})
