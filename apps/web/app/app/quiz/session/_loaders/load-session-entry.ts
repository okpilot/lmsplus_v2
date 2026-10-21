import { redirect } from 'next/navigation'
import type { SessionQuestion } from '@/app/app/_types/session'
import type { AnswerFeedback } from '@/app/app/quiz/types'
import { PRACTICE_MODES } from '@/lib/constants/exam-modes'
import { reportUrl } from '@/lib/constants/report-paths'
import { getFlaggedQuestionIdsBounded } from '@/lib/queries/flagged-questions'
import { loadQuizSessionState, type SessionEntry } from '@/lib/queries/load-quiz-session-state'
import { loadSessionQuestions } from '@/lib/queries/load-session-questions'
import { loadVfrRtExamQuestions } from '@/lib/queries/load-vfr-rt-exam-questions'
import { getRestoredFeedbackBounded } from '@/lib/queries/restored-feedback'

type OpenEntry = Extract<SessionEntry, { kind: 'open' }>
type SavedEntry = Extract<SessionEntry, { kind: 'saved' }>

export type SessionRunnerData =
  | {
      questions: SessionQuestion[]
      flaggedIds: string[]
      feedback: Record<string, AnswerFeedback>
    }
  | { error: string }

export type LoadedSessionEntry =
  | { entry: SavedEntry; runner: null }
  | { entry: OpenEntry; runner: SessionRunnerData }

const LOAD_FAILED = 'Failed to load questions. Please try again.'

function readQuestions(entry: OpenEntry) {
  return entry.mode === 'vfr_rt_exam'
    ? loadVfrRtExamQuestions({ sessionId: entry.sessionId })
    : loadSessionQuestions(entry.questionIds)
}

/** Exam modes never reveal answers on resume; the RPC would refuse them anyway. */
function readFeedback(entry: OpenEntry): Promise<Record<string, AnswerFeedback>> {
  const isPractice = (PRACTICE_MODES as readonly string[]).includes(entry.mode)
  return isPractice ? getRestoredFeedbackBounded(entry.sessionId) : Promise.resolve({})
}

/** Questions decide success; a failure returns at once instead of waiting on the cosmetic flag and feedback reads. */
async function loadRunnerData(entry: OpenEntry): Promise<SessionRunnerData> {
  const flags = getFlaggedQuestionIdsBounded(entry.questionIds)
  const feedback = readFeedback(entry)
  try {
    const result = await readQuestions(entry)
    if (!result.success) return { error: result.error }
    return { questions: result.questions, flaggedIds: await flags, feedback: await feedback }
  } catch (e) {
    console.error(
      '[loadSessionEntry] question load failed:',
      e instanceof Error ? e.message : String(e),
    )
    return { error: LOAD_FAILED }
  }
}

/**
 * Loads the session for /app/quiz/session/<id>. A finished session goes to its report; a
 * discarded, missing or foreign one goes back to the quiz page. An open session also carries
 * its questions, flags and restored feedback; a saved one carries none.
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
