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
  let sessionId: string
  let subjectId: string
  let originalScore: number
  let questionIds: string[]
  let topicId: string

  const createdSessionIds = new Set<string>()

  test.beforeAll(async () => {
    const { orgId } = await seedRedTeamUsers()
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

    const { data: qs } = await admin
      .from('questions')
      .select('id')
      .eq('organization_id', orgId)
      .eq('subject_id', subjectId)
      .eq('topic_id', topicId)
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('id', { ascending: true })
      .limit(3)
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
    const { data: sessionRow } = await admin
      .from('quiz_sessions')
      .select('score_percentage, ended_at')
      .eq('id', sessionId)
      .single()

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

    // Two concurrent submissions with different answer sets. The RPC's FOR UPDATE
    // lock serialises them: one scores and ends the session, the other hits the
    // idempotent path and returns the same cached score — no double-scoring.
    const [r1, r2] = await Promise.all([
      attackerClient.rpc('batch_submit_quiz', { p_session_id: sid, p_answers: answersA }),
      attackerClient.rpc('batch_submit_quiz', { p_session_id: sid, p_answers: answersB }),
    ])
    expect(r1.error).toBeNull()
    expect(r2.error).toBeNull()
    const s1 = (r1.data as { score_percentage?: number })?.score_percentage
    const s2 = (r2.data as { score_percentage?: number })?.score_percentage
    // Both paths (scoring + idempotent) must return a numeric score; asserting
    // typeof on both gives a clear failure if the idempotent path regresses to
    // omitting score_percentage, instead of a confusing `undefined === <n>`.
    expect(typeof s1).toBe('number')
    expect(typeof s2).toBe('number')
    expect(s2).toBe(s1)

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
})
