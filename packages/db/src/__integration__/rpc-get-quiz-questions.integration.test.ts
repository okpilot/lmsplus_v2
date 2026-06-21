import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupReferenceData, cleanupTestData } from './cleanup'
import { seedReferenceData } from './seed'
import { createTestOrg, createTestUser, getAdminClient, getAuthenticatedClient } from './setup'

// Red-team Vector EK — get_quiz_questions non-MC delivery contract (mig 118, #697 Phase 2).
//
// mig 118 widened get_quiz_questions to deliver short_answer + dialog_fill rows
// alongside multiple_choice, with every answer key stripped server-side
// (security.md rule 1). The stripping happens in three places that a CREATE-time
// `db reset` does NOT exercise — they only run when the function executes against
// real rows:
//   * the correlated-subquery options CASE (MC only → {id,text}, else NULL),
//   * the dialog_template regexp_replace that rewrites {{n|canonical; syn}} → {{n}},
//   * the blanks_safe jsonb_agg that projects blanks_config to {index} only.
// Plus the active-user gate (rule 12 / #883) that a soft-deleted caller must hit.
// This file is the runtime execution-proof for all four.

type QuizQuestionRow = {
  id: string
  question_text: string
  options: unknown
  question_type: string
  dialog_template: string | null
  blanks_safe: unknown
  explanation_text: string | null
}

/** Insert one question of a given type directly (seedQuestions only does MC + sets
 *  correct_option_id, which the questions_mc_correct_option_id_check CHECK forbids
 *  on non-MC rows). Returns the inserted question id. */
async function insertQuestion(
  admin: SupabaseClient,
  row: Record<string, unknown>,
): Promise<string> {
  const { data, error } = await admin.from('questions').insert(row).select('id').single()
  if (error) throw new Error(`insertQuestion: ${error.message}`)
  const id = (data as unknown as { id: string }).id
  if (typeof id !== 'string' || id.length === 0) {
    throw new Error('insertQuestion: no id returned')
  }
  return id
}

