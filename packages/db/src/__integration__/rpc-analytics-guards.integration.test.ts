import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanupReferenceData, cleanupTestData } from './cleanup'
import { requireRpcRows } from './guards'
import { seedReferenceData } from './seed'
import { createTestOrg, createTestUser, getAdminClient, getAuthenticatedClient } from './setup'

// get_daily_activity / get_subject_scores (mig 20260824000300) — the two analytics members the
// #883 active-user-gate sweep missed, plus the rule-9 soft-delete filter get_subject_scores
// never had.
//
// Neither RPC had coverage at ANY tier before this file: no unit test reaches the SQL (the
// app-layer ones mock `client.rpc` wholesale) and there was no integration test at all. Both
// guards added by that migration only run when the function is EXECUTED — `supabase db reset`
// proves the bodies parse and nothing more.
//
// Both RPCs are GRANTed to `authenticated` (20260312000013 L37, L73), so these paths are
// reachable by a direct PostgREST rpc() call regardless of what the app layer does with them.
// get_subject_scores in particular: MEASURED 2026-09-01, its only in-repo caller was the
// getSubjectScores helper (apps/web/lib/queries/analytics.ts), which nothing imported — so no page
// reached it and the grant was the whole live surface. Callers are an OPEN set; re-derive with
// `grep -rn "get_subject_scores\|getSubjectScores" apps packages` rather than trusting this line.
//
// This file also covers two PRE-EXISTING guards this migration did not change, because they
// were never exercised at any tier either: the RPC-level p_days/p_limit clamp (the app layer in
// lib/queries/analytics.ts always pre-clamps in TS before calling, so the RPC's own RAISE is
// reachable only via a direct PostgREST call — same threat model as the grant above) and the
// `auth.uid() IS DISTINCT FROM p_student_id` identity guard (Decision 24), the primary
// cross-student access control these two RPCs have.

type SubjectScoreRow = {
  subject_id: string
  subject_name: string
  subject_short: string
  avg_score: number | string
  session_count: number | string
}

type DailyActivityRow = {
  day: string
  total: number | string
  correct: number | string
  incorrect: number | string
}

const PASSWORD = 'test-pass-123'

// Two DISTINCT scores whose average differs from either one. A soft-delete regression that
// drops `qs.deleted_at IS NULL` yields the average of both (65.0); the correct filter yields
// the survivor alone (90.0). No COALESCE default in the function can produce 90.0 by accident.
const SCORE_KEPT = 90
const SCORE_DISCARDED = 40
const AVG_OF_BOTH = 65

