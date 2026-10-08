// App-layer integration fixture helpers (#925) — session-dependent test data.
//
// These helpers drive the REAL SECURITY DEFINER RPC chain (start_quiz_session →
// save_quiz_answer × N → finish_quiz_session) AS THE AUTHENTICATED STUDENT.
// The service-role admin client has auth.uid() = null, so calling RPCs via it
// would cause every SECURITY DEFINER RPC to raise "user not found or inactive".
// Every call here must use the studentClient returned by getAuthenticatedClient().
//
// No standalone unit test exists for this file — it is integration-only
// infrastructure: its only valid execution path is against a real Postgres
// instance with real RLS active. It is fully covered by its five integration
// callers (progress, profile, quiz-report, quiz-report-questions, reports),
// the same way seedQuestions / seedReferenceData have no unit tests of their own.
//
// CONTRACT: when subjectId / topicId are non-null, the caller MUST have seeded
// questionIds under that exact subject + topic, or start_quiz_session raises
// invalid_question_ids. Pass null/null for subject/topic when seeding across
// unrelated question pools.
import type { getAuthenticatedClient } from '@/lib/integration-support/harness'

type StudentClient = Awaited<ReturnType<typeof getAuthenticatedClient>>

const SEED_DEVICE = '11111111-1111-4111-8111-111111111111' // practice: no claim, any uuid

/** Save the answer sequence for one session: 'b' (correct) for the first
 *  `correctCount` questions, 'a' (wrong) for the rest. Throws on the first error. */
async function saveAnswerSequence(opts: {
  studentClient: StudentClient
  sessionId: string
  questionIds: string[]
  correctCount: number
}): Promise<void> {
  const { studentClient, sessionId, questionIds, correctCount } = opts
  for (let i = 0; i < questionIds.length; i++) {
    const { error: saveErr } = await studentClient.rpc('save_quiz_answer', {
      p_session_id: sessionId,
      p_question_id: questionIds[i],
      p_answer: { selected_option_id: i < correctCount ? 'b' : 'a' },
      p_time_spent_ms: 2000,
      p_device_id: SEED_DEVICE,
    })
    if (saveErr) {
      throw new Error(`seedCompletedSession save_quiz_answer[${i}]: ${saveErr.message}`)
    }
  }
}

/**
 * Drive the real RPC chain as the authenticated student to produce one
 * completed quiz session.
 *
 * - start_quiz_session   → session id (scalar)
 * - save_quiz_answer × totalCount   ('b' for correct, 'a' for wrong)
 * - finish_quiz_session → object with total_questions, correct_count, score_percentage
 *
 * Returns the DB-rounded scorePercentage so callers build expectations from the
 * actual stored value rather than a JS recomputation that may differ by rounding.
 */
export async function seedCompletedSession(opts: {
  studentClient: StudentClient
  questionIds: string[] // from seedQuestions; correct_option_id === 'b'
  correctCount: number // first N answers 'b' (correct), rest 'a' (wrong)
  totalCount?: number // default questionIds.length; must be <= questionIds.length
  subjectId?: string | null // forwarded to start_quiz_session p_subject_id
  topicId?: string | null // forwarded to p_topic_id
}): Promise<{
  sessionId: string
  totalQuestions: number
  correctCount: number
  scorePercentage: number
}> {
  const { studentClient, questionIds, correctCount } = opts
  const totalCount = opts.totalCount ?? questionIds.length
  if (totalCount > questionIds.length) {
    throw new Error(
      `seedCompletedSession: totalCount (${totalCount}) exceeds questionIds.length (${questionIds.length})`,
    )
  }
  const qIds = questionIds.slice(0, totalCount)

  const { sessionId } = await seedOpenSession({
    studentClient,
    questionIds: qIds,
    subjectId: opts.subjectId ?? null,
    topicId: opts.topicId ?? null,
  })

  await saveAnswerSequence({
    studentClient,
    sessionId,
    questionIds: qIds,
    correctCount,
  })

  const { data: finishData, error: finishErr } = await studentClient.rpc('finish_quiz_session', {
    p_session_id: sessionId,
    p_device_id: SEED_DEVICE,
  })
  if (finishErr) {
    throw new Error(`seedCompletedSession finish_quiz_session: ${finishErr.message}`)
  }

  // finish_quiz_session returns one jsonb object; pair the shape cast with a runtime guard
  // (code-style §5) so a future RPC contract break surfaces as a clear error rather than
  // Number(undefined) → NaN.
  if (
    typeof finishData !== 'object' ||
    finishData === null ||
    Array.isArray(finishData) ||
    !('total_questions' in finishData) ||
    !('correct_count' in finishData) ||
    !('score_percentage' in finishData)
  ) {
    throw new TypeError('seedCompletedSession: finish_quiz_session returned an unexpected shape')
  }
  const { total_questions, correct_count, score_percentage } = finishData as {
    total_questions: number
    correct_count: number
    score_percentage: number | string
  }

  return {
    sessionId,
    totalQuestions: total_questions,
    correctCount: correct_count,
    scorePercentage: Number(score_percentage),
  }
}

