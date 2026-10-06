import { readUserId } from './recovery-code'
import { cleanupStudentActiveSessions, getAdminClient } from './supabase'

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

/** `/app/quiz/session/<uuid>`, the runner's address, and nothing after the id. */
export const SESSION_ID_URL = new RegExp(`/app/quiz/session/${UUID}$`)

export function sessionIdFromUrl(url: string): string {
  const match = new RegExp(`/app/quiz/session/(${UUID})(?:$|[?#])`).exec(url)
  if (!match?.[1]) throw new Error(`not a quiz session id URL: ${url}`)
  return match[1]
}

/**
 * Clears the saved marker on every saved session of the student. The save RPC counts rows with
 * `saved_at` set whether or not they are soft-deleted, and refuses past 20, so a spec that saves
 * must release them. The rows stay soft-deleted; only the marker goes.
 */
export async function cleanupStudentSavedSessions(studentEmail: string): Promise<void> {
  const admin = getAdminClient()
  const studentId = await readUserId(studentEmail)
  const { data, error } = await admin
    .from('quiz_sessions')
    .update({ saved_at: null })
    .eq('student_id', studentId)
    .not('saved_at', 'is', null)
    .select('id')
  if (error) throw new Error(`cleanupStudentSavedSessions (${studentEmail}): ${error.message}`)
  if ((data?.length ?? 0) > 0) {
    console.log(
      `[cleanupStudentSavedSessions] cleared ${data?.length} saved session(s) for ${studentEmail}`,
    )
  }
}

/** Both cleanups, each isolated so a failure in the first cannot skip the second. */
export async function resetStudentQuizSessions(studentEmail: string): Promise<void> {
  const errors: string[] = []
  const steps = [cleanupStudentActiveSessions, cleanupStudentSavedSessions]
  for (const step of steps) {
    try {
      await step(studentEmail)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
  }
  if (errors.length > 0) throw new Error(`resetStudentQuizSessions: ${errors.join('; ')}`)
}

export type SessionRow = {
  currentIndex: number
  pinnedCount: number
  endedAt: string | null
  deletedAt: string | null
  savedAt: string | null
}

export async function readSessionRow(sessionId: string): Promise<SessionRow> {
  const { data, error } = await getAdminClient()
    .from('quiz_sessions')
    .select('current_index, pinned_question_ids, ended_at, deleted_at, saved_at')
    .eq('id', sessionId)
    .maybeSingle()
  if (error) throw new Error(`readSessionRow: ${error.message}`)
  if (!data) throw new Error(`readSessionRow: no session ${sessionId}`)
  return {
    currentIndex: data.current_index,
    pinnedCount: data.pinned_question_ids.length,
    endedAt: data.ended_at,
    deletedAt: data.deleted_at,
    savedAt: data.saved_at,
  }
}

/** Questions of the session the student has an answer saved for. */
export async function readAnsweredQuestionIds(sessionId: string): Promise<string[]> {
  const { data, error } = await getAdminClient()
    .from('quiz_session_progress')
    .select('question_id')
    .eq('session_id', sessionId)
    .not('answer', 'is', null)
  if (error) throw new Error(`readAnsweredQuestionIds: ${error.message}`)
  return (data ?? []).map((r: { question_id: string }) => r.question_id)
}

/** Sets the saved visit time of one question: the active clock's server-side starting point. */
export async function setSavedVisitTime(opts: {
  sessionId: string
  questionId: string
  timeSpentMs: number
}): Promise<void> {
  const { data, error } = await getAdminClient()
    .from('quiz_session_progress')
    .update({ time_spent_ms: opts.timeSpentMs })
    .eq('session_id', opts.sessionId)
    .eq('question_id', opts.questionId)
    .select('question_id')
  if (error) throw new Error(`setSavedVisitTime: ${error.message}`)
  if (!data?.length) throw new Error(`setSavedVisitTime: no row for ${opts.questionId}`)
}

/** The questions the session serves, in order (`config.question_ids`). */
export async function readSessionQuestionIds(sessionId: string): Promise<string[]> {
  const { data, error } = await getAdminClient()
    .from('quiz_sessions')
    .select('config')
    .eq('id', sessionId)
    .maybeSingle()
  if (error) throw new Error(`readSessionQuestionIds: ${error.message}`)
  const ids = (data?.config as { question_ids?: unknown } | null | undefined)?.question_ids
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) {
    throw new Error(`readSessionQuestionIds: no question_ids in ${sessionId}`)
  }
  return ids as string[]
}

/** Name of the session's subject, as the student sees it. */
export async function readSessionSubjectName(sessionId: string): Promise<string> {
  const { data, error } = await getAdminClient()
    .from('quiz_sessions')
    .select('easa_subjects!subject_id(name)')
    .eq('id', sessionId)
    .maybeSingle()
  if (error) throw new Error(`readSessionSubjectName: ${error.message}`)
  const subject = data?.easa_subjects as { name?: unknown } | null | undefined
  if (typeof subject?.name !== 'string') throw new Error(`readSessionSubjectName: ${sessionId}`)
  return subject.name
}
