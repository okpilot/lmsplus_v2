/**
 * Red Team Spec — Vector: start_quiz_session p_mode whitelist (issue #629)
 *                         + p_question_ids array-length cap (issue #275)
 *
 * Attack A (mode whitelist): An authenticated student calls `start_quiz_session`
 *         with p_mode='mock_exam' or p_mode='internal_exam'. Without the
 *         whitelist, this creates a quiz_sessions row whose mode column bypasses
 *         all exam_config validation performed by start_exam_session (mig 040)
 *         and start_internal_exam_session (mig 058). The attacker could then
 *         call batch_submit_quiz against a self-assembled question set,
 *         effectively generating a fake exam report without completing a real
 *         exam.
 *
 * Defense A: Migration 081 adds an early `IF p_mode IS NULL OR p_mode NOT IN
 *          ('smart_review', 'quick_quiz') THEN RAISE EXCEPTION
 *          'mode_not_allowed'` immediately after the auth check. The `IS NULL`
 *          clause is required because Postgres 3-valued logic returns NULL for
 *          `NULL NOT IN (...)` and `IF NULL THEN` evaluates as false — without
 *          it, NULL bypasses the guard. The whitelist runs BEFORE the
 *          active-user gate so mode_not_allowed cannot be used to probe
 *          'user inactive' via timing or error differences. The NULL guard
 *          ships in migration 20260521000001_start_quiz_session_null_guard.
 *
 * Attack B (resource exhaustion): An authenticated student calls
 *         `start_quiz_session` directly (bypassing the Next.js Server Action's
 *         Zod layer which caps count at 500) with 501+ UUIDs in p_question_ids.
 *         Without a DB-level cap the RPC would proceed to unnest, COUNT(DISTINCT),
 *         and JOIN against questions — O(N) work per call, unbounded (Vector R,
 *         issue #275).
 *
 * Defense B: Migration 086 adds `IF array_length(p_question_ids, 1) > 500 THEN
 *          RAISE EXCEPTION 'too_many_questions'` immediately after the
 *          no_questions_provided guard. Runs BEFORE the expensive unnest/JOIN
 *          operations so the guard is O(1). Cap matches the Zod max (500).
 *
 * No afterEach cleanup for mode-confusion attacks — the RPC raises before any
 * INSERT reaches the table. The array-cap attacks likewise raise before INSERT.
 * Both attack classes assert count === 0 new rows as positive verification.
 * If a future contributor adds a test case exercising a normal (accepted) call,
 * that test MUST add session cleanup in its own afterEach or afterAll block.
 */

import { expect, test } from '@playwright/test'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import {
  ATTACKER_EMAIL,
  ATTACKER_PASSWORD,
  pickSubjectWithQuestions,
  seedRedTeamUsers,
} from './helpers/seed'

