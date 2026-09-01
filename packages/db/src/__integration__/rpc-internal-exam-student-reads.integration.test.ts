import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanupReferenceData, cleanupTestData } from './cleanup'
import { requireRpcResult, requireRpcRows } from './guards'
import { seedReferenceData } from './seed'
import { createTestOrg, createTestUser, getAdminClient, getAuthenticatedClient } from './setup'

// list_my_internal_exam_history / list_my_active_internal_exam_codes
// (mig 20260824000200) — the two student-facing internal-exam readers.
//
// Two things only run when these functions are EXECUTED, so a clean `supabase db reset` proves
// neither:
//
//   1. answered_count. quiz_session_answers stores ONE ROW PER ANSWER ITEM — its live
//      uniqueness constraint is UNIQUE NULLS NOT DISTINCT (session_id, question_id,
//      blank_index) (20260610000300 L83-85) — so the previous count(*) reported 3 for a single
//      three-blank dialog_fill question, exceeding the session's own total_questions. The
//      fixture below is deliberately ONE question with THREE blanks: count(*) yields 3 and
//      count(DISTINCT question_id) yields 1, so the assertion distinguishes them. An MC-only
//      fixture would pass either way and prove nothing.
//
//   2. The active-user gate (#883, docs/security.md §11c). Both functions previously carried
//      only the auth.uid() null-check, so a student soft-deleted via toggle-student-status
//      while holding a still-valid JWT (up to ~1h) kept reading their exam history and their
//      outstanding codes — deactivation cascades to neither quiz_sessions nor
//      internal_exam_codes, so the per-row student_id filter still matched.
//
// Also latent until executed: both functions declare an `id uuid` OUT param, so the gate's
// users lookup MUST alias (`users u`) or raise 42702; and answered_count feeds a
// `RETURNS TABLE (answered_count int)` column, so dropping the ::int cast raises 42804
// (code-style.md §5).

type HistoryRow = {
  id: string
  subject_id: string
  total_questions: number
  answered_count: number
  attempt_number: number
}

type CodeRow = { id: string; subject_id: string }

const PASSWORD = 'test-pass-123'

const DF_B0 = 'cleared'
const DF_B1 = 'runway two seven'
const DF_B2 = 'wind calm'

