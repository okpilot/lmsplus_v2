/**
 * VFR RT exam mode guards: submit_quiz_answer and complete_quiz_session reject a
 * vfr_rt_exam session with unsupported_session_mode (#838); get_question_authoring_fields
 * returns the answer-key columns to an in-org admin only.
 *
 * get_question_authoring_fields covers:
 *   - admin gets the four answer-key columns
 *   - student caller is rejected
 *   - cross-org admin gets zero rows
 *
 * Shared beforeAll seeds: RT subject (mig 097), 8 SA + 9 DF + 8 MC questions,
 * exam_configs row. Each it() that modifies state starts its own session so
 * tests stay isolated.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupTestData } from './cleanup'
import { fixtureSuffix } from './fixture-suffix'
import { requireRpcResult, requireRpcRows } from './guards'
import { createTestOrg, createTestUser, getAdminClient, getAuthenticatedClient } from './setup'
import { getP3Subtopics, P3_SUBTOPIC_CODES } from './vfr-rt-part3-helpers'
import { forceEndSession } from './vfr-rt-part3-org'

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

interface SaQuestion {
  id: string
  canonical: string
}
interface DfQuestion {
  id: string
  blanksConfig: Array<{ index: number; canonical: string; synonyms: string[] }>
}
interface McQuestion {
  id: string
  correctOption: string
}

async function insertSaQuestion(
  orgId: string,
  bankId: string,
  adminId: string,
  rtSubjectId: string,
  p1TopicId: string,
  idx: number,
): Promise<SaQuestion> {
  const canonical = `answer_sa_${idx}`
  const { data, error } = await admin
    .from('questions')
    .insert({
      organization_id: orgId,
      bank_id: bankId,
      subject_id: rtSubjectId,
      topic_id: p1TopicId,
      question_text: `SA submit ${idx} ${suffix}?`,
      explanation_text: `SA submit explanation ${idx}`,
      question_type: 'short_answer',
      canonical_answer: canonical,
      accepted_synonyms: [`syn_${idx}`],
      options: [],
      blanks_config: [],
      difficulty: 'medium',
      status: 'active',
      created_by: adminId,
    })
    .select('id')
    .single()
  if (error) throw new Error(`insertSaQuestion: ${error.message}`)
  return { id: data.id as string, canonical }
}

async function insertDfQuestion(
  orgId: string,
  bankId: string,
  adminId: string,
  rtSubjectId: string,
  p2TopicId: string,
  idx: number,
): Promise<DfQuestion> {
  const blanksConfig = [
    { index: 0, canonical: `callsign_${idx}`, synonyms: [`cs_${idx}`] },
    { index: 1, canonical: `level_${idx}`, synonyms: [`lv_${idx}`] },
  ]
  const template = `[atc] {{0|callsign_${idx};cs_${idx}}} descend to {{1|level_${idx};lv_${idx}}}.`
  const { data, error } = await admin
    .from('questions')
    .insert({
      organization_id: orgId,
      bank_id: bankId,
      subject_id: rtSubjectId,
      topic_id: p2TopicId,
      question_text: `DF submit ${idx} ${suffix}?`,
      explanation_text: `DF submit explanation ${idx}`,
      question_type: 'dialog_fill',
      dialog_template: template,
      blanks_config: blanksConfig,
      options: [],
      difficulty: 'medium',
      status: 'active',
      created_by: adminId,
    })
    .select('id')
    .single()
  if (error) throw new Error(`insertDfQuestion: ${error.message}`)
  return { id: data.id as string, blanksConfig }
}

async function insertMcQuestion(
  orgId: string,
  bankId: string,
  adminId: string,
  rtSubjectId: string,
  p3TopicId: string,
  subtopicId: string,
  idx: number,
): Promise<McQuestion> {
  const { data, error } = await admin
    .from('questions')
    .insert({
      organization_id: orgId,
      bank_id: bankId,
      subject_id: rtSubjectId,
      topic_id: p3TopicId,
      subtopic_id: subtopicId,
      question_text: `MC submit ${idx} ${suffix}?`,
      explanation_text: `MC submit explanation ${idx}`,
      question_type: 'multiple_choice',
      options: [
        { id: 'a', text: `A ${idx}` },
        { id: 'b', text: `B ${idx}` },
        { id: 'c', text: `C ${idx}` },
        { id: 'd', text: `D ${idx}` },
      ],
      // MC answer key in its own REVOKE-gated column (#823, mig 111).
      correct_option_id: 'b',
      difficulty: 'medium',
      status: 'active',
      created_by: adminId,
    })
    .select('id')
    .single()
  if (error) throw new Error(`insertMcQuestion: ${error.message}`)
  return { id: data.id as string, correctOption: 'b' }
}

// ─── shared fixture state ─────────────────────────────────────────────────────

let orgId: string
let adminUserId: string
let studentId: string
let studentClient: SupabaseClient
let adminClient: SupabaseClient
let rtSubjectId: string
const userIds: string[] = []

beforeAll(async () => {
  const refs = await getRtRefs()
  rtSubjectId = refs.rtSubjectId

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
  studentId = await createTestUser({
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

  const bankId = await ensureBank(orgId, adminUserId)

  await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      insertSaQuestion(orgId, bankId, adminUserId, rtSubjectId, refs.p1TopicId, 400 + i),
    ),
  )
  await Promise.all(
    Array.from({ length: 9 }, (_, i) =>
      insertDfQuestion(orgId, bankId, adminUserId, rtSubjectId, refs.p2TopicId, 400 + i),
    ),
  )
  // 2 MC in EACH seeded P3 subtopic (start samples 2 per subtopic).
  const p3Subtopics = await getP3Subtopics(refs.p3TopicId)
  await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      insertMcQuestion(
        orgId,
        bankId,
        adminUserId,
        rtSubjectId,
        refs.p3TopicId,
        p3Subtopics[P3_SUBTOPIC_CODES[Math.floor(i / 2)]!],
        400 + i,
      ),
    ),
  )

  const { error: ecErr } = await admin.from('exam_configs').insert({
    organization_id: orgId,
    subject_id: rtSubjectId,
    enabled: true,
    total_questions: 25,
    time_limit_seconds: 1800,
    pass_mark: 75,
  })
  if (ecErr) throw new Error(`exam_configs insert: ${ecErr.message}`)
})

afterAll(async () => {
  await cleanupTestData({ admin, orgId, userIds })
})

/** Start a fresh vfr_rt_exam session and return its id + the frozen question list. */
async function startSession(): Promise<{ sessionId: string; questionIds: string[] }> {
  const { data, error } = await studentClient.rpc('start_vfr_rt_exam_session', {
    p_subject_id: rtSubjectId,
  })
  if (error) throw new Error(`startSession: ${error.message}`)
  const r = requireRpcResult<{ session_id: string; question_ids: string[] }>(
    data,
    'start_vfr_rt_exam_session',
  )
  if (!r.session_id) throw new Error('startSession: no session_id in result')
  return { sessionId: r.session_id, questionIds: r.question_ids }
}

