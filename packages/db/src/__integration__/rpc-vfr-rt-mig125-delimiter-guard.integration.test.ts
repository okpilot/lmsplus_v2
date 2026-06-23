// ────────────────────────────────────────────────────────────────────────────
// mig 125 — dialog_fill delimiter guard (answer-key leak #951)
// ────────────────────────────────────────────────────────────────────────────
//
// The dialog_fill token grammar is {{n|canonical;syn1;syn2}}. The strip regex
// in get_quiz_questions and get_vfr_rt_exam_questions rewrites every token to
// {{n}}. If a canonical or synonym contains a structural delimiter (} | { ;),
// the regex cannot cleanly strip it — a stray brace leaks into the student-
// facing template. Two CHECK constraints close this at the data layer:
//
//   questions_dialog_fill_blanks_delimiter_free — every canonical and every
//   synonym in blanks_config must be free of { } | ;.
//
//   questions_dialog_fill_template_wellformed — after removing every well-
//   formed {{n|value}} token (value region [^{}|]*), no stray { or } may
//   remain in the template.
//
// These tests INSERT malformed rows via the service-role client and assert a
// 23514 check-violation. A positive control in each test confirms a valid
// dialog_fill row inserts cleanly first, making the rejection non-vacuous.
// The CHECK fires on the raw INSERT — no plpgsql body involved, so execution-
// time deferral does not apply (the CHECK validates the row directly, not
// inside a plpgsql function body).

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupReferenceData, cleanupTestData } from './cleanup'
import { seedReferenceData } from './seed'
import { createTestOrg, createTestUser, getAdminClient } from './setup'

const admin = getAdminClient()
const suffix = Date.now()

