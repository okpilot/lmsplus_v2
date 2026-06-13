import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupReferenceData, cleanupTestData } from './cleanup'
import { seedReferenceData } from './seed'
import { createTestOrg, createTestUser, getAdminClient } from './setup'

// #823 (P0): questions_mc_correct_option_id_check is a biconditional CHECK —
//   (question_type = 'multiple_choice')
//     = (correct_option_id IS NOT NULL AND correct_option_id IN ('a','b','c','d'))
// so an MC row must carry exactly a valid key and a non-MC row must carry none.
// These tests pin both directions of the biconditional plus the valid-letter
// domain. The negative cases are paired with positive controls (the same shape
// but satisfying the CHECK succeeds), so a rejection proves the CHECK fired
// rather than an unrelated constraint.

describe('Constraint: questions_mc_correct_option_id_check (biconditional MC answer key)', () => {
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
      name: `Test Org MCKey ${suffix}`,
      slug: `test-mckey-${suffix}`,
    })

    adminUserId = await createTestUser({
      admin,
      orgId,
      email: `admin-mckey-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'admin',
    })
    userIds.push(adminUserId)

    refs = await seedReferenceData({
      admin,
      subjectCode: `MCK${suffix}`,
      subjectName: `MCKey Subject ${suffix}`,
      topicCode: `MCK${suffix}-01`,
      topicName: `MCKey Topic ${suffix}`,
    })

    const { data: bank, error: bErr } = await admin
      .from('question_banks')
      .insert({
        organization_id: orgId,
        name: `MCKey Bank ${suffix}`,
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

  const mcOptions = [
    { id: 'a', text: 'A' },
    { id: 'b', text: 'B' },
    { id: 'c', text: 'C' },
    { id: 'd', text: 'D' },
  ]

  it('rejects a multiple_choice row with a NULL correct_option_id', async () => {
    const { error } = await admin.from('questions').insert(
      baseQuestion({
        question_text: `MC null key ${suffix}?`,
        question_type: 'multiple_choice',
        correct_option_id: null,
        options: mcOptions,
      }),
    )
    expect(error).not.toBeNull()
    // 23514 = check_violation (questions_mc_correct_option_id_check)
    expect(error?.code).toBe('23514')
    // 23514 matches any CHECK — pin the specific constraint that fired.
    expect(error?.message).toContain('questions_mc_correct_option_id_check')
  })

  it('rejects a multiple_choice row with an out-of-domain correct_option_id', async () => {
    const { error } = await admin.from('questions').insert(
      baseQuestion({
        question_text: `MC bad letter ${suffix}?`,
        question_type: 'multiple_choice',
        // 'e' is outside the ('a','b','c','d') domain.
        correct_option_id: 'e',
        options: mcOptions,
      }),
    )
    expect(error).not.toBeNull()
    expect(error?.code).toBe('23514')
    expect(error?.message).toContain('questions_mc_correct_option_id_check')
  })

  it('rejects a non-MC row that carries a correct_option_id', async () => {
    const { error } = await admin.from('questions').insert(
      baseQuestion({
        question_text: `SA with key ${suffix}?`,
        question_type: 'short_answer',
        canonical_answer: 'wilco',
        // A non-MC row must have a NULL key — this violates the RHS of the biconditional.
        correct_option_id: 'a',
        options: [],
      }),
    )
    expect(error).not.toBeNull()
    expect(error?.code).toBe('23514')
    expect(error?.message).toContain('questions_mc_correct_option_id_check')
  })

  it('accepts a valid multiple_choice row with a key in the a-d domain', async () => {
    // Positive control for the rejection tests above.
    const { data, error } = await admin
      .from('questions')
      .insert(
        baseQuestion({
          question_text: `MC valid key ${suffix}?`,
          question_type: 'multiple_choice',
          correct_option_id: 'c',
          options: mcOptions,
        }),
      )
      .select('id, correct_option_id')
      .single<{ id: string; correct_option_id: string }>()
    expect(error).toBeNull()
    expect(data).not.toBeNull()
    expect(data?.correct_option_id).toBe('c')
  })

  it('accepts a non-MC row with a NULL correct_option_id', async () => {
    // Positive control: the only valid non-MC shape.
    const { data, error } = await admin
      .from('questions')
      .insert(
        baseQuestion({
          question_text: `SA null key ${suffix}?`,
          question_type: 'short_answer',
          canonical_answer: 'roger',
          options: [],
        }),
      )
      .select('id, correct_option_id')
      .single<{ id: string; correct_option_id: string | null }>()
    expect(error).toBeNull()
    expect(data).not.toBeNull()
    expect(data?.correct_option_id).toBeNull()
  })
})
