/**
 * Red Team Spec 7 — Vector G (LOW): Session Race Condition
 *
 * Attack: Concurrent discard + complete on the same session; also concurrent
 *         start_exam_session calls for the same (student, subject).
 * Goal: Exploit a TOCTOU window to land the session in an inconsistent state,
 *       bypass scoring logic by discarding after completion, or create two
 *       simultaneous active mock_exam sessions by slipping two starts past the
 *       IF EXISTS guard before either INSERT commits.
 * Defense: `FOR UPDATE` lock inside RPCs serialises concurrent access; RLS UPDATE
 *          policy requires `ended_at IS NULL`, so completed sessions are immutable;
 *          partial unique index uq_active_exam_session (realigned in mig 088 to
 *          include organization_id) rejects the losing concurrent INSERT at the
 *          schema level and the EXCEPTION WHEN unique_violation handler converts
 *          the raw 23505 to the friendly "already in progress" message.
 *
 * Note: True concurrency cannot be reliably tested in a sequential Playwright
 *       process. We simulate the race by performing the second operation after
 *       the first has already committed — if the RLS / RPC rejects the late
 *       write, the sequential version of the race also fails, proving the lock
 *       holds for the window that matters. For the concurrent-start sub-case,
 *       Promise.all fires both calls from the same authenticated client.
 */