describe('Constraint regression — mig 125 dialog_fill delimiter guard', () => {
  let orgId: string
  let adminUserId: string
  let bankId: string
  let refs: Awaited<ReturnType<typeof seedReferenceData>>
  const userIds: string[] = []
  // Track ids of successfully-inserted positive-control rows for soft-delete
  // cleanup (dialog_fill questions are soft-deletable via deleted_at).
  const insertedQuestionIds: string[] = []

  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `Test Org DelimGuard ${suffix}`,
      slug: `test-delimguard-${suffix}`,
    })
    adminUserId = await createTestUser({
      admin,
      orgId,
      email: `admin-delimguard-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'admin',
    })
    userIds.push(adminUserId)

    refs = await seedReferenceData({
      admin,
      subjectCode: `DG${suffix}`,
      subjectName: `DelimGuard Subject ${suffix}`,
      topicCode: `DG${suffix}-01`,
      topicName: `DelimGuard Topic ${suffix}`,
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
          name: `DelimGuard Bank ${suffix}`,
          created_by: adminUserId,
        })
        .select('id')
        .single()
      if (bErr) throw new Error(`bank insert: ${bErr.message}`)
      bankId = (bank as { id: string }).id
    }
  })

  afterAll(async () => {
    // Soft-delete positive-control rows before org cleanup.
    const errors: string[] = []
    try {
      if (insertedQuestionIds.length > 0) {
        const { error } = await admin
          .from('questions')
          .update({ deleted_at: new Date().toISOString() })
          .in('id', insertedQuestionIds)
          .select('id')
        if (error) throw new Error(`soft-delete control rows: ${error.message}`)
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    } finally {
      insertedQuestionIds.length = 0
    }
    if (errors.length === 0) {
      try {
        if (orgId) await cleanupTestData({ admin, orgId, userIds })
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e))
      }
    }
    if (errors.length === 0) {
      try {
        await cleanupReferenceData({ admin, refs: [refs] })
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e))
      }
    }
    if (errors.length > 0) throw new Error(`afterAll: ${errors.join('; ')}`)
  })

  it('rejects a dialog_fill question whose answer value contains a closing brace', async () => {
    // Positive control: a clean dialog_fill row with delimiter-free canonical
    // must insert successfully, confirming the harness can insert dialog_fill
    // and that the rejection below is meaningful.
    const { data: controlRow, error: controlErr } = await admin
      .from('questions')
      .insert({
        organization_id: orgId,
        bank_id: bankId,
        subject_id: refs.subjectId,
        topic_id: refs.topicId,
        question_text: 'DF delimiter test — clean canonical control?',
        explanation_text: 'Explanation',
        question_type: 'dialog_fill',
        dialog_template: '[atc] Cleared to land. {{0|wilco}} report vacated.',
        blanks_config: [{ index: 0, canonical: 'wilco', synonyms: [] }],
        options: [],
        difficulty: 'medium',
        status: 'active',
        created_by: adminUserId,
      })
      .select('id')
      .single<{ id: string }>()
    expect(controlErr).toBeNull()
    if (!controlRow) throw new Error('positive control insert returned no row')
    insertedQuestionIds.push(controlRow.id)

    // Rejection: canonical contains '}', which the blanks_config delimiter
    // guard must reject with a check-violation.
    const { error } = await admin.from('questions').insert({
      organization_id: orgId,
      bank_id: bankId,
      subject_id: refs.subjectId,
      topic_id: refs.topicId,
      question_text: 'DF with closing-brace canonical — should be rejected?',
      explanation_text: 'Explanation',
      question_type: 'dialog_fill',
      dialog_template: '[atc] Cleared to land. {{0|sta}} report vacated.',
      blanks_config: [{ index: 0, canonical: 'sta}ll', synonyms: [] }],
      options: [],
      difficulty: 'medium',
      status: 'active',
      created_by: adminUserId,
    })
    expect(error).not.toBeNull()
    // 23514 = check_violation (questions_dialog_fill_blanks_delimiter_free)
    expect(error?.code).toBe('23514')
  })

  it('rejects a dialog_fill question whose synonym contains a pipe character', async () => {
    // Positive control: a clean dialog_fill row with delimiter-free synonyms
    // must insert successfully.
    const { data: controlRow, error: controlErr } = await admin
      .from('questions')
      .insert({
        organization_id: orgId,
        bank_id: bankId,
        subject_id: refs.subjectId,
        topic_id: refs.topicId,
        question_text: 'DF delimiter test — clean synonym control?',
        explanation_text: 'Explanation',
        question_type: 'dialog_fill',
        dialog_template: '[atc] Report passing. {{0|affirm;roger}} vacated.',
        blanks_config: [{ index: 0, canonical: 'affirm', synonyms: ['roger'] }],
        options: [],
        difficulty: 'medium',
        status: 'active',
        created_by: adminUserId,
      })
      .select('id')
      .single<{ id: string }>()
    expect(controlErr).toBeNull()
    if (!controlRow) throw new Error('positive control insert returned no row')
    insertedQuestionIds.push(controlRow.id)

    // Rejection: synonym contains '|', which is a structural token delimiter.
    // The blanks_config delimiter guard must reject this with a check-violation.
    const { error } = await admin.from('questions').insert({
      organization_id: orgId,
      bank_id: bankId,
      subject_id: refs.subjectId,
      topic_id: refs.topicId,
      question_text: 'DF with pipe synonym — should be rejected?',
      explanation_text: 'Explanation',
      question_type: 'dialog_fill',
      dialog_template: '[atc] Report passing. {{0|affirm}} vacated.',
      blanks_config: [{ index: 0, canonical: 'affirm', synonyms: ['a|b'] }],
      options: [],
      difficulty: 'medium',
      status: 'active',
      created_by: adminUserId,
    })
    expect(error).not.toBeNull()
    // 23514 = check_violation (questions_dialog_fill_blanks_delimiter_free)
    expect(error?.code).toBe('23514')
  })

  it('rejects a dialog_fill question whose template leaves a stray brace after stripping tokens', async () => {
    // Positive control: a clean dialog_fill row with a well-formed template
    // (all tokens strip cleanly to {{n}}) must insert successfully.
    const { data: controlRow, error: controlErr } = await admin
      .from('questions')
      .insert({
        organization_id: orgId,
        bank_id: bankId,
        subject_id: refs.subjectId,
        topic_id: refs.topicId,
        question_text: 'DF delimiter test — well-formed template control?',
        explanation_text: 'Explanation',
        question_type: 'dialog_fill',
        dialog_template: '[atc] {{0|clean}} over.',
        blanks_config: [{ index: 0, canonical: 'clean', synonyms: [] }],
        options: [],
        difficulty: 'medium',
        status: 'active',
        created_by: adminUserId,
      })
      .select('id')
      .single<{ id: string }>()
    expect(controlErr).toBeNull()
    if (!controlRow) throw new Error('positive control insert returned no row')
    insertedQuestionIds.push(controlRow.id)

    // Rejection: the dialog_template "[atc] {{0|sta}ll}} over." contains a '}'
    // inside the token value region. The strip regex [^{}|]* stops at the first
    // '}', so the token cannot be fully consumed — a stray '}' remains after
    // stripping, triggering the template wellformed CHECK.
    // Note: blanks_config canonical is "clean" (delimiter-free) so the
    // blanks_config guard does NOT fire — only the template guard fires here.
    const { error } = await admin.from('questions').insert({
      organization_id: orgId,
      bank_id: bankId,
      subject_id: refs.subjectId,
      topic_id: refs.topicId,
      question_text: 'DF with malformed template token — should be rejected?',
      explanation_text: 'Explanation',
      question_type: 'dialog_fill',
      dialog_template: '[atc] {{0|sta}ll}} over.',
      blanks_config: [{ index: 0, canonical: 'clean', synonyms: [] }],
      options: [],
      difficulty: 'medium',
      status: 'active',
      created_by: adminUserId,
    })
    expect(error).not.toBeNull()
    // 23514 = check_violation (questions_dialog_fill_template_wellformed)
    expect(error?.code).toBe('23514')
  })
})
