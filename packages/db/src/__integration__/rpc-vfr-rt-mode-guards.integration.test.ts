/**
 * VFR RT exam mode guards: get_question_authoring_fields returns the answer-key
 * columns to an in-org admin only.
 *
 * get_question_authoring_fields covers:
 *   - admin gets the four answer-key columns
 *   - student caller is rejected
 *   - cross-org admin gets zero rows
 *
 * Shared beforeAll seeds: org, admin, student, question bank.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupTestData } from './cleanup'
import { fixtureSuffix } from './fixture-suffix'
import { requireRpcRows } from './guards'
import { createTestOrg, createTestUser, getAdminClient, getAuthenticatedClient } from './setup'

const admin = getAdminClient()
const suffix = fixtureSuffix()

// ─── RT seed helpers (duplicated from rpc-vfr-rt-start — each file must be
//     self-contained; tests run in separate Vitest workers) ──────────────────

async function getRtRefs(): Promise<{
  rtSubjectId: string
  p1TopicId: string
  p2TopicId: string
  p3TopicId: string
}> {
  const { data: sub, error: subErr } = await admin
    .from('easa_subjects')
    .select('id')
    .eq('code', 'RT')
    .single()
  if (subErr || !sub) throw new Error('getRtRefs: RT subject not found')
  const { data: topics, error: topErr } = await admin
    .from('easa_topics')
    .select('id, code')
    .eq('subject_id', sub.id)
    .in('code', ['P1_ACRONYMS', 'P2_DIALOG', 'P3_MC'])
  if (topErr) throw new Error(`getRtRefs: ${topErr.message}`)
  const byCode = Object.fromEntries(
    (topics ?? []).map((t: { id: string; code: string }) => [t.code, t.id]),
  )
  if (!byCode.P1_ACRONYMS || !byCode.P2_DIALOG || !byCode.P3_MC)
    throw new Error('getRtRefs: RT topics missing')
  return {
    rtSubjectId: sub.id,
    p1TopicId: byCode.P1_ACRONYMS,
    p2TopicId: byCode.P2_DIALOG,
    p3TopicId: byCode.P3_MC,
  }
}

async function ensureBank(orgId: string, adminId: string): Promise<string> {
  const { data: existing, error: lookupErr } = await admin
    .from('question_banks')
    .select('id')
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .maybeSingle()
  if (lookupErr) throw new Error(`ensureBank: ${lookupErr.message}`)
  if (existing) return existing.id as string
  const { data, error } = await admin
    .from('question_banks')
    .insert({ organization_id: orgId, name: `Submit Test Bank ${suffix}`, created_by: adminId })
    .select('id')
    .single()
  if (error) throw new Error(`ensureBank insert: ${error.message}`)
  return data.id as string
}

// ─── shared fixture state ─────────────────────────────────────────────────────

let orgId: string
let adminUserId: string
let studentClient: SupabaseClient
let adminClient: SupabaseClient
let refs: Awaited<ReturnType<typeof getRtRefs>>
let bankId: string
const userIds: string[] = []

beforeAll(async () => {
  refs = await getRtRefs()

  orgId = await createTestOrg({
    admin,
    name: `RT Submit Org ${suffix}`,
    slug: `rt-submit-${suffix}`,
  })
  adminUserId = await createTestUser({
    admin,
    orgId,
    email: `admin-rtsub-${suffix}@test.local`,
    password: 'test-pass-123',
    role: 'admin',
  })
  userIds.push(adminUserId)
  const studentId = await createTestUser({
    admin,
    orgId,
    email: `student-rtsub-${suffix}@test.local`,
    password: 'test-pass-123',
    role: 'student',
  })
  userIds.push(studentId)
  studentClient = await getAuthenticatedClient({
    email: `student-rtsub-${suffix}@test.local`,
    password: 'test-pass-123',
  })
  adminClient = await getAuthenticatedClient({
    email: `admin-rtsub-${suffix}@test.local`,
    password: 'test-pass-123',
  })

  bankId = await ensureBank(orgId, adminUserId)
})

afterAll(async () => {
  await cleanupTestData({ admin, orgId, userIds })
})

// ─── get_question_authoring_fields ────────────────────────────────────────────

describe('RPC: get_question_authoring_fields', () => {
  let saId: string

  beforeAll(async () => {
    const { data, error } = await admin
      .from('questions')
      .insert({
        organization_id: orgId,
        bank_id: bankId,
        subject_id: refs.rtSubjectId,
        topic_id: refs.p1TopicId,
        question_text: `Auth fields test SA ${suffix}?`,
        explanation_text: 'Auth fields test explanation',
        question_type: 'short_answer',
        canonical_answer: 'visible_to_admin',
        accepted_synonyms: ['visible_syn'],
        options: [],
        blanks_config: [],
        difficulty: 'medium',
        status: 'active',
        created_by: adminUserId,
      })
      .select('id')
      .single()
    if (error) throw new Error(`authoring field SA seed: ${error.message}`)
    saId = data.id as string
  })

  it('admin in own org receives the four answer-key columns', async () => {
    const { data, error } = await adminClient.rpc('get_question_authoring_fields', {
      p_question_id: saId,
    })
    expect(error).toBeNull()
    const rows = requireRpcRows<{
      canonical_answer: string
      accepted_synonyms: string[]
      dialog_template: string | null
      blanks_config: unknown[]
    }>(data, 'get_question_authoring_fields')
    expect(rows).toHaveLength(1)
    // toHaveLength(1) above guarantees rows[0] exists
    expect(rows[0]!.canonical_answer).toBe('visible_to_admin')
    expect(rows[0]!.accepted_synonyms).toContain('visible_syn')
  })

  it('student caller is rejected with forbidden', async () => {
    const { data, error } = await studentClient.rpc('get_question_authoring_fields', {
      p_question_id: saId,
    })
    expect(data).toBeNull()
    expect(error).not.toBeNull()
    expect(error?.message).toContain('forbidden')
  })

  it('cross-org admin receives zero rows (not the answer key)', async () => {
    // Create a second org with an admin user
    const orgId2 = await createTestOrg({
      admin,
      name: `RT Cross Org ${suffix}`,
      slug: `rt-cross-${suffix}`,
    })
    const adminId2 = await createTestUser({
      admin,
      orgId: orgId2,
      email: `admin-rtcross-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'admin',
    })
    const crossAdminClient = await getAuthenticatedClient({
      email: `admin-rtcross-${suffix}@test.local`,
      password: 'test-pass-123',
    })

    try {
      // The question saId belongs to orgId, not orgId2; cross-org admin sees 0 rows
      const { data, error } = await crossAdminClient.rpc('get_question_authoring_fields', {
        p_question_id: saId,
      })
      expect(error).toBeNull()
      const rows = requireRpcRows<unknown>(data, 'get_question_authoring_fields')
      // Non-vacuity: the question row exists (confirmed above); the empty result
      // means the RPC's org filter correctly rejected the cross-org admin
      expect(rows).toHaveLength(0)
    } finally {
      // Cleanup must run even when an assertion above fails — otherwise the
      // second org leaks into later test runs.
      await cleanupTestData({ admin, orgId: orgId2, userIds: [adminId2] })
    }
  })
})