describe('RPC: get_daily_activity / get_subject_scores — active-user gate + soft-delete filter', () => {
  const admin = getAdminClient()
  // Sentinel so a mid-beforeAll failure leaves this falsy-checkable in afterAll — vitest still
  // runs afterAll when beforeAll throws, and an unassigned `let` would mask the real failure.
  let orgId = ''
  let studentId = ''
  let studentClient: SupabaseClient
  // A second student, used only by the cross-student identity-guard tests below — distinct from
  // `studentClient` so `p_student_id: studentId` is a genuine OTHER-caller read, not a self-read.
  let attackerClient: SupabaseClient
  let refs: Awaited<ReturnType<typeof seedReferenceData>> | null = null
  let discardedSessionId = ''
  const userIds: string[] = []
  const suffix = Date.now()
  const studentEmail = `student-analytics-${suffix}@test.local`
  const attackerEmail = `attacker-analytics-${suffix}@test.local`

  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `Test Org Analytics ${suffix}`,
      slug: `test-analytics-${suffix}`,
    })
    studentId = await createTestUser({
      admin,
      orgId,
      email: studentEmail,
      password: PASSWORD,
      role: 'student',
    })
    userIds.push(studentId)
    studentClient = await getAuthenticatedClient({ email: studentEmail, password: PASSWORD })

    const attackerId = await createTestUser({
      admin,
      orgId,
      email: attackerEmail,
      password: PASSWORD,
      role: 'student',
    })
    userIds.push(attackerId)
    attackerClient = await getAuthenticatedClient({ email: attackerEmail, password: PASSWORD })

    refs = await seedReferenceData({
      admin,
      subjectCode: `AN${suffix}`,
      subjectName: `Analytics Subject ${suffix}`,
      topicCode: `AN${suffix}-01`,
      topicName: `Analytics Topic ${suffix}`,
    })

    // Two completed sessions on ONE subject. get_subject_scores requires ended_at IS NOT NULL
    // AND score_percentage IS NOT NULL, so both are set. ended_at also keeps them clear of the
    // single-active-session partial unique index (mig 136).
    const baseSession = {
      organization_id: orgId,
      student_id: studentId,
      subject_id: refs.subjectId,
      mode: 'quick_quiz',
      total_questions: 1,
      config: { question_ids: [] },
    }
    const { data: sessions, error: sessErr } = await admin
      .from('quiz_sessions')
      .insert([
        {
          ...baseSession,
          started_at: new Date(Date.now() - 2 * 60_000).toISOString(),
          ended_at: new Date(Date.now() - 90_000).toISOString(),
          score_percentage: SCORE_DISCARDED,
        },
        {
          ...baseSession,
          started_at: new Date(Date.now() - 60_000).toISOString(),
          ended_at: new Date(Date.now() - 30_000).toISOString(),
          score_percentage: SCORE_KEPT,
        },
      ])
      .select('id, score_percentage')
    if (sessErr) throw new Error(`seed quiz_sessions: ${sessErr.message}`)
    const rows = requireRpcRows<{ id: string; score_percentage: number | string }>(
      sessions,
      'quiz_sessions insert',
    )
    const discarded = rows.find((r) => Number(r.score_percentage) === SCORE_DISCARDED)
    if (!discarded) throw new Error('seed quiz_sessions: discarded session not returned')
    discardedSessionId = discarded.id
  })

  // Per-step error accumulator (code-style.md §7): two distinct cleanup steps, each isolated so
  // a failure in one is reported rather than swallowed. They are FK-DEPENDENT, not independent —
  // cleanupTestData removes the quiz_sessions that reference easa_subjects, so the reference-data
  // delete is guarded on it having succeeded; running it after a failure would raise a spurious
  // FK error that masks the real cause.
  afterAll(async () => {
    const errors: string[] = []

    if (orgId) {
      try {
        await cleanupTestData({ admin, orgId, userIds })
      } catch (e) {
        errors.push(`cleanupTestData: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    if (refs && errors.length === 0) {
      try {
        await cleanupReferenceData({ admin, refs: [refs] })
      } catch (e) {
        errors.push(`cleanupReferenceData: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    if (errors.length > 0) throw new Error(`afterAll: ${errors.join('; ')}`)
  })

  // ── get_subject_scores: the rule-9 soft-delete filter ──────────────────────
  describe('get_subject_scores soft-delete filter', () => {
    it('averages both completed sessions while neither is discarded', async () => {
      // Positive control for the test below: proves both seeded sessions are visible to the
      // function, so the post-discard change cannot be an artefact of one never counting.
      const { data, error } = await studentClient.rpc('get_subject_scores', {
        p_student_id: studentId,
        p_limit: 5,
      })
      expect(error).toBeNull()
      const rows = requireRpcRows<SubjectScoreRow>(data, 'get_subject_scores')
      const row = rows.find((r) => r.subject_id === refs?.subjectId)
      expect(row).toBeDefined()
      expect(Number(row?.session_count)).toBe(2)
      expect(Number(row?.avg_score)).toBe(AVG_OF_BOTH)
    })

    it('excludes a discarded session from the subject average', async () => {
      const { data: discarded, error: delErr } = await admin
        .from('quiz_sessions')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', discardedSessionId)
        .is('deleted_at', null)
        .select('id')
      if (delErr) throw new Error(`soft-delete session: ${delErr.message}`)
      expect((discarded ?? []).length).toBe(1)

      const { data, error } = await studentClient.rpc('get_subject_scores', {
        p_student_id: studentId,
        p_limit: 5,
      })
      expect(error).toBeNull()
      const rows = requireRpcRows<SubjectScoreRow>(data, 'get_subject_scores')
      const row = rows.find((r) => r.subject_id === refs?.subjectId)
      expect(row).toBeDefined()
      // 90.0, not 65.0 — the discarded session no longer moves the average.
      expect(Number(row?.avg_score)).toBe(SCORE_KEPT)
      expect(Number(row?.session_count)).toBe(1)
    })
  })

  // ── Active-user gate (#883) on both analytics RPCs ─────────────────────────
  // This describe soft-deletes the shared student. Its own afterEach restores them before any
  // later describe begins and throws if the restore matched no row, so a failure inside here
  // cannot strand a deleted user — that holds wherever in the file this block sits, and two more
  // describes do now follow it.
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

    it('rejects a soft-deleted caller on both analytics RPCs', async () => {
      // Positive control — while active, the same client reads both RPCs without error, so the
      // rejections below are attributable to the gate and not to a broken client or fixture.
      const beforeDaily = await studentClient.rpc('get_daily_activity', {
        p_student_id: studentId,
        p_days: 7,
      })
      expect(beforeDaily.error).toBeNull()
      expect(requireRpcRows<DailyActivityRow>(beforeDaily.data, 'get_daily_activity')).toHaveLength(
        7,
      )
      const beforeScores = await studentClient.rpc('get_subject_scores', {
        p_student_id: studentId,
        p_limit: 5,
      })
      expect(beforeScores.error).toBeNull()

      const { data: deleted, error: delErr } = await admin
        .from('users')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', studentId)
        .is('deleted_at', null)
        .select('id')
      if (delErr) throw new Error(`soft-delete user: ${delErr.message}`)
      expect((deleted ?? []).length).toBe(1)
      userSoftDeleted = true

      // The JWT minted in beforeAll is still valid — deactivation does not revoke it. The
      // gate inside the function is the only thing standing between it and the data.
      const daily = await studentClient.rpc('get_daily_activity', {
        p_student_id: studentId,
        p_days: 7,
      })
      expect(daily.error).not.toBeNull()
      expect(daily.error?.message ?? '').toContain('user not found or inactive')
      expect(daily.data).toBeNull()

      const scores = await studentClient.rpc('get_subject_scores', {
        p_student_id: studentId,
        p_limit: 5,
      })
      expect(scores.error).not.toBeNull()
      expect(scores.error?.message ?? '').toContain('user not found or inactive')
      expect(scores.data).toBeNull()
    })
  })

  // ── Cross-student identity guard (`auth.uid() IS DISTINCT FROM p_student_id`, Decision 24) ──
  // Pre-existing on both RPCs, unchanged by this migration, but never exercised at any tier: the
  // app layer always calls with the caller's own id, so only a direct PostgREST call (or a
  // regression that starts forwarding a caller-supplied id) reaches this path.
  describe('cross-student identity guard', () => {
    it("rejects a caller reading another student's daily activity", async () => {
      const { data, error } = await attackerClient.rpc('get_daily_activity', {
        p_student_id: studentId,
        p_days: 7,
      })
      expect(error).not.toBeNull()
      expect(error?.message ?? '').toContain('forbidden')
      expect(data).toBeNull()
    })

    it("rejects a caller reading another student's subject scores", async () => {
      const { data, error } = await attackerClient.rpc('get_subject_scores', {
        p_student_id: studentId,
        p_limit: 5,
      })
      expect(error).not.toBeNull()
      expect(error?.message ?? '').toContain('forbidden')
      expect(data).toBeNull()
    })
  })

  // ── RPC-level parameter clamp (execution-only; §5 deferred validation) ────────────────────
  // Pre-existing on both RPCs, unchanged by this migration, but never exercised at any tier: the
  // app layer (lib/queries/analytics.ts) always pre-clamps in TS before calling the RPC, so this
  // RAISE is reachable only via a direct PostgREST call.
  describe('RPC-level parameter clamp', () => {
    it('rejects a get_daily_activity lookback window below 1 day', async () => {
      const { data, error } = await studentClient.rpc('get_daily_activity', {
        p_student_id: studentId,
        p_days: 0,
      })
      expect(error).not.toBeNull()
      expect(error?.message ?? '').toContain('p_days must be between 1 and 365')
      expect(data).toBeNull()
    })

    it('rejects a get_daily_activity lookback window above 365 days', async () => {
      const { data, error } = await studentClient.rpc('get_daily_activity', {
        p_student_id: studentId,
        p_days: 366,
      })
      expect(error).not.toBeNull()
      expect(error?.message ?? '').toContain('p_days must be between 1 and 365')
      expect(data).toBeNull()
    })

    it('rejects a get_subject_scores limit below 1', async () => {
      const { data, error } = await studentClient.rpc('get_subject_scores', {
        p_student_id: studentId,
        p_limit: 0,
      })
      expect(error).not.toBeNull()
      expect(error?.message ?? '').toContain('p_limit must be between 1 and 100')
      expect(data).toBeNull()
    })

    it('rejects a get_subject_scores limit above 100', async () => {
      const { data, error } = await studentClient.rpc('get_subject_scores', {
        p_student_id: studentId,
        p_limit: 101,
      })
      expect(error).not.toBeNull()
      expect(error?.message ?? '').toContain('p_limit must be between 1 and 100')
      expect(data).toBeNull()
    })
  })
})
