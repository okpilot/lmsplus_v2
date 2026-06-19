/**
 * Red Team Spec 6 — Vector J (LOW): Session Replay
 *
 * Attack: Replay `batch_submit_quiz` on an already-completed session.
 * Goal: Inflate score by submitting a second (better) set of answers after completion.
 * Defense: RPC is idempotent — completed sessions return cached results without re-processing; score cannot be inflated.
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

test.describe('Red Team: Session Replay', () => {
  let attackerClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let attackerUserId: string
  let sessionId: string
  let subjectId: string
  let originalScore: number
  let questionIds: string[]
  let topicId: string

  const createdSessionIds = new Set<string>()

  test.beforeAll(async () => {
    const { orgId, attackerUserId: uid } = await seedRedTeamUsers()
    attackerUserId = uid
    attackerClient = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)

    // Resolve a real subject_id and fetch question IDs for session creation
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
    if (qsErr) throw new Error(`session-replay seed: questions query failed: ${qsErr.message}`)
    questionIds = (qs ?? []).map((q) => q.id)
    if (questionIds.length !== 3) {
      throw new Error(
        `session-replay seed: expected 3 active questions in (subject=${subjectId}, topic=${topicId}), got ${questionIds.length}`,
      )
    }
  })

  test.afterEach(async () => {
    if (createdSessionIds.size === 0) return
    const admin = getAdminClient()
    try {
      const { data, error } = await admin
        .from('quiz_sessions')
        .update({ deleted_at: new Date().toISOString() })
        .in('id', Array.from(createdSessionIds))
        .is('deleted_at', null)
        .select('id')
      if (error) {
        console.error('[session-replay afterEach] soft-delete failed:', error.message)
        throw new Error(`afterEach soft-delete: ${error.message}`)
      }
      if ((data?.length ?? 0) > 0) {
        console.log(`[session-replay] soft-deleted ${data?.length} session(s)`)
      }
    } finally {
      createdSessionIds.clear()
    }
  })

  // Build batch_submit answers for all `questionIds` via the service-role client
  // (reads options even for soft-deleted questions). `pickLast` selects the last
  // option instead of the first, to vary the answer set across concurrent calls.
  async function buildAnswers(pickLast: boolean): Promise<unknown[]> {
    const admin = getAdminClient()
    const { data: rows, error } = await admin
      .from('questions')
      .select('id, options')
      .in('id', questionIds)
    if (error || !rows) throw new Error(`buildAnswers: ${error?.message}`)
    // Fail fast with a clear cause if a question went missing (e.g. fixture
    // drift / hard-delete) — otherwise the answer carries selected_option: ''
    // and the test fails later with an opaque batch_submit rejection.
    if (rows.length !== questionIds.length) {
      throw new Error(`buildAnswers: expected ${questionIds.length} questions, got ${rows.length}`)
    }
    return questionIds.map((qid) => {
      // Runtime guard before the cast (code-style.md §5): options is JSONB, so
      // narrow to an array before indexing rather than asserting the shape.
      const raw = rows.find((r) => r.id === qid)?.options
      const opts = Array.isArray(raw) ? (raw as { id: string }[]) : []
      const opt = pickLast ? opts[opts.length - 1] : opts[0]
      return { question_id: qid, selected_option: opt?.id ?? '', response_time_ms: 2000 }
    })
  }

  // Build a fully-correct or fully-incorrect answer set by reading each question's
  // `correct` flag via the service-role client (the attacker JWT never sees it).
  // Used to seed two sessions with deterministically distinct grades (100 vs 0) so a
  // replay regression that returns a hardcoded payload fails at least one fixture (§7).
  async function buildGradedAnswers(allCorrect: boolean): Promise<unknown[]> {
    const admin = getAdminClient()
    const { data: rows, error } = await admin
      .from('questions')
      .select('id, options')
      .in('id', questionIds)
    if (error || !rows) throw new Error(`buildGradedAnswers: ${error?.message}`)
    if (rows.length !== questionIds.length) {
      throw new Error(
        `buildGradedAnswers: expected ${questionIds.length} questions, got ${rows.length}`,
      )
    }
    return questionIds.map((qid) => {
      const raw = rows.find((r) => r.id === qid)?.options
      const opts = Array.isArray(raw) ? (raw as { id: string; correct?: boolean }[]) : []
      const chosen = allCorrect
        ? opts.find((o) => o.correct === true)
        : opts.find((o) => !o.correct)
      if (!chosen) {
        throw new Error(
          `buildGradedAnswers: question ${qid} has no ${allCorrect ? 'correct' : 'incorrect'} option`,
        )
      }
      return { question_id: qid, selected_option: chosen.id, response_time_ms: 3000 }
    })
  }

  test('rejects batch_submit_quiz replay on completed session', async () => {
    // Step 1: Start a quiz session
    const { data: startData, error: startError } = await attackerClient.rpc('start_quiz_session', {
      p_mode: 'quick_quiz',
      p_subject_id: subjectId,
      p_topic_id: topicId,
      p_question_ids: questionIds,
    })
    expect(startError).toBeNull()
    expect(startData).toBeTruthy()
    sessionId = startData as string
    createdSessionIds.add(sessionId)

    // Step 2: Fetch questions for this session
    const { data: questions, error: questionsError } = await attackerClient.rpc(
      'get_quiz_questions',
      { p_question_ids: questionIds },
    )
    expect(questionsError).toBeNull()
    expect(Array.isArray(questions)).toBe(true)
    expect((questions as unknown[]).length).toBeGreaterThan(0)

    type Question = { id: string; options: { id: string }[] }
    const typedQuestions = questions as Question[]

    // Step 3: Build first-round answers (pick first option for each question)
    const firstAnswers = typedQuestions.map((q) => ({
      question_id: q.id,
      selected_option: q.options[0]?.id ?? '',
      response_time_ms: 5000,
    }))

    // Step 4: Submit answers via batch_submit (auto-completes the session)
    const { data: batchData, error: batchError } = await attackerClient.rpc('batch_submit_quiz', {
      p_session_id: sessionId,
      p_answers: firstAnswers,
    })
    expect(batchError).toBeNull()
    originalScore = (batchData as { score_percentage?: number })?.score_percentage ?? 0
    expect(typeof originalScore).toBe('number')
    expect(originalScore).toBeGreaterThanOrEqual(0)

    // Step 5: Replay batch_submit_quiz with a new set of answers on the completed session
    const replayAnswers = typedQuestions.map((q) => ({
      question_id: q.id,
      selected_option: q.options[q.options.length - 1]?.id ?? '', // pick last option instead
      response_time_ms: 1000,
    }))

    const { data: replayData, error: replayError } = await attackerClient.rpc('batch_submit_quiz', {
      p_session_id: sessionId,
      p_answers: replayAnswers,
    })

    // Step 6: Defense is idempotency — replay returns cached results, not an error
    expect(replayError).toBeNull()

    // Step 7: Verify score in DB did not change
    const admin = getAdminClient()
    const { data: sessionRow, error: sessionRowErr } = await admin
      .from('quiz_sessions')
      .select('score_percentage, ended_at')
      .eq('id', sessionId)
      .single()

    expect(sessionRowErr).toBeNull()
    expect(sessionRow?.ended_at).not.toBeNull()
    expect(sessionRow?.score_percentage).toBe(originalScore)

    // Idempotent replay returns cached data with same score
    expect(replayData).not.toBeNull()
    const replayScore = (replayData as { score_percentage?: number })?.score_percentage ?? -1
    expect(replayScore).toBe(originalScore)
  })

  test('#256: a question soft-deleted mid-session is still scored (write-once question_ids)', async () => {
    const admin = getAdminClient()
    const targetQuestionId = questionIds[1]
    if (!targetQuestionId) throw new Error('#256: expected a second question id')

    const { data: startData, error: startError } = await attackerClient.rpc('start_quiz_session', {
      p_mode: 'quick_quiz',
      p_subject_id: subjectId,
      p_topic_id: topicId,
      p_question_ids: questionIds,
    })
    expect(startError).toBeNull()
    const sid = startData as string
    createdSessionIds.add(sid)

    const answers = await buildAnswers(false)

    let restoreError: string | null = null
    try {
      // Soft-delete one of the session's questions WHILE the session is active.
      // Inside the try so the finally always restores — a transport error after
      // the server commits the soft-delete (client sees an error but the row IS
      // deleted) would otherwise strand the question deleted for downstream specs.
      const { data: delData, error: delErr } = await admin
        .from('questions')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', targetQuestionId)
        .select('id')
      expect(delErr).toBeNull()
      // Non-vacuity (code-style.md §5): prove the soft-delete actually hit the
      // row, so the count === 3 assertion below genuinely exercises the §15
      // carve-out (scoring a soft-deleted question) rather than passing for the
      // same reason as the plain replay test above.
      expect(delData?.length).toBe(1)

      // batch_submit reads questions via the immutable config.question_ids
      // snapshot (no deleted_at filter — security.md §15 carve-out), so the
      // mid-session soft-deleted question is still scored: all 3 answers land.
      const { data: batchData, error: batchError } = await attackerClient.rpc('batch_submit_quiz', {
        p_session_id: sid,
        p_answers: answers,
      })
      expect(batchError).toBeNull()
      expect(batchData).not.toBeNull()

      const { count, error: countErr } = await admin
        .from('quiz_session_answers')
        .select('id', { count: 'exact', head: true })
        .eq('session_id', sid)
      expect(countErr).toBeNull()
      expect(count).toBe(3)
    } finally {
      // Restore the borrowed question for downstream specs.
      const { data: restoreData, error } = await admin
        .from('questions')
        .update({ deleted_at: null })
        .eq('id', targetQuestionId)
        .select('id')
      if (error) {
        restoreError = error.message
      } else if ((restoreData?.length ?? 0) === 0) {
        restoreError = 'restore matched no rows'
      }
    }
    expect(restoreError).toBeNull()
  })

  test('#257: concurrent batch_submit on the same session ends it exactly once', async () => {
    const admin = getAdminClient()
    const { data: startData, error: startError } = await attackerClient.rpc('start_quiz_session', {
      p_mode: 'quick_quiz',
      p_subject_id: subjectId,
      p_topic_id: topicId,
      p_question_ids: questionIds,
    })
    expect(startError).toBeNull()
    const sid = startData as string
    createdSessionIds.add(sid)

    const [answersA, answersB] = await Promise.all([buildAnswers(false), buildAnswers(true)])
    // Non-vacuity (code-style.md §5): the attack models a second caller submitting a
    // *different* (potentially better) answer set to inflate the score. If the two
    // sets were identical the idempotency checks below would pass trivially. pickLast
    // diverges from pickFirst only when a question has ≥2 options — assert the sets
    // actually differ so a single-option fixture drift fails loudly here, not silently.
    expect(answersA).not.toEqual(answersB)

    // Two concurrent submissions with different answer sets. The RPC's FOR UPDATE
    // lock serialises them: one scores and ends the session, the other hits the
    // idempotent path and returns the same cached score — no double-scoring.
    const [r1, r2] = await Promise.all([
      attackerClient.rpc('batch_submit_quiz', { p_session_id: sid, p_answers: answersA }),
      attackerClient.rpc('batch_submit_quiz', { p_session_id: sid, p_answers: answersB }),
    ])
    expect(r1.error).toBeNull()
    expect(r2.error).toBeNull()

    // Both responses must satisfy the full batch_submit_quiz output contract (latest
    // def: migration 20260601000001). The scoring path and the idempotent cached path
    // both return the same deterministic scalars. Asserting the whole scalar contract —
    // not just score_percentage — catches an idempotent-path regression that returns a
    // matching score but a divergent correct_count / answered_count / passed. We compare
    // scalars only, NOT the `results` array: its element order differs between the
    // freshly-scored path and the rebuilt-from-storage cached path, so a deep equal
    // would be flaky.
    type BatchScalars = {
      total_questions?: number
      answered_count?: number
      correct_count?: number
      score_percentage?: number
      passed?: boolean | null
    }
    const d1 = r1.data as BatchScalars
    const d2 = r2.data as BatchScalars
    expect(d1).toBeTruthy()
    expect(d2).toBeTruthy()
    for (const d of [d1, d2]) {
      expect(d.total_questions).toBe(3)
      expect(d.answered_count).toBe(3)
      expect(typeof d.correct_count).toBe('number')
      expect(typeof d.score_percentage).toBe('number')
      // quick_quiz is a study mode: batch_submit_quiz only sets `passed` for
      // mock_exam / internal_exam (migration 20260601000001, lines 245-253);
      // for quick_quiz it stays the fresh session's NULL. Pin that exact
      // contract — a regression that began grading quick_quiz would fail here.
      expect(d.passed).toBeNull()
    }
    // Idempotency: whichever caller won the FOR UPDATE race scored; the other returned
    // that cached result. Both responses must carry identical deterministic scalars
    // regardless of which set actually scored.
    expect(d2.score_percentage).toBe(d1.score_percentage)
    expect(d2.correct_count).toBe(d1.correct_count)
    expect(d2.answered_count).toBe(d1.answered_count)
    expect(d2.passed).toBe(d1.passed)

    const { data: row, error: rowErr } = await admin
      .from('quiz_sessions')
      .select('ended_at')
      .eq('id', sid)
      .single()
    expect(rowErr).toBeNull()
    expect(row?.ended_at).not.toBeNull()

    // Exactly 3 answer rows — the idempotent second caller inserted nothing.
    const { count, error: countErr } = await admin
      .from('quiz_session_answers')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', sid)
    expect(countErr).toBeNull()
    expect(count).toBe(3)
  })

  // Vector BH — soft-deleted-user replay (issue #603)
  // Gate: mig 20260430000012_active_user_gate_batch_submit.sql
  // The user-not-found gate fires before the cached-results branch, so a
  // soft-deleted user's still-valid JWT cannot replay a completed session.
  test('rejects batch_submit_quiz replay when the submitting user has been soft-deleted', async () => {
    const admin = getAdminClient()

    // Step 1: Start a quick_quiz session as the attacker.
    const { data: startData, error: startError } = await attackerClient.rpc('start_quiz_session', {
      p_mode: 'quick_quiz',
      p_subject_id: subjectId,
      p_topic_id: topicId,
      p_question_ids: questionIds,
    })
    expect(startError).toBeNull()
    expect(startData).toBeTruthy()
    const bhSessionId = startData as string
    createdSessionIds.add(bhSessionId)

    // Step 2: Complete the session via batch_submit so it has ended_at + score.
    const answers = await buildAnswers(false)
    const { data: completeData, error: completeError } = await attackerClient.rpc(
      'batch_submit_quiz',
      { p_session_id: bhSessionId, p_answers: answers },
    )
    expect(completeError).toBeNull()

    // Non-vacuity (§7): confirm the session is genuinely completed before soft-deleting.
    // A vacuous deleted-user test that passes only because the session was never ended
    // would not exercise the user-gate-before-cached-results ordering.
    const { data: sessionRow, error: sessionRowErr } = await admin
      .from('quiz_sessions')
      .select('ended_at, score_percentage')
      .eq('id', bhSessionId)
      .single()
    expect(sessionRowErr).toBeNull()
    expect(sessionRow?.ended_at).not.toBeNull()
    const preReplayEndedAt = sessionRow?.ended_at as string
    const completedScore = Number(sessionRow?.score_percentage ?? -1)
    expect(completedScore).toBeGreaterThanOrEqual(0)
    expect(completeData).not.toBeNull()

    // Capture the pre-replay answer count so we can assert it is unchanged after
    // the rejected replay (a regression that inserted answers before raising would
    // silently pass without this check — §7 non-vacuous state-flip assertion).
    const { count: preReplayAnswerCount, error: preReplayCountErr } = await admin
      .from('quiz_session_answers')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', bhSessionId)
    expect(preReplayCountErr).toBeNull()
    expect(typeof preReplayAnswerCount).toBe('number')

    // Step 3: Admin soft-deletes the attacker user.
    // Use a finally block so the user is always restored — even if an assertion
    // mid-test fails (noUnsafeFinally: assertions happen OUTSIDE the finally).
    let restoreError: string | null = null
    let replayError: { message: string } | null = null
    let replayData: unknown

    try {
      const { data: delData, error: delErr } = await admin
        .from('users')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', attackerUserId)
        .is('deleted_at', null)
        .select('id')
      expect(delErr).toBeNull()
      // Non-vacuity (§7): assert exactly 1 row was soft-deleted so the gate
      // below genuinely exercises the deleted-user path.
      expect(delData?.length).toBe(1)

      // Step 4: Replay batch_submit_quiz with the attacker's still-valid JWT.
      // p_answers: [] — the user-not-found gate fires before the empty-array
      // check, so the error is 'user not found or inactive', not the array error.
      const result = await attackerClient.rpc('batch_submit_quiz', {
        p_session_id: bhSessionId,
        p_answers: [],
      })
      replayError = result.error
      replayData = result.data
    } finally {
      // Restore the attacker user so downstream specs are not affected.
      const { data: restoreData, error: restoreErr } = await admin
        .from('users')
        .update({ deleted_at: null })
        .eq('id', attackerUserId)
        .select('id')
      if (restoreErr) {
        restoreError = restoreErr.message
      } else if ((restoreData?.length ?? 0) === 0) {
        restoreError = 'restore matched no rows'
      }
    }

    // Step 5: Assert the defense fired correctly (assertions outside finally).
    expect(restoreError).toBeNull()
    expect(replayError).not.toBeNull()
    expect(replayError?.message).toMatch(/user not found or inactive/i)

    // No leaked answer data — the RPC must not return correct_option_id or
    // explanation_text when the user gate fires.
    const payload = replayData as Record<string, unknown> | null
    expect(payload).toBeNull()

    // Step 6: Re-read the session and answer count after the rejected replay to
    // confirm the completed row is UNCHANGED (§7 non-vacuous state-flip check).
    // A regression that mutates ended_at / score_percentage or inserts extra
    // quiz_session_answers before raising would still pass the error assertion
    // above but will fail here.
    const { data: postReplayRow, error: postReplayRowErr } = await admin
      .from('quiz_sessions')
      .select('ended_at, score_percentage')
      .eq('id', bhSessionId)
      .single()
    expect(postReplayRowErr).toBeNull()
    // ended_at must still be non-null and unchanged after the rejected replay
    expect(postReplayRow?.ended_at).not.toBeNull()
    expect(postReplayRow?.ended_at).toBe(preReplayEndedAt)
    // score_percentage must be unchanged after the rejected replay
    expect(Number(postReplayRow?.score_percentage ?? -1)).toBe(completedScore)

    // quiz_session_answers count must be unchanged after the rejected replay
    const { count: postReplayAnswerCount, error: postReplayCountErr } = await admin
      .from('quiz_session_answers')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', bhSessionId)
    expect(postReplayCountErr).toBeNull()
    expect(postReplayAnswerCount).toBe(preReplayAnswerCount)
  })

  // #869: the idempotent-replay branch (mig 095c, L73–99) re-reads the stored grade
  // (correct_count / score_percentage / passed) and recomputes answered_count, returning
  // them without an `expired` key. Assert the replay payload equals the first submit's
  // across TWO distinct-grade fixtures (all-correct → 100, all-wrong → 0). A regression
  // that returned a hardcoded payload would match at most one fixture, so running both
  // makes the assertion non-vacuous (code-style.md §7 — full output contract / re-read path).
  test('replay returns the stored grade payload, matching the first submit across distinct grades', async () => {
    type BatchPayload = {
      results?: unknown
      total_questions?: number
      answered_count?: number
      correct_count?: number
      score_percentage?: number
      passed?: boolean | null
      expired?: boolean
    }

    async function submitAndReplay(allCorrect: boolean): Promise<BatchPayload> {
      const { data: startData, error: startError } = await attackerClient.rpc(
        'start_quiz_session',
        {
          p_mode: 'quick_quiz',
          p_subject_id: subjectId,
          p_topic_id: topicId,
          p_question_ids: questionIds,
        },
      )
      expect(startError).toBeNull()
      const sid = startData as string
      createdSessionIds.add(sid)

      const answers = await buildGradedAnswers(allCorrect)
      const { data: firstData, error: firstError } = await attackerClient.rpc('batch_submit_quiz', {
        p_session_id: sid,
        p_answers: answers,
      })
      expect(firstError).toBeNull()
      const first = firstData as BatchPayload

      // Replay on the now-completed session with a different (last-option) answer set —
      // the idempotent branch must ignore it and return the stored grade unchanged.
      const replayAnswers = await buildAnswers(true)
      const { data: replayData, error: replayError } = await attackerClient.rpc(
        'batch_submit_quiz',
        {
          p_session_id: sid,
          p_answers: replayAnswers,
        },
      )
      expect(replayError).toBeNull()
      const replay = replayData as BatchPayload

      // Replay payload contract: no `expired` key, results is an array, and every scalar
      // equals the first submit's value (re-read from storage, not recomputed from replay).
      expect(replay.expired).toBeUndefined()
      expect(Array.isArray(replay.results)).toBe(true)
      expect(replay.total_questions).toBe(first.total_questions)
      expect(replay.answered_count).toBe(first.answered_count)
      expect(replay.correct_count).toBe(first.correct_count)
      expect(replay.score_percentage).toBe(first.score_percentage)
      expect(replay.passed).toBe(first.passed)
      return first
    }

    const correctRun = await submitAndReplay(true)
    const wrongRun = await submitAndReplay(false)

    // Non-vacuity (§7): the two fixtures must produce genuinely distinct grades, so a
    // hardcoded-constant replay regression cannot satisfy both runs above.
    expect(correctRun.correct_count).toBe(3)
    expect(correctRun.score_percentage).toBe(100)
    expect(wrongRun.correct_count).toBe(0)
    expect(wrongRun.score_percentage).toBe(0)
    // quick_quiz is a study mode — batch_submit_quiz leaves `passed` NULL (mig 095c L247–257).
    expect(correctRun.passed).toBeNull()
    expect(wrongRun.passed).toBeNull()
  })
})