describe('RPC: internal-exam student reads — DISTINCT answered_count + active-user gate', () => {
  const admin = getAdminClient()
  // Sentinels so a mid-beforeAll failure leaves these falsy-checkable in afterAll — vitest
  // still runs afterAll when beforeAll throws, and an unassigned `let` would throw a SECOND
  // error there and mask the real setup failure.
  let orgId = ''
  let adminUserId = ''
  let studentId = ''
  let studentClient: SupabaseClient
  let refs: Awaited<ReturnType<typeof seedReferenceData>> | null = null
  let dfId = ''
  let examSessionId = ''
  const userIds: string[] = []
  // internal_exam_codes has no ON DELETE CASCADE from users/orgs — hard-delete these first.
  const codeIds: string[] = []
  const suffix = Date.now()
  const studentEmail = `student-iexam-reads-${suffix}@test.local`

  const seedCode = async (): Promise<{ id: string; code: string }> => {
    if (!refs) throw new Error('seedCode: reference data not seeded')
    const code = `IR${suffix}${codeIds.length}`
    const { data, error } = await admin
      .from('internal_exam_codes')
      .insert({
        code,
        subject_id: refs.subjectId,
        student_id: studentId,
        issued_by: adminUserId,
        organization_id: orgId,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })
      .select('id')
      .single()
    if (error) throw new Error(`seedCode: ${error.message}`)
    const id = requireRpcResult<{ id: string }>(data, 'internal_exam_codes insert').id
    codeIds.push(id)
    return { id, code }
  }

  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `Test Org IExamReads ${suffix}`,
      slug: `test-iexam-reads-${suffix}`,
    })
    adminUserId = await createTestUser({
      admin,
      orgId,
      email: `admin-iexam-reads-${suffix}@test.local`,
      password: PASSWORD,
      role: 'admin',
    })
    userIds.push(adminUserId)
    studentId = await createTestUser({
      admin,
      orgId,
      email: studentEmail,
      password: PASSWORD,
      role: 'student',
    })
    userIds.push(studentId)
    studentClient = await getAuthenticatedClient({ email: studentEmail, password: PASSWORD })

    refs = await seedReferenceData({
      admin,
      subjectCode: `IR${suffix}`,
      subjectName: `IExamReads Subject ${suffix}`,
      topicCode: `IR${suffix}-01`,
      topicName: `IExamReads Topic ${suffix}`,
    })

    const { data: bank, error: bankErr } = await admin
      .from('question_banks')
      .insert({
        organization_id: orgId,
        name: `IExamReads Bank ${suffix}`,
        created_by: adminUserId,
      })
      .select('id')
      .single()
    if (bankErr) throw new Error(`seed bank: ${bankErr.message}`)
    const bankId = requireRpcResult<{ id: string }>(bank, 'question_banks insert').id

    // EXACTLY ONE question in this topic, and it is the three-blank dialog_fill. The exam
    // config below draws question_count = 1 from that topic, so selection is deterministic:
    // start_internal_exam_session's ORDER BY random() has a pool of one. It selects from
    // `questions` with NO question_type filter (20260629000400 L166-178), which is why a
    // non-MC question can land in an internal exam at all.
    const { data: q, error: qErr } = await admin
      .from('questions')
      .insert({
        organization_id: orgId,
        bank_id: bankId,
        subject_id: refs.subjectId,
        topic_id: refs.topicId,
        subtopic_id: null,
        difficulty: 'medium',
        status: 'active',
        created_by: adminUserId,
        question_type: 'dialog_fill',
        question_text: 'Three-blank dialog',
        dialog_template: '[atc] {{0|cleared}} to land {{1|runway two seven}}, {{2|wind calm}}.',
        blanks_config: [
          { index: 0, canonical: DF_B0, synonyms: [] },
          { index: 1, canonical: DF_B1, synonyms: [] },
          { index: 2, canonical: DF_B2, synonyms: [] },
        ],
        explanation_text: 'DF explanation',
      })
      .select('id')
      .single()
    if (qErr) throw new Error(`seed dialog_fill question: ${qErr.message}`)
    dfId = requireRpcResult<{ id: string }>(q, 'questions insert').id

    const { data: cfg, error: cfgErr } = await admin
      .from('exam_configs')
      .insert({
        organization_id: orgId,
        subject_id: refs.subjectId,
        enabled: true,
        total_questions: 1,
        time_limit_seconds: 1800,
        pass_mark: 75,
      })
      .select('id')
      .single()
    if (cfgErr) throw new Error(`seed exam_config: ${cfgErr.message}`)
    const configId = requireRpcResult<{ id: string }>(cfg, 'exam_configs insert').id

    const { error: distErr } = await admin.from('exam_config_distributions').insert({
      exam_config_id: configId,
      topic_id: refs.topicId,
      subtopic_id: null,
      question_count: 1,
    })
    if (distErr) throw new Error(`seed exam_config_distribution: ${distErr.message}`)

    // Run one full internal exam: start (consumes a code) then submit all three blanks.
    const { code } = await seedCode()
    const { data: started, error: startErr } = await studentClient.rpc(
      'start_internal_exam_session',
      { p_code: code },
    )
    if (startErr) throw new Error(`start_internal_exam_session: ${startErr.message}`)
    const startedRows = requireRpcRows<{ session_id: string; question_ids: string[] }>(
      started,
      'start_internal_exam_session',
    )
    if (startedRows.length === 0) throw new Error('start_internal_exam_session: no row returned')
    const firstRow = startedRows[0]
    if (!firstRow) throw new Error('start_internal_exam_session: empty first row')
    examSessionId = firstRow.session_id
    // The deterministic single-question pool must actually have produced OUR dialog_fill
    // question — if it did not, every count assertion below would be measuring something else.
    expect(firstRow.question_ids).toEqual([dfId])

    const { error: submitErr } = await studentClient.rpc('batch_submit_quiz', {
      p_session_id: examSessionId,
      p_answers: [
        { question_id: dfId, blank_index: 0, response_text: DF_B0, response_time_ms: 1000 },
        { question_id: dfId, blank_index: 1, response_text: DF_B1, response_time_ms: 1000 },
        { question_id: dfId, blank_index: 2, response_text: DF_B2, response_time_ms: 1000 },
      ],
    })
    if (submitErr) throw new Error(`batch_submit_quiz: ${submitErr.message}`)

    // A second code, left unconsumed, so list_my_active_internal_exam_codes has a row to
    // return — otherwise its gate test's positive control would be vacuous.
    await seedCode()
  })

  // Per-step error accumulator (code-style.md §7): three distinct cleanup steps, so a bare
  // sequential await would let a failure in step 1 skip steps 2-3 and leak this file's
  // uniquely-suffixed easa_subjects/easa_topics rows into every later run. Shape copied from
  // rpc-single-active-cross-mode.integration.test.ts:236-276.
  afterAll(async () => {
    const errors: string[] = []

    // Step 1: hard-delete the internal_exam_codes rows. They FK into users + organizations
    // with no ON DELETE CASCADE, so they must go before cleanupTestData removes those.
    if (codeIds.length > 0) {
      try {
        const { data: removed, error } = await admin
          .from('internal_exam_codes')
          .delete()
          .in('id', codeIds)
          .select('id')
        if (error) throw new Error(error.message)
        if ((removed?.length ?? 0) > 0) {
          console.log(`[iexam-reads] removed ${removed?.length} code(s)`)
        }
      } catch (e) {
        errors.push(`code delete: ${e instanceof Error ? e.message : String(e)}`)
      } finally {
        codeIds.length = 0
      }
    }

    // Steps 2-3 are FK-dependent on step 1 completing cleanly — running them after a failed
    // code delete would raise a spurious FK error that masks the real cause.
    if (errors.length === 0) {
      if (orgId) {
        try {
          await cleanupTestData({ admin, orgId, userIds })
        } catch (e) {
          errors.push(`cleanupTestData: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
      // Also FK-dependent on the step above: cleanupTestData removes the questions and
      // quiz_sessions that reference easa_subjects/easa_topics.
      if (refs && errors.length === 0) {
        try {
          await cleanupReferenceData({ admin, refs: [refs] })
        } catch (e) {
          errors.push(`cleanupReferenceData: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
    }

    if (errors.length > 0) throw new Error(`afterAll: ${errors.join('; ')}`)
  })

  // ── answered_count counts QUESTIONS, not answer items ──────────────────────
  describe('list_my_internal_exam_history answered_count', () => {
    it('stores one answer row per blank for the submitted dialog_fill question', async () => {
      // Positive control for the assertion below: without three rows actually present,
      // count(*) and count(DISTINCT question_id) would agree and the next test would pass
      // whichever aggregate the function used.
      const { data, error } = await admin
        .from('quiz_session_answers')
        .select('question_id, blank_index')
        .eq('session_id', examSessionId)
      expect(error).toBeNull()
      const rows = requireRpcRows<{ question_id: string; blank_index: number | null }>(
        data,
        'quiz_session_answers select',
      )
      expect(rows).toHaveLength(3)
      expect(new Set(rows.map((r) => r.question_id)).size).toBe(1)
      expect(rows.map((r) => r.blank_index).sort()).toEqual([0, 1, 2])
    })

    it('reports one answered question for a session whose only question has three blanks', async () => {
      const { data, error } = await studentClient.rpc('list_my_internal_exam_history')
      expect(error).toBeNull()
      const rows = requireRpcRows<HistoryRow>(data, 'list_my_internal_exam_history')
      const row = rows.find((r) => r.id === examSessionId)
      expect(row).toBeDefined()
      // 1, not 3 — and never more than the session's own total_questions, which is what the
      // "Answered {answeredCount}/{totalQuestions}" column renders.
      expect(Number(row?.answered_count)).toBe(1)
      expect(Number(row?.total_questions)).toBe(1)
      expect(Number(row?.attempt_number)).toBe(1)
    })
  })

  // ── Active-user gate (#883) on both student read RPCs ──────────────────────
  // Runs last: it soft-deletes the shared student and restores in the afterEach below, so an
  // assertion failure inside cannot leave a deleted user behind for a later test.
  describe('active-user gate', () => {
    // Restore in afterEach, not a finally: biome's noUnsafeFinally forbids throwing there
    // (it would overwrite the try body's own failure), and afterEach still runs when the test
    // fails — so an assertion failure above cannot strand a soft-deleted user. Same shape as
    // Vector ED in apps/web/e2e/redteam/rpc-report.spec.ts.
    let userSoftDeleted = false

    afterEach(async () => {
      if (!userSoftDeleted) return
      const { data: restored, error: restoreErr } = await admin
        .from('users')
        .update({ deleted_at: null })
        .eq('id', studentId)
        .select('id')
      if (restoreErr) throw new Error(`[gate cleanup] restore user failed: ${restoreErr.message}`)
      if ((restored ?? []).length === 0)
        throw new Error('[gate cleanup] restore user affected 0 rows')
      userSoftDeleted = false
    })

    it('rejects a soft-deleted caller on both internal-exam read RPCs', async () => {
      // Positive control — while active, this client reads a real history row and a real
      // active code, so the rejections below are the gate and not an empty fixture.
      const beforeHistory = await studentClient.rpc('list_my_internal_exam_history')
      expect(beforeHistory.error).toBeNull()
      expect(
        requireRpcRows<HistoryRow>(beforeHistory.data, 'list_my_internal_exam_history').length,
      ).toBeGreaterThan(0)
      const beforeCodes = await studentClient.rpc('list_my_active_internal_exam_codes')
      expect(beforeCodes.error).toBeNull()
      expect(
        requireRpcRows<CodeRow>(beforeCodes.data, 'list_my_active_internal_exam_codes').length,
      ).toBeGreaterThan(0)

      const { data: deleted, error: delErr } = await admin
        .from('users')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', studentId)
        .is('deleted_at', null)
        .select('id')
      if (delErr) throw new Error(`soft-delete user: ${delErr.message}`)
      expect((deleted ?? []).length).toBe(1)
      userSoftDeleted = true

      // The JWT minted in beforeAll is still valid — deactivating the row does not revoke
      // it. The gate inside each function is the only thing standing in the way.
      const history = await studentClient.rpc('list_my_internal_exam_history')
      expect(history.error).not.toBeNull()
      expect(history.error?.message ?? '').toContain('user not found or inactive')
      expect(history.data).toBeNull()

      const codes = await studentClient.rpc('list_my_active_internal_exam_codes')
      expect(codes.error).not.toBeNull()
      expect(codes.error?.message ?? '').toContain('user not found or inactive')
      expect(codes.data).toBeNull()
    })
  })
})