test.describe('Vector — start_quiz_session p_mode whitelist (issue #629)', () => {
  let admin: ReturnType<typeof getAdminClient>
  let attackerClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let attackerUserId: string
  let questionIds: string[]
  let subjectId: string
  let topicId: string
  let testStartIso: string

  test.beforeAll(async () => {
    admin = getAdminClient()
    const seed = await seedRedTeamUsers()
    attackerUserId = seed.attackerUserId
    attackerClient = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)

    // Pick any subject/topic with active questions. The RPC is expected to
    // raise mode_not_allowed before it validates question_ids, so any valid
    // UUIDs from the seeded org are sufficient.
    const picked = await pickSubjectWithQuestions(admin, { orgId: seed.orgId })
    subjectId = picked.subjectId
    topicId = picked.topicId

    // Resolve one real question UUID to pass syntactically valid input.
    const { data: questions, error: qError } = await admin
      .from('questions')
      .select('id')
      .eq('organization_id', seed.orgId)
      .eq('subject_id', subjectId)
      .eq('topic_id', topicId)
      .eq('status', 'active')
      .is('deleted_at', null)
      .limit(1)
    if (qError || !questions || questions.length === 0) {
      throw new Error(
        `start-quiz-session-mode-confusion: could not resolve a question UUID: ${qError?.message}`,
      )
    }
    questionIds = questions.map((q: { id: string }) => q.id)
  })

  test.beforeEach(async () => {
    // Capture timestamp before each attack so the no-insert assertion can
    // scope the SELECT to rows created after this point.
    testStartIso = new Date().toISOString()
  })

  test('Attack 1 — mock_exam mode is rejected before any INSERT', async () => {
    const { error } = await attackerClient.rpc('start_quiz_session', {
      p_mode: 'mock_exam',
      p_subject_id: subjectId,
      p_topic_id: topicId,
      p_question_ids: questionIds,
    })

    expect(error).not.toBeNull()
    expect(error?.message ?? '').toContain('mode_not_allowed')

    // Positive no-insert assertion: zero quiz_sessions rows were created for
    // this attacker after the test started.
    const { count, error: countError } = await admin
      .from('quiz_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', attackerUserId)
      .gte('created_at', testStartIso)
    expect(countError).toBeNull()
    expect(count).toBe(0)
  })

  test('Attack 2 — internal_exam mode is rejected before any INSERT', async () => {
    const { error } = await attackerClient.rpc('start_quiz_session', {
      p_mode: 'internal_exam',
      p_subject_id: subjectId,
      p_topic_id: topicId,
      p_question_ids: questionIds,
    })

    expect(error).not.toBeNull()
    expect(error?.message ?? '').toContain('mode_not_allowed')

    // Positive no-insert assertion: zero quiz_sessions rows were created for
    // this attacker after the test started.
    const { count, error: countError } = await admin
      .from('quiz_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', attackerUserId)
      .gte('created_at', testStartIso)
    expect(countError).toBeNull()
    expect(count).toBe(0)
  })

  // Attack 3 sends p_mode as an EXPLICIT JSON null (not an omitted argument).
  // Omitting the argument would be rejected by PostgREST at the HTTP layer
  // before the function runs — a different code path. Explicit null reaches
  // the SQL function, which without the `IS NULL OR` guard would proceed past
  // the active-user gate (Postgres 3-valued logic: `NULL NOT IN (...)`
  // evaluates to NULL, and `IF NULL THEN` is false). The mode-whitelist guard
  // must reject NULL with the same `mode_not_allowed` symbol as exam modes,
  // so an attacker cannot distinguish "mode rejected" from "auth passed,
  // failed at INSERT" via error string.
  test('Attack 3 — explicit-null mode is rejected before the active-user gate', async () => {
    const { error } = await attackerClient.rpc('start_quiz_session', {
      p_mode: null as unknown as string,
      p_subject_id: subjectId,
      p_topic_id: topicId,
      p_question_ids: questionIds,
    })

    expect(error).not.toBeNull()
    expect(error?.message ?? '').toContain('mode_not_allowed')

    const { count, error: countError } = await admin
      .from('quiz_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', attackerUserId)
      .gte('created_at', testStartIso)
    expect(countError).toBeNull()
    expect(count).toBe(0)
  })

  // ── Vector R: p_question_ids array-length cap (issue #275) ────────────────
  //
  // Attack 4: send 501 distinct UUIDs in p_question_ids, bypassing the Zod
  // layer (which caps at 500 but only fires when called through the Server
  // Action). Without a DB-level guard the RPC proceeds to unnest + DISTINCT +
  // JOIN — O(N) work per call with no upper bound. Migration 086 adds an O(1)
  // guard that fires before those operations.
  //
  // Non-vacuous design:
  // - 501-id call: must return too_many_questions.
  // - 500-id call: must NOT return too_many_questions (boundary is inclusive).
  //   The 500-id call will proceed past the length guard and fail at
  //   invalid_question_ids (the UUIDs are random and will not resolve to real
  //   questions), which is the expected behaviour — it proves the length guard
  //   did not fire on a 500-element array.
  test('Attack 4 — 501 question IDs rejected with too_many_questions before unnest', async () => {
    // Generate 501 distinct random UUIDs. These do not exist in the DB; the
    // RPC must raise before it reaches the JOIN that would detect that.
    const ids501 = Array.from({ length: 501 }, () => crypto.randomUUID())

    const { error } = await attackerClient.rpc('start_quiz_session', {
      p_mode: 'quick_quiz',
      p_subject_id: subjectId,
      p_topic_id: topicId,
      p_question_ids: ids501,
    })

    expect(error).not.toBeNull()
    expect(error?.message ?? '').toContain('too_many_questions')

    // Positive no-insert assertion: the guard fired before any INSERT.
    const { count, error: countError } = await admin
      .from('quiz_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', attackerUserId)
      .gte('created_at', testStartIso)
    expect(countError).toBeNull()
    expect(count).toBe(0)
  })

  test('Boundary — 500 question IDs pass the length guard (fail later at invalid_question_ids)', async () => {
    // Generate exactly 500 distinct random UUIDs. The length guard must NOT
    // fire; the call proceeds to the unnest/JOIN validation and fails with
    // invalid_question_ids because none of these UUIDs exist in the DB.
    const ids500 = Array.from({ length: 500 }, () => crypto.randomUUID())

    const { error } = await attackerClient.rpc('start_quiz_session', {
      p_mode: 'quick_quiz',
      p_subject_id: subjectId,
      p_topic_id: topicId,
      p_question_ids: ids500,
    })

    // The call must fail (random UUIDs won't resolve), but NOT with
    // too_many_questions — that would mean the cap incorrectly rejected a
    // valid-length array. Positively assert the downstream guard fired
    // (invalid_question_ids) so the boundary test proves the call passed the cap
    // and reached membership validation, not that it failed for an unrelated reason.
    expect(error).not.toBeNull()
    expect(error?.message ?? '').toContain('invalid_question_ids')
    expect(error?.message ?? '').not.toContain('too_many_questions')
  })
})
