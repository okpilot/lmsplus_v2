import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupReferenceData, cleanupTestData } from './cleanup'
import { seedReferenceData } from './seed'
import { createTestOrg, createTestUser, getAdminClient, getAuthenticatedClient } from './setup'

// #823 (P0): the MC answer key lives in questions.correct_option_id, which is
// NOT granted to the `authenticated` role (mig 111 REVOKE). Admins read it via
// the SECURITY DEFINER get_question_authoring_fields RPC (mig 116). This suite
// pins, at the DB layer:
//   * the RPC returns correct_option_id for an MC question to an admin caller,
//   * NULL for non-MC questions,
//   * 'forbidden' for a student caller,
//   * zero rows cross-org,
//   * a direct `authenticated` SELECT of correct_option_id raises 42501.

type AuthoringRow = {
  canonical_answer: string | null
  accepted_synonyms: string[] | null
  dialog_template: string | null
  blanks_config: unknown
  correct_option_id: string | null
}

describe('RPC: get_question_authoring_fields exposes correct_option_id to admins only', () => {
  const admin = getAdminClient()
  let orgId: string
  let otherOrgId: string
  let adminUserId: string
  let studentId: string
  let otherAdminUserId: string
  let bankId: string
  let mcQuestionId: string
  let saQuestionId: string
  let adminClient: SupabaseClient
  let studentClient: SupabaseClient
  let otherAdminClient: SupabaseClient
  let refs: Awaited<ReturnType<typeof seedReferenceData>>
  let otherRefs: Awaited<ReturnType<typeof seedReferenceData>>
  const userIds: string[] = []
  const otherUserIds: string[] = []
  const suffix = Date.now()

  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `Test Org Authoring ${suffix}`,
      slug: `test-authoring-${suffix}`,
    })
    otherOrgId = await createTestOrg({
      admin,
      name: `Other Org Authoring ${suffix}`,
      slug: `other-authoring-${suffix}`,
    })

    adminUserId = await createTestUser({
      admin,
      orgId,
      email: `admin-authoring-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'admin',
    })
    userIds.push(adminUserId)

    studentId = await createTestUser({
      admin,
      orgId,
      email: `student-authoring-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(studentId)

    otherAdminUserId = await createTestUser({
      admin,
      orgId: otherOrgId,
      email: `other-admin-authoring-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'admin',
    })
    otherUserIds.push(otherAdminUserId)

    adminClient = await getAuthenticatedClient({
      email: `admin-authoring-${suffix}@test.local`,
      password: 'test-pass-123',
    })
    studentClient = await getAuthenticatedClient({
      email: `student-authoring-${suffix}@test.local`,
      password: 'test-pass-123',
    })
    otherAdminClient = await getAuthenticatedClient({
      email: `other-admin-authoring-${suffix}@test.local`,
      password: 'test-pass-123',
    })

    refs = await seedReferenceData({
      admin,
      subjectCode: `AUT${suffix}`,
      subjectName: `Authoring Subject ${suffix}`,
      topicCode: `AUT${suffix}-01`,
      topicName: `Authoring Topic ${suffix}`,
    })
    otherRefs = await seedReferenceData({
      admin,
      subjectCode: `AUO${suffix}`,
      subjectName: `Authoring Other Subject ${suffix}`,
      topicCode: `AUO${suffix}-01`,
      topicName: `Authoring Other Topic ${suffix}`,
    })

    const { data: bank, error: bErr } = await admin
      .from('question_banks')
      .insert({
        organization_id: orgId,
        name: `Authoring Bank ${suffix}`,
        created_by: adminUserId,
      })
      .select('id')
      .single<{ id: string }>()
    if (bErr) throw new Error(`bank insert: ${bErr.message}`)
    bankId = bank!.id

    const { data: mc, error: mcErr } = await admin
      .from('questions')
      .insert({
        organization_id: orgId,
        bank_id: bankId,
        subject_id: refs.subjectId,
        topic_id: refs.topicId,
        question_text: `Authoring MC ${suffix}?`,
        explanation_text: 'Explanation',
        question_type: 'multiple_choice',
        correct_option_id: 'c',
        options: [
          { id: 'a', text: 'A' },
          { id: 'b', text: 'B' },
          { id: 'c', text: 'C' },
          { id: 'd', text: 'D' },
        ],
        difficulty: 'medium',
        status: 'active',
        created_by: adminUserId,
      })
      .select('id')
      .single<{ id: string }>()
    if (mcErr) throw new Error(`mc insert: ${mcErr.message}`)
    mcQuestionId = mc!.id

    const { data: sa, error: saErr } = await admin
      .from('questions')
      .insert({
        organization_id: orgId,
        bank_id: bankId,
        subject_id: refs.subjectId,
        topic_id: refs.topicId,
        question_text: `Authoring SA ${suffix}?`,
        explanation_text: 'Explanation',
        question_type: 'short_answer',
        canonical_answer: 'wilco',
        options: [],
        difficulty: 'medium',
        status: 'active',
        created_by: adminUserId,
      })
      .select('id')
      .single<{ id: string }>()
    if (saErr) throw new Error(`sa insert: ${saErr.message}`)
    saQuestionId = sa!.id
  })

  afterAll(async () => {
    await cleanupTestData({ admin, orgId, userIds })
    await cleanupTestData({ admin, orgId: otherOrgId, userIds: otherUserIds })
    await cleanupReferenceData({ admin, refs: [refs, otherRefs] })
  })

  it('returns correct_option_id for an MC question to an admin caller', async () => {
    const { data, error } = await adminClient.rpc('get_question_authoring_fields', {
      p_question_id: mcQuestionId,
    })
    expect(error).toBeNull()
    const rows = data as unknown as AuthoringRow[]
    expect(Array.isArray(rows)).toBe(true)
    // Non-vacuity: the row exists and carries the seeded key.
    expect(rows).toHaveLength(1)
    expect(rows[0]?.correct_option_id).toBe('c')
  })

  it('returns a NULL correct_option_id for a non-MC question', async () => {
    const { data, error } = await adminClient.rpc('get_question_authoring_fields', {
      p_question_id: saQuestionId,
    })
    expect(error).toBeNull()
    const rows = data as unknown as AuthoringRow[]
    expect(rows).toHaveLength(1)
    expect(rows[0]?.correct_option_id).toBeNull()
    expect(rows[0]?.canonical_answer).toBe('wilco')
  })

  it('raises forbidden for a student caller', async () => {
    const { error } = await studentClient.rpc('get_question_authoring_fields', {
      p_question_id: mcQuestionId,
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('forbidden')
  })

  it('returns zero rows for a cross-org admin caller', async () => {
    // The other-org admin is a legitimate admin (is_admin() passes) but the
    // question belongs to a different org, so the org-scoped lookup yields none.
    // Non-vacuity (code-style §7): prove the question exists with a populated key
    // via service-role first, so "0 rows" proves org-scoped rejection, not an
    // empty table.
    const { data: control, error: ctrlErr } = await admin
      .from('questions')
      .select('id, correct_option_id')
      .eq('id', mcQuestionId)
      .single<{ id: string; correct_option_id: string | null }>()
    expect(ctrlErr).toBeNull()
    expect(control?.id).toBe(mcQuestionId)
    expect(control?.correct_option_id).toBe('c')

    const { data, error } = await otherAdminClient.rpc('get_question_authoring_fields', {
      p_question_id: mcQuestionId,
    })
    expect(error).toBeNull()
    const rows = data as unknown as AuthoringRow[]
    expect(rows).toHaveLength(0)
  })

  it('blocks a direct authenticated SELECT of correct_option_id with 42501', async () => {
    // The REVOKE (mig 111) is the actual security boundary — without it, any
    // same-org student could dump the answer key. Assert the column is not
    // SELECTable by the `authenticated` role even for the admin client.
    const { data: control, error: controlErr } = await adminClient
      .from('questions')
      .select('id')
      .eq('id', mcQuestionId)
      .single<{ id: string }>()
    // Non-vacuity: the admin CAN read a granted column on this exact row.
    expect(controlErr).toBeNull()
    expect(control?.id).toBe(mcQuestionId)

    const { error } = await adminClient
      .from('questions')
      .select('correct_option_id')
      .eq('id', mcQuestionId)
    expect(error).not.toBeNull()
    // 42501 = insufficient_privilege (column-level SELECT REVOKE).
    expect(error?.code).toBe('42501')
  })
})
