import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanupReferenceData, cleanupTestData } from './cleanup'
import { requireRpcResult, requireRpcRows } from './guards'
import { seedQuestions, seedReferenceData } from './seed'
import { createTestOrg, createTestUser, getAdminClient, getAuthenticatedClient } from './setup'
import {
  ensureBank,
  getRtRefs,
  insertDialogFillQuestion,
  insertMcQuestion,
  insertShortAnswerQuestion,
} from './vfr-rt-helpers'

// Cross-mode single-active-session guard (#1011): verifies that
// start_internal_exam_session (mig 20260629000400) and
// start_vfr_rt_exam_session (mig 20260629000500) honour the single-active-session
// invariant — blocking when another session is live and auto-clearing abandoned
// discovery rows before creating a new session. Runs against the real local
// Postgres (mocked clients can't see the partial unique index
// uq_one_active_session_per_student or the discovery-clear step).

type ActiveSessionRow = {
  id: string
  mode: string
  subject_id: string | null
  ended_at: string | null
  deleted_at: string | null
}

describe('Cross-mode single-active-session guard (internal_exam + vfr_rt_exam)', () => {
  const admin = getAdminClient()
  let orgId: string
  let adminUserId: string
  let studentId: string
  let studentClient: SupabaseClient
  let subjectId: string
  let topicId: string
  let refs: Awaited<ReturnType<typeof seedReferenceData>>
  let rtSubjectId: string
  const userIds: string[] = []
  const suffix = Date.now()
  // internal_exam_codes rows hard-deleted in afterAll before cleanupTestData
  // (FK into users/orgs/quiz_sessions; no ON DELETE CASCADE).
  const createdInternalExamCodeIds: string[] = []

  // Insert a valid internal_exam_codes row for the test student via service-role
  // (bypasses the no-INSERT RLS policy on that table).
  const seedCode = async (): Promise<{ id: string; code: string }> => {
    const code = `CM${suffix}${createdInternalExamCodeIds.length}`
    const { data, error } = await admin
      .from('internal_exam_codes')
      .insert({
        code,
        subject_id: subjectId,
        student_id: studentId,
        issued_by: adminUserId,
        organization_id: orgId,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })
      .select('id')
      .single()
    if (error || !data) throw new Error(`seedCode: ${error?.message}`)
    const id = data.id as string
    createdInternalExamCodeIds.push(id)
    return { id, code }
  }

  // Insert an active session of an arbitrary mode for the test student directly
  // (service-role bypasses RLS, but NOT the partial unique index).
  const seedActiveSession = async (mode: string): Promise<string> => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .insert({ organization_id: orgId, student_id: studentId, mode, subject_id: subjectId })
      .select('id')
      .single()
    if (error || !data) throw new Error(`seedActiveSession(${mode}): ${error?.message}`)
    return data.id as string
  }

  // Read every active session this student currently holds (service-role).
  const readActiveSessions = async (): Promise<ActiveSessionRow[]> => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .select('id, mode, subject_id, ended_at, deleted_at')
      .eq('student_id', studentId)
      .is('ended_at', null)
      .is('deleted_at', null)
    if (error) throw new Error(`readActiveSessions: ${error.message}`)
    return requireRpcRows<ActiveSessionRow>(data, 'readActiveSessions')
  }

  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `Test Org CrossMode ${suffix}`,
      slug: `test-cross-mode-${suffix}`,
    })

    adminUserId = await createTestUser({
      admin,
      orgId,
      email: `admin-cm-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'admin',
    })
    userIds.push(adminUserId)

    studentId = await createTestUser({
      admin,
      orgId,
      email: `student-cm-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(studentId)

    studentClient = await getAuthenticatedClient({
      email: `student-cm-${suffix}@test.local`,
      password: 'test-pass-123',
    })

    refs = await seedReferenceData({
      admin,
      subjectCode: `CM${suffix}`,
      subjectName: `Cross Mode Subject ${suffix}`,
      topicCode: `CM${suffix}-01`,
      topicName: `Cross Mode Topic ${suffix}`,
    })
    subjectId = refs.subjectId
    topicId = refs.topicId

    await seedQuestions({
      admin,
      orgId,
      createdBy: adminUserId,
      subjectId,
      topicId,
      count: 5,
    })

    // Minimal enabled exam_config for the SAS-style subject so that
    // start_internal_exam_session can proceed past the config lookup.
    const { data: cfg, error: cfgErr } = await admin
      .from('exam_configs')
      .insert({
        organization_id: orgId,
        subject_id: subjectId,
        enabled: true,
        total_questions: 1,
        time_limit_seconds: 600,
        pass_mark: 75,
      })
      .select('id')
      .single()
    if (cfgErr || !cfg) throw new Error(`seed exam_config: ${cfgErr?.message}`)
    const { error: distErr } = await admin.from('exam_config_distributions').insert({
      exam_config_id: cfg.id,
      topic_id: topicId,
      subtopic_id: null,
      question_count: 1,
    })
    if (distErr) throw new Error(`seed exam_config_distribution: ${distErr.message}`)

    // RT setup: resolve global RT subject/topics (seeded by mig 097, never deleted
    // by tests), seed the minimum question pool, and insert a RT exam_config row.
    const rtRefs = await getRtRefs()
    rtSubjectId = rtRefs.rtSubjectId
    const p1TopicId = rtRefs.p1TopicId
    const p2TopicId = rtRefs.p2TopicId
    const p3TopicId = rtRefs.p3TopicId

    // ensureBank is idempotent — reuses an existing bank for the org if one exists.
    const bankId = await ensureBank(orgId, adminUserId)
    for (let i = 0; i < 8; i++) {
      await insertShortAnswerQuestion({
        orgId,
        bankId,
        adminId: adminUserId,
        rtSubjectId,
        p1TopicId,
        idx: 300 + i,
      })
    }
    for (let i = 0; i < 9; i++) {
      await insertDialogFillQuestion({
        orgId,
        bankId,
        adminId: adminUserId,
        rtSubjectId,
        p2TopicId,
        idx: 300 + i,
      })
    }
    for (let i = 0; i < 8; i++) {
      await insertMcQuestion({
        orgId,
        bankId,
        adminId: adminUserId,
        rtSubjectId,
        p3TopicId,
        idx: 300 + i,
      })
    }

    // parts_config omitted — the RPC falls back to briefing-package defaults
    // (P1=8 SA, P2=9 DF, P3=8 MC) via COALESCE. Different subject from the
    // SAS exam_config above, so uq_exam_configs_org_subject_active is not violated.
    const { error: ecErr } = await admin.from('exam_configs').insert({
      organization_id: orgId,
      subject_id: rtSubjectId,
      enabled: true,
      total_questions: 25,
      time_limit_seconds: 1800,
      pass_mark: 75,
    })
    if (ecErr) throw new Error(`RT exam_configs insert: ${ecErr.message}`)
  })

  // The partial unique index allows only one active session per student, so each
  // test must leave a clean slate. Soft-delete every active session the student
  // holds (single cleanup step — no §7 per-step accumulator needed).
  afterEach(async () => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('student_id', studentId)
      .is('ended_at', null)
      .is('deleted_at', null)
      .select('id')
    if (error) throw new Error(`afterEach session cleanup: ${error.message}`)
    if ((data?.length ?? 0) > 0) {
      console.log(`[cross-mode] afterEach soft-deleted ${data?.length} session(s)`)
    }
  })

  afterAll(async () => {
    const errors: string[] = []

    // Step 1: hard-delete any internal_exam_codes rows created in Gap-A tests.
    // These FK into users + organizations + quiz_sessions (no ON DELETE CASCADE)
    // that cleanupTestData hard-deletes in step 2 — codes must be removed first
    // or the FK constraint blocks user/org deletion (code-style.md §7 dependent steps).
    if (createdInternalExamCodeIds.length > 0) {
      try {
        const { data: removed, error } = await admin
          .from('internal_exam_codes')
          .delete()
          .in('id', createdInternalExamCodeIds)
          .select('id')
        if (error) throw new Error(error.message)
        if ((removed?.length ?? 0) > 0) {
          console.log(`[cross-mode] removed ${removed?.length} code(s)`)
        }
      } catch (e) {
        errors.push(`code delete: ${e instanceof Error ? e.message : String(e)}`)
      } finally {
        createdInternalExamCodeIds.length = 0
      }
    }

    // Steps 2-3 are FK-dependent on step 1 completing cleanly.
    if (errors.length === 0) {
      try {
        await cleanupTestData({ admin, orgId, userIds })
      } catch (e) {
        errors.push(`cleanupTestData: ${e instanceof Error ? e.message : String(e)}`)
      }
      try {
        await cleanupReferenceData({ admin, refs: [refs] })
      } catch (e) {
        errors.push(`cleanupReferenceData: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    if (errors.length > 0) throw new Error(`afterAll: ${errors.join('; ')}`)
  })

  // ── Gap A: start_internal_exam_session — single-active-session guard ──

  it('blocks an internal exam start while another session is already active', async () => {
    const { code } = await seedCode()
    const quizId = await seedActiveSession('quick_quiz')
    // Non-vacuity: the blocking session genuinely exists before the internal exam attempt.
    expect((await readActiveSessions()).map((s) => s.id)).toContain(quizId)

    const { data, error } = await studentClient.rpc('start_internal_exam_session', {
      p_code: code,
    })
    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/another_session_active/i)
    expect(data).toBeNull()

    // No internal_exam session was created — the quick_quiz remains the only active session.
    const after = await readActiveSessions()
    expect(after.map((s) => s.id)).toEqual([quizId])
    expect(after.map((s) => s.mode)).not.toContain('internal_exam')
  })

  it('auto-clears an abandoned discovery session when an internal exam starts', async () => {
    const { code } = await seedCode()
    const discoveryId = await seedActiveSession('discovery')
    // Non-vacuity: the discovery row is genuinely active before the internal exam start.
    expect((await readActiveSessions()).map((s) => s.id)).toEqual([discoveryId])

    const { data, error } = await studentClient.rpc('start_internal_exam_session', {
      p_code: code,
    })
    expect(error).toBeNull()
    // start_internal_exam_session returns RETURNS TABLE — PostgREST serialises it as a
    // one-row array. A non-empty array confirms the session was created.
    const startedRows = requireRpcRows<{ session_id: string }>(
      data,
      'start_internal_exam_session (gap A-2)',
    )
    expect(startedRows.length).toBeGreaterThan(0)

    // The discovery row is soft-deleted (not ended); the new internal_exam is the
    // only active session.
    const { data: discRow, error: discErr } = await admin
      .from('quiz_sessions')
      .select('ended_at, deleted_at')
      .eq('id', discoveryId)
      .single()
    expect(discErr).toBeNull()
    expect(discRow?.deleted_at).not.toBeNull()
    expect(discRow?.ended_at).toBeNull()

    const active = await readActiveSessions()
    expect(active).toHaveLength(1)
    expect(active[0]?.mode).toBe('internal_exam')
  })

  // ── Gap B: start_vfr_rt_exam_session — single-active-session guard ──

  it('blocks a new VFR RT session start while a different active session exists', async () => {
    const quizId = await seedActiveSession('quick_quiz')
    // Non-vacuity: the blocking session genuinely exists before the VFR RT start attempt.
    expect((await readActiveSessions()).map((s) => s.id)).toContain(quizId)

    const { data, error } = await studentClient.rpc('start_vfr_rt_exam_session', {
      p_subject_id: rtSubjectId,
    })
    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/another_session_active/i)
    expect(data).toBeNull()

    // No vfr_rt_exam session was created — the quick_quiz remains the only active session.
    const active = await readActiveSessions()
    expect(active.map((s) => s.id)).toEqual([quizId])
    expect(active.map((s) => s.mode)).not.toContain('vfr_rt_exam')
  })

  it('resumes the same VFR RT exam session on a second start call for the same subject', async () => {
    // First call — no active session exists, so the RPC creates one.
    const { data: firstData, error: err1 } = await studentClient.rpc('start_vfr_rt_exam_session', {
      p_subject_id: rtSubjectId,
    })
    expect(err1).toBeNull()
    const first = requireRpcResult<{ session_id: string; question_ids: string[] }>(
      firstData,
      'start_vfr_rt_exam_session (first call)',
    )
    expect(typeof first.session_id).toBe('string')
    // Non-vacuity: the session genuinely exists as the only active one.
    const activeAfterFirst = await readActiveSessions()
    expect(activeAfterFirst.map((s) => s.id)).toContain(first.session_id)

    // Second call with the same subject — the idempotent-resume path returns the
    // existing session instead of raising another_session_active.
    const { data: secondData, error: err2 } = await studentClient.rpc('start_vfr_rt_exam_session', {
      p_subject_id: rtSubjectId,
    })
    expect(err2).toBeNull()
    const second = requireRpcResult<{ session_id: string; question_ids: string[] }>(
      secondData,
      'start_vfr_rt_exam_session (second call)',
    )

    // Same session id and same frozen question set.
    expect(second.session_id).toBe(first.session_id)
    expect(Array.isArray(second.question_ids)).toBe(true)
    expect(second.question_ids).toEqual(first.question_ids)
  })

  it('auto-clears an abandoned discovery session when a VFR RT exam starts', async () => {
    const discoveryId = await seedActiveSession('discovery')
    // Non-vacuity: the discovery row is genuinely active before the VFR RT start.
    expect((await readActiveSessions()).map((s) => s.id)).toEqual([discoveryId])

    // start_vfr_rt_exam_session (mig 20260629000500 step 5b) soft-deletes an
    // active discovery row before the block check, so this call must succeed.
    const { data, error } = await studentClient.rpc('start_vfr_rt_exam_session', {
      p_subject_id: rtSubjectId,
    })
    expect(error).toBeNull()
    const result = requireRpcResult<{ session_id: string; question_ids: string[] }>(
      data,
      'start_vfr_rt_exam_session (gap B-3)',
    )
    expect(typeof result.session_id).toBe('string')

    // The discovery row is soft-deleted (not ended); the new vfr_rt_exam is the
    // only active session.
    const { data: discRow, error: discErr } = await admin
      .from('quiz_sessions')
      .select('ended_at, deleted_at')
      .eq('id', discoveryId)
      .single()
    expect(discErr).toBeNull()
    expect(discRow?.deleted_at).not.toBeNull()
    expect(discRow?.ended_at).toBeNull()

    const active = await readActiveSessions()
    expect(active).toHaveLength(1)
    expect(active[0]?.id).toBe(result.session_id)
    expect(active[0]?.mode).toBe('vfr_rt_exam')
  })
})