// ─── Legacy RPC mode whitelist (#838) ─────────────────────────────────────────
//
// Migs 095b/095c/104 add a fail-closed mode whitelist to the session RPCs: a
// vfr_rt_exam session answered/completed via the MC path would bypass per-part
// grading (mig 100). The happy paths live in rpc-submit-answer /
// rpc-complete-session — those are what make these rejections non-vacuous.

describe('RPC mode whitelist (#838) — vfr_rt_exam sessions are rejected by the MC-path RPCs', () => {
  it('submit_quiz_answer rejects a vfr_rt_exam session with unsupported_session_mode', async () => {
    const { sessionId, questionIds } = await startSession()

    const { error } = await studentClient.rpc('submit_quiz_answer', {
      p_session_id: sessionId,
      p_question_id: questionIds[0],
      p_selected_option: 'a',
      p_response_time_ms: 1000,
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('unsupported_session_mode')

    await forceEndSession(sessionId)
  })

  it('complete_quiz_session rejects a vfr_rt_exam session with unsupported_session_mode', async () => {
    const { sessionId } = await startSession()

    const { error } = await studentClient.rpc('complete_quiz_session', {
      p_session_id: sessionId,
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('unsupported_session_mode')

    await forceEndSession(sessionId)
  })
})

// ─── get_question_authoring_fields ────────────────────────────────────────────

describe('RPC: get_question_authoring_fields', () => {
  let saId: string

  beforeAll(async () => {
    // Seed one SA question in the org's bank (bank was already created in the
    // outer beforeAll for the submit tests)
    const { data: bankRow } = await admin
      .from('question_banks')
      .select('id')
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .maybeSingle()
    const bankId = bankRow?.id as string
    const refs = await getRtRefs()
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