/**
 * Drive start_quiz_session as the authenticated student to produce one OPEN
 * (not yet completed) quiz session, for lifecycle tests that act on an
 * in-progress session (submit / check / finish).
 * seedCompletedSession builds on this (then saves + finishes). Same
 * subject/topic CONTRACT as the file header. Returns the session id.
 */
export async function seedOpenSession(opts: {
  studentClient: StudentClient
  questionIds: string[] // from seedQuestions; correct_option_id === 'b'
  subjectId?: string | null // forwarded to start_quiz_session p_subject_id
  topicId?: string | null // forwarded to p_topic_id
}): Promise<{ sessionId: string }> {
  const { studentClient, questionIds } = opts
  const subjectId = opts.subjectId ?? null
  const topicId = opts.topicId ?? null

  // Single-active-session invariant (#1011, uq_one_active_session_per_student): a
  // student may hold at most one active session across all modes, so this
  // start_quiz_session raises `another_session_active` if the student already has
  // an active session. This helper does NOT auto-clear leftover active sessions:
  // a hidden clear would silently mask a test meant to hit `another_session_active`
  // (or one that resumes an existing session). Callers that reuse a student across
  // tests must clear active sessions EXPLICITLY via clearActiveSessions (harness.ts) —
  // typically in an afterEach, the same explicit-call-site pattern
  // start-exam.integration.test.ts uses.
  const { data: sessionId, error: startErr } = await studentClient.rpc('start_quiz_session', {
    p_mode: 'quick_quiz',
    p_subject_id: subjectId,
    p_topic_id: topicId,
    p_question_ids: questionIds,
  })
  if (startErr) throw new Error(`seedOpenSession start_quiz_session: ${startErr.message}`)
  // Runtime type guard (code-style §5): narrow the scalar RPC reply to string (cast
  // unnecessary). Bare `typeof` matches the sibling guards in packages/db __integration__.
  if (typeof sessionId !== 'string') {
    throw new TypeError('seedOpenSession: start_quiz_session returned no/invalid session id')
  }

  return { sessionId }
}

/**
 * Seed multiple completed sessions for the same student, using the same
 * question pool. Returns session IDs in creation order.
 *
 * correctCounts, when provided, must have length === count and overrides the
 * per-session correct answer count so callers can vary scores across sessions.
 * Default: all sessions answer every question correctly.
 */
export async function seedCompletedSessions(opts: {
  studentClient: StudentClient
  questionIds: string[]
  count: number
  correctCounts?: number[] // length must === count when provided
  subjectId?: string | null
  topicId?: string | null
}): Promise<string[]> {
  const { studentClient, questionIds, count } = opts
  const correctCounts =
    opts.correctCounts ?? Array.from({ length: count }, () => questionIds.length)
  if (correctCounts.length !== count) {
    throw new Error(
      `seedCompletedSessions: correctCounts.length (${correctCounts.length}) must equal count (${count})`,
    )
  }

  const sessionIds: string[] = []
  for (let i = 0; i < count; i++) {
    const { sessionId } = await seedCompletedSession({
      studentClient,
      questionIds,
      correctCount: correctCounts[i] ?? questionIds.length,
      subjectId: opts.subjectId ?? null,
      topicId: opts.topicId ?? null,
    })
    sessionIds.push(sessionId)
  }
  return sessionIds
}