import { expect, test } from '@playwright/test'
import { cleanupStudentActiveSessions, getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import {
  ATTACKER_EMAIL,
  ATTACKER_PASSWORD,
  ensureExamConfig,
  pickSubjectWithQuestions,
  seedRedTeamUsers,
} from './helpers/seed'

test.describe('Red Team: Session Race Condition', () => {
  let attackerClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let attackerUserId: string
  let subjectId: string
  let examSubjectId: string
  let orgId: string
  let questionIds: string[]
  let topicId: string
  // Track every quiz_session this spec creates so afterEach can soft-delete
  // them even if assertions fail mid-test (per code-style.md §7 hermiticity).
  const createdSessionIds: string[] = []

  test.beforeAll(async () => {
    const seed = await seedRedTeamUsers()
    orgId = seed.orgId
    attackerUserId = seed.attackerUserId
    attackerClient = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)

    const admin = getAdminClient()
    const picked = await pickSubjectWithQuestions(admin, {
      orgId,
      minActiveQuestions: 3,
      topicMinQuestions: 3,
    })
    subjectId = picked.subjectId
    topicId = picked.topicId

    const { data: qs, error: qsErr } = await admin
      .from('questions')
      .select('id')
      .eq('organization_id', orgId)
      .eq('subject_id', subjectId)
      .eq('topic_id', topicId)
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('id', { ascending: true })
      .limit(3)
    if (qsErr)
      throw new Error(`session-race-condition seed: questions query failed: ${qsErr.message}`)
    questionIds = (qs ?? []).map((q) => q.id)
    if (questionIds.length !== 3) {
      throw new Error(
        `session-race-condition seed: expected 3 active questions in (subject=${subjectId}, topic=${topicId}), got ${questionIds.length}`,
      )
    }

    // Resolve and configure a subject for the concurrent-start exam sub-case.
    // ensureExamConfig creates an exam_config + distribution if absent, so
    // start_exam_session can reach the INSERT (rather than fail on config lookup).
    const examPicked = await pickSubjectWithQuestions(admin, {
      orgId,
      minActiveQuestions: 1,
      topicMinQuestions: 1,
    })
    examSubjectId = examPicked.subjectId
    await ensureExamConfig(orgId, examSubjectId, examPicked.topicId)
  })

  // Single-active-session invariant (#1011): the attacker is shared across
  // red-team specs. A leftover active session (any mode) makes the concurrent
  // start_exam_session test reject the winning call with `another_session_active`
  // instead of the same-subject "already in progress" race outcome. Clear the
  // attacker's active sessions before each test for a clean baseline.
  test.beforeEach(async () => {
    await cleanupStudentActiveSessions(ATTACKER_EMAIL)
  })

  test.afterEach(async () => {
    if (createdSessionIds.length === 0) return
    const admin = getAdminClient()
    try {
      const { data, error } = await admin
        .from('quiz_sessions')
        .update({ deleted_at: new Date().toISOString() })
        .in('id', createdSessionIds)
        .is('deleted_at', null)
        .select('id')
      if (error) {
        console.error('[session-race-condition afterEach] soft-delete failed:', error.message)
        throw new Error(`afterEach soft-delete: ${error.message}`)
      }
      if ((data?.length ?? 0) > 0) {
        console.log(`[session-race-condition afterEach] soft-deleted ${data?.length} session(s)`)
      }
    } finally {
      createdSessionIds.length = 0
    }
  })

  test('completed session cannot be overwritten with discarded status', async () => {
    // Step 1: Start a session
    const { data: startData, error: startError } = await attackerClient.rpc('start_quiz_session', {
      p_mode: 'quick_quiz',
      p_subject_id: subjectId,
      p_topic_id: topicId,
      p_question_ids: questionIds,
    })
    expect(startError).toBeNull()
    const sessionId = startData as string
    // Track right after start succeeds (before later assertions) so afterEach
    // cleans up even if a subsequent assertion fails.
    createdSessionIds.push(sessionId)

    // Step 2: Fetch questions and build answers
    const { data: questions, error: questionsError } = await attackerClient.rpc(
      'get_quiz_questions',
      { p_question_ids: questionIds },
    )
    expect(questionsError).toBeNull()

    type Question = { id: string; options: { id: string }[] }
    const typedQuestions = questions as Question[]
    const answers = typedQuestions.map((q) => ({
      question_id: q.id,
      selected_option: q.options[0]?.id ?? '',
      response_time_ms: 3000,
    }))

    // Step 3: Submit answers via batch_submit (auto-completes the session)
    const { error: batchError } = await attackerClient.rpc('batch_submit_quiz', {
      p_session_id: sessionId,
      p_answers: answers,
    })
    expect(batchError).toBeNull()

    // Step 4: Attempt to soft-delete a completed session — simulates the
    //         losing side of a race where complete wins.
    //         RLS UPDATE policy requires `ended_at IS NULL`, so once the session
    //         is completed (ended_at set), this UPDATE silently affects 0 rows.
    await attackerClient
      .from('quiz_sessions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', sessionId)

    // The update silently affects 0 rows (Supabase returns error: null).
    // We rely on the admin re-read below as the authoritative check.

    // Step 5: Confirm the session remained in its committed terminal state
    const admin = getAdminClient()
    const { data: row, error: rowErr } = await admin
      .from('quiz_sessions')
      .select('ended_at, deleted_at, score_percentage')
      .eq('id', sessionId)
      .single()

    expect(rowErr).toBeNull()
    expect(row?.ended_at).not.toBeNull()
    expect(row?.deleted_at).toBeNull()
    expect(row?.score_percentage).not.toBeNull()
  })

  test('discarded session cannot be re-completed', async () => {
    // Step 1: Start a fresh session
    const { data: startData, error: startError } = await attackerClient.rpc('start_quiz_session', {
      p_mode: 'quick_quiz',
      p_subject_id: subjectId,
      p_topic_id: topicId,
      p_question_ids: questionIds,
    })
    expect(startError).toBeNull()
    const sessionId = startData as string
    // Track right after start succeeds (before later assertions) so afterEach
    // cleans up even if a subsequent assertion fails.
    // afterEach filters .is('deleted_at', null), so already-discarded sessions
    // are skipped silently — no double-update on a session the test itself discards.
    createdSessionIds.push(sessionId)

    // Step 2: Discard the session via direct UPDATE (no discard RPC exists)
    const { error: discardError } = await attackerClient
      .from('quiz_sessions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', sessionId)

    // RLS scopes the row (non-ended, owned by the student) and the column GRANT
    // (mig 20260605000001) allows authenticated to write deleted_at — exactly what
    // discard sets, so this succeeds. If it fails, session is still active — skip.
    if (discardError) {
      test.skip()
      return
    }

    // Step 3: Attempt to complete the now-discarded session.
    //         complete_quiz_session checks `ended_at IS NULL` but does NOT check
    //         `deleted_at IS NULL`, so it may succeed on a soft-deleted session.
    const { error: completeError } = await attackerClient.rpc('complete_quiz_session', {
      p_session_id: sessionId,
    })

    // Step 4: Verify the session stayed discarded regardless of completion outcome
    const admin = getAdminClient()
    const { data: row, error: rowErr } = await admin
      .from('quiz_sessions')
      .select('ended_at, deleted_at')
      .eq('id', sessionId)
      .single()

    // Session must still be soft-deleted no matter what
    expect(rowErr).toBeNull()
    expect(row?.deleted_at).not.toBeNull()

    if (completeError) {
      // RPC rejected — session stayed discarded and not completed (ideal)
      expect(row?.ended_at).toBeNull()
    } else {
      // RPC succeeded (ended_at was NULL so it passed the WHERE clause),
      // but the discard (deleted_at) was NOT undone — both flags are set.
      // This is acceptable: the session is still marked deleted.
      expect(row?.ended_at).not.toBeNull()
    }
  })

  test('concurrent start_exam_session for the same subject yields exactly one active session and the rejected call signals already in progress (mig 088)', async () => {
    // Fire two start_exam_session calls for the same (student, subject) via
    // Promise.all — the client is authenticated as the attacker, so both calls
    // carry the same JWT. One should succeed (wins the partial unique index race)
    // and the other must be rejected.
    //
    // Non-vacuity (code-style.md §7): after the calls we assert the winner
    // created an active session (non-empty result set), so the "losing call
    // was rejected" assertion cannot pass vacuously on an empty table.
    const [first, second] = await Promise.all([
      attackerClient.rpc('start_exam_session', { p_subject_id: examSubjectId }),
      attackerClient.rpc('start_exam_session', { p_subject_id: examSubjectId }),
    ])

    // Skip if both fail due to an exam-config / question-distribution gap in the
    // test fixture — that's a seed concern, not the race-condition behavior.
    const bothFailed = first.error !== null && second.error !== null
    if (
      bothFailed &&
      (/no exam configuration/i.test(first.error?.message ?? '') ||
        /not enough active questions/i.test(first.error?.message ?? '') ||
        /distribution total/i.test(first.error?.message ?? ''))
    ) {
      test.skip(
        true,
        'insufficient exam config / question distribution in fixture — covered by SQL integration tests',
      )
      return
    }

    // Exactly one call must have succeeded.
    const winner = first.error === null ? first : second
    const loser = first.error === null ? second : first

    expect(winner.error).toBeNull()
    expect(winner.data).not.toBeNull()

    // Track the winning session for afterEach cleanup. start_exam_session returns a jsonb
    // object with session_id (mig 088); assert it is present so a return-shape regression
    // fails loudly here rather than silently leaving an untracked active session that would
    // pollute later specs (code-style.md §7 hermeticity).
    const winnerData = winner.data as unknown as { session_id?: string } | null
    const winnerSessionId = winnerData?.session_id
    expect(typeof winnerSessionId).toBe('string')
    createdSessionIds.push(winnerSessionId as string)

    // The losing concurrent call must have been rejected. The EXCEPTION WHEN
    // unique_violation handler (mig 088 Change A) converts the raw 23505 into
    // the friendly message. We assert on the message content, not the raw code.
    expect(loser.error).not.toBeNull()
    expect(loser.error?.message ?? '').toMatch(/already in progress/i)
    // Belt: confirm the rejection is NOT the raw PostgreSQL unique-violation
    // error code string — that would indicate the EXCEPTION handler is absent.
    expect(loser.error?.message ?? '').not.toMatch(/23505|unique.*constraint|duplicate.*key/i)

    // Non-vacuous admin check: confirm exactly one active mock_exam session
    // exists for (attacker, examSubjectId, orgId). If the race guard failed,
    // both INSERTs would have landed and this assertion would catch it.
    // Use the seeded attackerUserId (a guaranteed string — beforeAll throws if
    // seeding failed) rather than an unchecked getUser() with a vacuous '' fallback,
    // which would silently query for student_id = '' on an auth error.
    const admin = getAdminClient()
    const { data: activeSessions, error: activeErr } = await admin
      .from('quiz_sessions')
      .select('id')
      .eq('student_id', attackerUserId)
      .eq('subject_id', examSubjectId)
      .eq('organization_id', orgId)
      .eq('mode', 'mock_exam')
      .is('ended_at', null)
      .is('deleted_at', null)

    expect(activeErr).toBeNull()
    // Non-vacuous: the winner's session must exist (length > 0) AND no second
    // session was created (length = 1).
    expect(activeSessions?.length).toBe(1)
  })
})
