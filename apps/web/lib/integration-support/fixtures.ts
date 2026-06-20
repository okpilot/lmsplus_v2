// App-layer integration fixture helpers (#925) — session-dependent test data.
//
// These helpers drive the REAL SECURITY DEFINER RPC chain (start_quiz_session →
// submit_quiz_answer × N → complete_quiz_session) AS THE AUTHENTICATED STUDENT.
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

/**
 * Drive the real RPC chain as the authenticated student to produce one
 * completed quiz session.
 *
 * - start_quiz_session   → session id (scalar)
 * - submit_quiz_answer × totalCount   ('b' for correct, 'a' for wrong)
 * - complete_quiz_session → row with total_questions, correct_count, score_percentage
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
  const subjectId = opts.subjectId ?? null
  const topicId = opts.topicId ?? null
  const qIds = questionIds.slice(0, totalCount)

  const { data: sessionId, error: startErr } = await studentClient.rpc('start_quiz_session', {
    p_mode: 'quick_quiz',
    p_subject_id: subjectId,
    p_topic_id: topicId,
    p_question_ids: qIds,
  })
  if (startErr) throw new Error(`seedCompletedSession start_quiz_session: ${startErr.message}`)

  for (let i = 0; i < totalCount; i++) {
    const selectedOption = i < correctCount ? 'b' : 'a'
    const { error: submitErr } = await studentClient.rpc('submit_quiz_answer', {
      p_session_id: sessionId as string,
      p_question_id: qIds[i],
      p_selected_option: selectedOption,
      p_response_time_ms: 2000,
    })
    if (submitErr) {
      throw new Error(`seedCompletedSession submit_quiz_answer[${i}]: ${submitErr.message}`)
    }
  }

  const { data: completeData, error: completeErr } = await studentClient.rpc(
    'complete_quiz_session',
    { p_session_id: sessionId as string },
  )
  if (completeErr) {
    throw new Error(`seedCompletedSession complete_quiz_session: ${completeErr.message}`)
  }

  const rows = Array.isArray(completeData) ? completeData : []
  const row = rows[0] as {
    total_questions: number
    correct_count: number
    score_percentage: number | string
  }

  return {
    sessionId: sessionId as string,
    totalQuestions: row.total_questions,
    correctCount: row.correct_count,
    scorePercentage: Number(row.score_percentage),
  }
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