describe('RPC: get_quiz_questions — non-MC delivery + answer-key stripping (Vector EK)', () => {
  const admin = getAdminClient()
  let orgId: string
  let adminUserId: string
  let bankId: string
  let studentClient: SupabaseClient
  let refs: Awaited<ReturnType<typeof seedReferenceData>>
  const userIds: string[] = []
  const suffix = Date.now()

  let shortAnswerId: string
  let dialogFillId: string
  let mcId: string

  const SA_CANONICAL = 'mayday mayday mayday'
  const SA_SYNONYM = 'pan pan'
  const BLANK_0_CANONICAL = 'cleared'
  const BLANK_0_SYNONYM = 'clear'
  const BLANK_1_CANONICAL = 'runway two seven'

  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `Test Org GetQQ ${suffix}`,
      slug: `test-getqq-${suffix}`,
    })

    adminUserId = await createTestUser({
      admin,
      orgId,
      email: `admin-getqq-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'admin',
    })
    userIds.push(adminUserId)

    const studentId = await createTestUser({
      admin,
      orgId,
      email: `student-getqq-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(studentId)

    studentClient = await getAuthenticatedClient({
      email: `student-getqq-${suffix}@test.local`,
      password: 'test-pass-123',
    })

    refs = await seedReferenceData({
      admin,
      subjectCode: `GQ${suffix}`,
      subjectName: `GetQQ Subject ${suffix}`,
      topicCode: `GQ${suffix}-01`,
      topicName: `GetQQ Topic ${suffix}`,
    })

    const { data: bank, error: bankErr } = await admin
      .from('question_banks')
      .insert({ organization_id: orgId, name: `GetQQ Bank ${suffix}`, created_by: adminUserId })
      .select('id')
      .single()
    if (bankErr) throw new Error(`seed bank: ${bankErr.message}`)
    bankId = (bank as unknown as { id: string }).id

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

    shortAnswerId = await insertQuestion(admin, {
      ...base,
      question_type: 'short_answer',
      question_text: 'What is the distress call?',
      canonical_answer: SA_CANONICAL,
      accepted_synonyms: [SA_SYNONYM],
      explanation_text: 'Distress call explanation',
    })

    dialogFillId = await insertQuestion(admin, {
      ...base,
      question_type: 'dialog_fill',
      question_text: 'Fill the ATC dialog',
      dialog_template: '[atc] You are {{0|cleared; clear}} to land {{1|runway two seven}}.',
      blanks_config: [
        { index: 0, canonical: BLANK_0_CANONICAL, synonyms: [BLANK_0_SYNONYM] },
        { index: 1, canonical: BLANK_1_CANONICAL, synonyms: [] },
      ],
      explanation_text: 'Dialog explanation',
    })

    mcId = await insertQuestion(admin, {
      ...base,
      question_type: 'multiple_choice',
      question_text: 'Pick the right one',
      options: [
        { id: 'a', text: 'Option A' },
        { id: 'b', text: 'Option B' },
        { id: 'c', text: 'Option C' },
        { id: 'd', text: 'Option D' },
      ],
      correct_option_id: 'b',
      explanation_text: 'MC explanation',
    })
  })

  afterAll(async () => {
    await cleanupTestData({ admin, orgId, userIds })
    await cleanupReferenceData({ admin, refs: [refs] })
  })

  /** Call get_quiz_questions as the student and return the row for one id. */
  async function fetchRow(ids: string[], targetId: string): Promise<QuizQuestionRow> {
    const { data, error } = await studentClient.rpc('get_quiz_questions', {
      p_question_ids: ids,
    })
    expect(error).toBeNull()
    if (!Array.isArray(data)) throw new Error('get_quiz_questions did not return an array')
    const row = (data as QuizQuestionRow[]).find((r) => r.id === targetId)
    if (!row) throw new Error(`row for ${targetId} not in response`)
    return row
  }

  it('delivers a short_answer row without canonical_answer or accepted_synonyms, options null', async () => {
    // Non-vacuity: prove the row exists via service role before probing as student.
    const { data: exists, error: existsErr } = await admin
      .from('questions')
      .select('id, canonical_answer')
      .eq('id', shortAnswerId)
      .single<{ id: string; canonical_answer: string }>()
    expect(existsErr).toBeNull()
    expect(exists?.canonical_answer).toBe(SA_CANONICAL)

    const row = await fetchRow([shortAnswerId], shortAnswerId)
    expect(row.question_type).toBe('short_answer')
    expect(row.options).toBeNull()
    expect(row.dialog_template).toBeNull()
    expect(row.blanks_safe).toBeNull()

    // The answer-key strings must not appear anywhere in the serialized row.
    const serialized = JSON.stringify(row)
    expect(serialized).not.toContain(SA_CANONICAL)
    expect(serialized).not.toContain(SA_SYNONYM)
    // No answer-key keys present on the row object at all.
    expect('canonical_answer' in row).toBe(false)
    expect('accepted_synonyms' in row).toBe(false)
  })

  it('delivers a dialog_fill row with blanks_safe = index-only and template stripped of canonicals', async () => {
    const { data: exists, error: existsErr } = await admin
      .from('questions')
      .select('id, dialog_template')
      .eq('id', dialogFillId)
      .single<{ id: string; dialog_template: string }>()
    expect(existsErr).toBeNull()
    expect(exists?.dialog_template).toContain(BLANK_0_CANONICAL)

    const row = await fetchRow([dialogFillId], dialogFillId)
    expect(row.question_type).toBe('dialog_fill')
    expect(row.options).toBeNull()

    // blanks_safe must be [{index}] only — no canonical or synonym keys.
    if (!Array.isArray(row.blanks_safe)) {
      throw new Error('blanks_safe is not an array')
    }
    const blanks = row.blanks_safe as Array<Record<string, unknown>>
    expect(blanks).toHaveLength(2)
    for (const b of blanks) {
      expect(Object.keys(b)).toEqual(['index'])
      expect('canonical' in b).toBe(false)
      expect('synonyms' in b).toBe(false)
    }
    expect(blanks.map((b) => b.index)).toEqual([0, 1])

    // dialog_template: {{n|...}} tokens rewritten to plain {{n}} markers.
    expect(typeof row.dialog_template).toBe('string')
    const template = row.dialog_template as string
    expect(template).toMatch(/\{\{\d+\}\}/) // has at least one plain {{n}} marker
    expect(template).not.toMatch(/\{\{\d+\|/) // no {{n|canonical...}} tokens survive
    expect(template).not.toContain(BLANK_0_CANONICAL)
    expect(template).not.toContain(BLANK_0_SYNONYM)
    expect(template).not.toContain(BLANK_1_CANONICAL)

    const serialized = JSON.stringify(row)
    expect(serialized).not.toContain(BLANK_0_CANONICAL)
    expect(serialized).not.toContain(BLANK_1_CANONICAL)
  })

  it('delivers a multiple_choice row with options [{id,text}] and no correct key, blanks_safe/template null', async () => {
    const row = await fetchRow([mcId], mcId)
    expect(row.question_type).toBe('multiple_choice')
    expect(row.dialog_template).toBeNull()
    expect(row.blanks_safe).toBeNull()

    if (!Array.isArray(row.options)) throw new Error('MC options is not an array')
    const options = row.options as Array<Record<string, unknown>>
    expect(options).toHaveLength(4)
    for (const opt of options) {
      expect(Object.keys(opt).sort()).toEqual(['id', 'text'])
      expect('correct' in opt).toBe(false)
      expect('correct_option_id' in opt).toBe(false)
    }
    const serialized = JSON.stringify(row)
    expect(serialized).not.toContain('"correct"')
    expect(serialized).not.toContain('correct_option_id')
  })

  it('rejects a soft-deleted caller with user_not_found_or_inactive (active-user gate)', async () => {
    // Create a throwaway student, obtain a live JWT, soft-delete it, then call.
    const deletedStudentId = await createTestUser({
      admin,
      orgId,
      email: `studentDel-getqq-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(deletedStudentId)
    const deletedClient = await getAuthenticatedClient({
      email: `studentDel-getqq-${suffix}@test.local`,
      password: 'test-pass-123',
    })

    // Non-vacuity: the active client can read the question before the soft-delete,
    // proving the rejection below is the gate firing, not an empty result.
    const beforeRow = await (async () => {
      const { data, error } = await deletedClient.rpc('get_quiz_questions', {
        p_question_ids: [mcId],
      })
      expect(error).toBeNull()
      if (!Array.isArray(data)) throw new Error('expected array before soft-delete')
      return (data as QuizQuestionRow[]).find((r) => r.id === mcId)
    })()
    expect(beforeRow?.id).toBe(mcId)

    const { error: delErr } = await admin
      .from('users')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', deletedStudentId)
    if (delErr) throw new Error(`soft-delete student: ${delErr.message}`)

    const { error } = await deletedClient.rpc('get_quiz_questions', {
      p_question_ids: [mcId],
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('user_not_found_or_inactive')
  })
})
