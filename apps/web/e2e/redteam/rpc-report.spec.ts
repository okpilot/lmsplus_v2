/**
 * Red Team Spec: get_report_correct_options RPC (#253)
 *
 * SECURITY DEFINER RPC returning the correct-option ids for a COMPLETED session
 * the caller owns (the report answer key). Vectors (attack-surface.md):
 *  - L  unauthenticated → 'Not authenticated'.
 *  - M  cross-tenant / foreign session_id (not owned) →
 *       'Session not found, not owned, or not completed'.
 *  - N  the owner's own session that is still active (ended_at IS NULL) →
 *       same message (the EXISTS guard requires ended_at IS NOT NULL).
 *  - positive: the owner reads their own completed session (guard passes).
 *
 * Vector O (the raw `correct` boolean must never reach the client in the report
 * QUESTIONS payload) is an application-layer concern in buildReportQuestions and
 * is covered by a co-located unit test, not this PostgREST-level spec.
 */

import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import {
  ATTACKER_EMAIL,
  ATTACKER_PASSWORD,
  pickSubjectWithQuestions,
  seedRedTeamUsers,
  VICTIM_EMAIL,
  VICTIM_PASSWORD,
} from './helpers/seed'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321'
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
const RPC = 'get_report_correct_options'

test.describe('Red Team: get_report_correct_options RPC', () => {
  let admin: ReturnType<typeof getAdminClient>
  let attackerClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let victimClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let victimUserId: string
  let orgId: string
  let subjectId: string

  const createdSessionIds = new Set<string>()

  test.beforeAll(async () => {
    admin = getAdminClient()
    const seed = await seedRedTeamUsers()
    victimUserId = seed.victimUserId
    orgId = seed.orgId
    attackerClient = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)
    victimClient = await createAuthenticatedClient(VICTIM_EMAIL, VICTIM_PASSWORD)
    const picked = await pickSubjectWithQuestions(admin, { orgId })
    subjectId = picked.subjectId
  })

  const seedSession = async (opts: {
    completed: boolean
    questionIds?: string[]
  }): Promise<string> => {
    const questionIds = opts.questionIds ?? []
    const row: Record<string, unknown> = {
      organization_id: orgId,
      student_id: victimUserId,
      mode: 'quick_quiz',
      subject_id: subjectId,
      config: { question_ids: questionIds },
      total_questions: questionIds.length > 0 ? questionIds.length : 1,
      started_at: new Date(Date.now() - 60_000).toISOString(),
    }
    if (opts.completed) {
      row.ended_at = new Date().toISOString()
      row.score_percentage = 0
      row.passed = false
      row.correct_count = 0
    }
    const { data, error } = await admin.from('quiz_sessions').insert(row).select('id').single()
    if (error || !data) throw new Error(`seed session: ${error?.message}`)
    createdSessionIds.add(data.id)
    return data.id
  }

  test.afterEach(async () => {
    if (createdSessionIds.size === 0) return
    try {
      const { data, error } = await admin
        .from('quiz_sessions')
        .update({ deleted_at: new Date().toISOString() })
        .in('id', Array.from(createdSessionIds))
        .is('deleted_at', null)
        .select('id')
      if (error) throw new Error(`afterEach soft-delete: ${error.message}`)
      if ((data?.length ?? 0) > 0) {
        console.log(`[report-rpc] soft-deleted ${data?.length} session(s)`)
      }
    } finally {
      createdSessionIds.clear()
    }
  })

  test('L: an unauthenticated caller is rejected', async () => {
    const sessionId = await seedSession({ completed: true })
    const anon = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data, error } = await anon.rpc(RPC, { p_session_id: sessionId })
    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/not authenticated/i)
    expect(data).toBeNull()
  })

  test('M: a different student cannot read a foreign session report (IDOR)', async () => {
    const sessionId = await seedSession({ completed: true })
    const { data, error } = await attackerClient.rpc(RPC, { p_session_id: sessionId })
    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/session not found, not owned, or not completed/i)
    expect(data).toBeNull()
  })

  test('N: the owner cannot read a report for a still-active session', async () => {
    // Same combined-guard message as M; the distinguishing factor is the setup
    // (own-but-active session vs. foreign-completed session).
    const sessionId = await seedSession({ completed: false })
    const { data, error } = await victimClient.rpc(RPC, { p_session_id: sessionId })
    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/session not found, not owned, or not completed/i)
    expect(data).toBeNull()
  })

  test('positive boundary: a completed session with no answers returns an empty report', async () => {
    const sessionId = await seedSession({ completed: true })
    const { data, error } = await victimClient.rpc(RPC, { p_session_id: sessionId })
    // The ownership + completion guard passes; with zero answered questions the
    // RPC returns an empty array — the answer-key boundary case.
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
    expect((data as unknown[]).length).toBe(0)
  })

  test("positive: a completed session with one answer returns that question's correct-option key", async () => {
    // Derive a real MC question + its correct option id from the DB — never
    // hardcode the letter (the correct option varies per question). Prefer the
    // spec's subject; fall back to any active org MC question so the test is
    // resilient to fixture drift. Since #823 (mig 109) the answer key lives in the
    // REVOKE-gated questions.correct_option_id column (stripped out of options[]),
    // so the service-role admin client reads correct_option_id directly here.
    // get_report_correct_options likewise derives the key from correct_option_id,
    // independent of selected_option_id.
    const baseQuery = () =>
      admin
        .from('questions')
        .select('id, correct_option_id')
        .eq('organization_id', orgId)
        .eq('question_type', 'multiple_choice')
        .eq('status', 'active')
        .is('deleted_at', null)
        .not('correct_option_id', 'is', null)
        .order('id', { ascending: true })
        .limit(1)

    const subjectScoped = await baseQuery().eq('subject_id', subjectId).maybeSingle()
    expect(subjectScoped.error).toBeNull()
    const fallback = subjectScoped.data ? null : await baseQuery().maybeSingle()
    if (fallback) {
      expect(fallback.error).toBeNull()
      // Surface which path ran so a CI pass with an out-of-subject question is visible.
      console.warn(
        '[rpc-report positive] no subject-scoped MC question; using any active org MC question',
      )
    }
    const question = subjectScoped.data ?? fallback?.data ?? null
    expect(question).not.toBeNull()

    const questionId = question?.id as string
    const correctOptionId = question?.correct_option_id as string | null
    // Guard AND narrow (code-style §5): the insert below targets NOT NULL columns,
    // so a `string | null` must not flow through. The throw narrows the TS type
    // to `string` for the insert and the final assertion, and fails the test with a
    // clear message if no active MC question with a correct_option_id exists.
    if (typeof questionId !== 'string' || typeof correctOptionId !== 'string') {
      throw new Error('rpc-report positive: no active MC question with a correct_option_id found')
    }

    // Seed a completed session scoped to that single question, then insert exactly
    // one answer row. quiz_session_answers is immutable (append-only) — service-role
    // insert only. selected_option_id satisfies the CHECK ('a'..'d') because option
    // ids are letters; is_correct is cosmetic here (the RPC derives the key from the
    // question's correct_option_id column, not the submitted answer).
    const sessionId = await seedSession({ completed: true, questionIds: [questionId] })
    const { error: answerErr } = await admin.from('quiz_session_answers').insert({
      session_id: sessionId,
      question_id: questionId,
      selected_option_id: correctOptionId,
      is_correct: true,
      response_time_ms: 5000,
    })
    expect(answerErr).toBeNull()

    // The guard passes AND the RPC returns the documented (question_id,
    // correct_option_id) payload — assert the real 2-column contract, not just
    // error===null / Array.isArray (red-team §7 RPC output-contract).
    const { data, error } = await victimClient.rpc(RPC, { p_session_id: sessionId })
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
    const rows = data as { question_id: string; correct_option_id: string }[]
    // Exactly one answered question was seeded, and the RPC is DISTINCT ON
    // (question_id), so the report must return exactly one row — an exact
    // assertion catches a duplicate/extra-row regression that >= 1 would mask.
    expect(rows).toHaveLength(1)
    const row = rows.find((r) => r.question_id === questionId)
    expect(row).toBeDefined()
    expect(row?.correct_option_id).toBe(correctOptionId)
  })

  // Cleanup note: the new answer row is scoped to the session seeded above, which
  // afterEach soft-deletes (mirrors session-replay.spec.ts — parent soft-delete is
  // sufficient; the immutable quiz_session_answers row is never hard-deleted and
  // cannot pollute other specs once its session is soft-deleted).

  // --- #856 Vector ED: active-user gate (soft-deleted caller) ---

  test.describe('ED: a soft-deleted caller is rejected by the active-user gate (#856)', () => {
    // The owner (victim) holds a valid JWT and owns a COMPLETED session whose
    // report they can read. After they are soft-deleted (users.deleted_at set),
    // get_report_correct_options must reject with 'user not found or inactive'
    // (mig 112 / 20260612000400, PR #856) — the active-user gate fires right after
    // the auth.uid() check, BEFORE the session-ownership check, so the rejection is
    // independent of session validity. Mirrors the BJ soft-deleted-user pattern in
    // server-action-unauthenticated.spec.ts (start_quiz_session / batch_submit_quiz).
    //
    // CRITICAL — victimUserId is the SHARED red-team victim used by every spec in
    // the run. The afterEach restores deleted_at = null (only when the flag is set)
    // so the user is healthy for all later specs.
    let victimSoftDeleted = false

    test.afterEach(async () => {
      // Restore the shared victim's deleted_at to null after each test so the user
      // stays active for downstream specs.
      if (!victimSoftDeleted) return
      const { data: restored, error: restoreErr } = await admin
        .from('users')
        .update({ deleted_at: null })
        .eq('id', victimUserId)
        .select('id')
      if (restoreErr) throw new Error(`[ED cleanup] restore victim failed: ${restoreErr.message}`)
      if ((restored?.length ?? 0) === 0)
        throw new Error('[ED cleanup] restore victim affected 0 rows')
      console.log(`[ED cleanup] restored victim user ${victimUserId}`)
      victimSoftDeleted = false
    })

    test('the owner can read their completed-session report until soft-deleted, then is rejected', async () => {
      // Non-vacuous setup: seed the owner's OWN completed session and assert the
      // protected state genuinely exists and is readable BEFORE soft-deletion —
      // otherwise the post-deletion rejection could pass vacuously.
      const sessionId = await seedSession({ completed: true })

      // Confirm the session + ownership genuinely exist via the service-role client.
      const { data: ownRows, error: ownErr } = await admin
        .from('quiz_sessions')
        .select('id, student_id, ended_at, deleted_at')
        .eq('id', sessionId)
      expect(ownErr).toBeNull()
      expect(ownRows ?? []).toHaveLength(1)
      expect(ownRows?.[0]?.student_id).toBe(victimUserId)
      expect(ownRows?.[0]?.ended_at).not.toBeNull()
      expect(ownRows?.[0]?.deleted_at).toBeNull()

      // Happy path: while active, the owner's own completed session report is
      // readable (the ownership + completion guard passes).
      const before = await victimClient.rpc(RPC, { p_session_id: sessionId })
      expect(before.error).toBeNull()
      expect(Array.isArray(before.data)).toBe(true)

      // Soft-delete the owner via admin (simulates account deactivation). The JWT
      // minted in beforeAll is still valid.
      const { data: deleted, error: delErr } = await admin
        .from('users')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', victimUserId)
        .is('deleted_at', null)
        .select('id')
      expect(delErr).toBeNull()
      // Non-vacuous: confirm the soft-delete actually changed a row.
      expect((deleted ?? []).length).toBeGreaterThan(0)
      victimSoftDeleted = true

      // The active-user gate fires before the session-ownership check, so the same
      // owned + completed session that was readable above is now rejected.
      const { data, error } = await victimClient.rpc(RPC, { p_session_id: sessionId })
      expect(error).not.toBeNull()
      expect(error?.message ?? '').toMatch(/user not found or inactive/i)
      expect(data).toBeNull()
    })
  })
})
