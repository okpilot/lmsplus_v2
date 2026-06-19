import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupReferenceData, cleanupTestData } from './cleanup'
import { seedReferenceData } from './seed'
import { createTestOrg, createTestUser, getAdminClient } from './setup'

// #823 (P0): trg_sanitize_question_options strips any `correct` key from
// questions.options on every INSERT/UPDATE OF options, so the MC answer key
// can never re-enter the readable JSONB (it lives in the REVOKE-gated
// correct_option_id column). These tests write `correct` INTO options via the
// service-role client (which bypasses RLS and the column REVOKE) and prove the
// stored array comes back with only {id, text}. Each assertion is non-vacuous:
// the pre-write input HAD a `correct` key.

type StoredOption = { id: string; text: string } & Record<string, unknown>

describe('Trigger: trg_sanitize_question_options strips the answer key from options', () => {
  const admin = getAdminClient()
  let orgId: string
  let adminUserId: string
  let bankId: string
  let refs: Awaited<ReturnType<typeof seedReferenceData>>
  const userIds: string[] = []
  const suffix = Date.now()

  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `Test Org Sanitize ${suffix}`,
      slug: `test-sanitize-${suffix}`,
    })

    adminUserId = await createTestUser({
      admin,
      orgId,
      email: `admin-sanitize-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'admin',
    })
    userIds.push(adminUserId)

    refs = await seedReferenceData({
      admin,
      subjectCode: `SAN${suffix}`,
      subjectName: `Sanitize Subject ${suffix}`,
      topicCode: `SAN${suffix}-01`,
      topicName: `Sanitize Topic ${suffix}`,
    })

    const { data: bank, error: bErr } = await admin
      .from('question_banks')
      .insert({
        organization_id: orgId,
        name: `Sanitize Bank ${suffix}`,
        created_by: adminUserId,
      })
      .select('id')
      .single<{ id: string }>()
    if (bErr) throw new Error(`bank insert: ${bErr.message}`)
    bankId = bank!.id
  })

  afterAll(async () => {
    await cleanupTestData({ admin, orgId, userIds })
    await cleanupReferenceData({ admin, refs: [refs] })
  })

  function baseQuestion(extra: Record<string, unknown>) {
    return {
      organization_id: orgId,
      bank_id: bankId,
      subject_id: refs.subjectId,
      topic_id: refs.topicId,
      explanation_text: 'Explanation',
      difficulty: 'medium',
      status: 'active',
      created_by: adminUserId,
      ...extra,
    }
  }

  it('strips the correct key from options on INSERT, storing only id and text', async () => {
    // Pre-write input carries `correct` on every option (non-vacuity).
    const input = [
      { id: 'a', text: 'Option A', correct: false },
      { id: 'b', text: 'Option B', correct: true },
      { id: 'c', text: 'Option C', correct: false },
      { id: 'd', text: 'Option D', correct: false },
    ]
    expect(input.some((o) => 'correct' in o)).toBe(true)

    const { data, error } = await admin
      .from('questions')
      .insert(
        baseQuestion({
          question_text: `Sanitize INSERT ${suffix}?`,
          question_type: 'multiple_choice',
          correct_option_id: 'b',
          options: input,
        }),
      )
      .select('options')
      .single<{ options: StoredOption[] }>()
    expect(error).toBeNull()
    expect(data).not.toBeNull()

    const stored = data!.options
    expect(Array.isArray(stored)).toBe(true)
    expect(stored).toHaveLength(4)
    for (const opt of stored) {
      expect(Object.keys(opt).sort()).toEqual(['id', 'text'])
      expect('correct' in opt).toBe(false)
    }
    // Order and content preserved, key removed.
    expect(stored.map((o) => o.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(stored[1]?.text).toBe('Option B')
  })

  it('strips the correct key when options are re-injected via UPDATE OF options', async () => {
    const { data: inserted, error: insErr } = await admin
      .from('questions')
      .insert(
        baseQuestion({
          question_text: `Sanitize UPDATE ${suffix}?`,
          question_type: 'multiple_choice',
          correct_option_id: 'a',
          options: [
            { id: 'a', text: 'Clean A' },
            { id: 'b', text: 'Clean B' },
          ],
        }),
      )
      .select('id, options')
      .single<{ id: string; options: StoredOption[] }>()
    expect(insErr).toBeNull()
    // Sanity: clean insert stays clean.
    for (const opt of inserted!.options) {
      expect('correct' in opt).toBe(false)
    }

    // Attempt to re-inject the answer key through a raw PostgREST UPDATE.
    const reinjected = [
      { id: 'a', text: 'Clean A', correct: true },
      { id: 'b', text: 'Clean B', correct: false },
    ]
    expect(reinjected.some((o) => 'correct' in o)).toBe(true)

    const { data: updated, error: updErr } = await admin
      .from('questions')
      .update({ options: reinjected })
      .eq('id', inserted!.id)
      .select('options, correct_option_id')
      .single<{ options: StoredOption[]; correct_option_id: string | null }>()
    expect(updErr).toBeNull()

    const stored = updated!.options
    expect(stored).toHaveLength(2)
    for (const opt of stored) {
      expect(Object.keys(opt).sort()).toEqual(['id', 'text'])
      expect('correct' in opt).toBe(false)
    }
    // The strip must not clear the answer key — scoring reads correct_option_id.
    expect(updated?.correct_option_id).toBe('a')
  })

  it('leaves already-clean options unchanged on INSERT', async () => {
    const clean = [
      { id: 'a', text: 'Only id and text A' },
      { id: 'b', text: 'Only id and text B' },
    ]
    const { data, error } = await admin
      .from('questions')
      .insert(
        baseQuestion({
          question_text: `Sanitize clean ${suffix}?`,
          question_type: 'multiple_choice',
          correct_option_id: 'b',
          options: clean,
        }),
      )
      .select('options')
      .single<{ options: StoredOption[] }>()
    expect(error).toBeNull()
    expect(data!.options).toEqual(clean)
  })

  it('preserves an empty options array on a non-MC question insert', async () => {
    // short_answer carries no options; the trigger must leave [] untouched and
    // must not require correct_option_id (NULL for non-MC).
    const { data, error } = await admin
      .from('questions')
      .insert(
        baseQuestion({
          question_text: `Sanitize empty ${suffix}?`,
          question_type: 'short_answer',
          canonical_answer: 'wilco',
          options: [],
        }),
      )
      .select('options, correct_option_id')
      .single<{ options: StoredOption[]; correct_option_id: string | null }>()
    expect(error).toBeNull()
    expect(data!.options).toEqual([])
    expect(data!.correct_option_id).toBeNull()
  })
})
