import { redirect } from 'next/navigation'
import type { SessionQuestion } from '@/app/app/_types/session'
import { FLAG_FETCH_TIMEOUT_MS } from '@/lib/constants/flag-fetch-timeout'
import { reportUrl } from '@/lib/constants/report-paths'
import { getFlaggedQuestionIds } from '@/lib/queries/flagged-questions'
import { loadQuizSessionState, type SessionEntry } from '@/lib/queries/load-quiz-session-state'
import { loadSessionQuestions } from '@/lib/queries/load-session-questions'
import { loadVfrRtExamQuestions } from '@/lib/queries/load-vfr-rt-exam-questions'
import { withTimeout } from '@/lib/utils/with-timeout'

type OpenEntry = Extract<SessionEntry, { kind: 'open' }>
type SavedEntry = Extract<SessionEntry, { kind: 'saved' }>

export type SessionRunnerData =
  | { questions: SessionQuestion[]; flaggedIds: string[] }
  | { error: string }

export type LoadedSessionEntry =
  | { entry: SavedEntry; runner: null }
  | { entry: OpenEntry; runner: SessionRunnerData }

const LOAD_FAILED = 'Failed to load questions. Please try again.'

function readFlagsBounded(entry: OpenEntry): Promise<string[]> {
  const flags = getFlaggedQuestionIds(entry.questionIds).catch(() => [] as string[])
  return withTimeout(flags, FLAG_FETCH_TIMEOUT_MS, [])
}

function readQuestions(entry: OpenEntry) {
  return entry.mode === 'vfr_rt_exam'
    ? loadVfrRtExamQuestions({ sessionId: entry.sessionId })
    : loadSessionQuestions(entry.questionIds)
}

/** Questions decide success; a failure returns at once instead of waiting on the cosmetic flag read. */
async function loadRunnerData(entry: OpenEntry): Promise<SessionRunnerData> {
  const flags = readFlagsBounded(entry)
  try {
    const result = await readQuestions(entry)
    if (!result.success) return { error: result.error }
    return { questions: result.questions, flaggedIds: await flags }
  } catch {
    return { error: LOAD_FAILED }
  }
}

/**
 * Loads the session for /app/quiz/session/<id>. A finished session goes to its report; a
 * discarded, missing or foreign one goes back to the quiz page. An open session also carries
 * its questions and flags; a saved one carries none.
 */
export async function loadSessionEntry(
  sessionId: string,
  userId: string,
): Promise<LoadedSessionEntry> {
  const state = await loadQuizSessionState(sessionId, userId)
  if (state.kind === 'ended') redirect(reportUrl(state.mode, sessionId))
  if (state.kind === 'saved') return { entry: state, runner: null }
  if (state.kind === 'open') return { entry: state, runner: await loadRunnerData(state) }
  return redirect('/app/quiz')
}
