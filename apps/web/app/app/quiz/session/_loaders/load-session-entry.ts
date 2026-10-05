import { redirect } from 'next/navigation'
import { loadQuizSessionState, type SessionEntry } from '@/lib/queries/load-quiz-session-state'
import { reportUrl } from '../_hooks/exam-report-paths'

/**
 * Loads the session for /app/quiz/session/<id>. A finished session goes to its report; a
 * discarded, missing or foreign one goes back to the quiz page. Returns an open or saved session.
 */
export async function loadSessionEntry(sessionId: string, userId: string): Promise<SessionEntry> {
  const state = await loadQuizSessionState(sessionId, userId)
  if (state.kind === 'ended') redirect(reportUrl(state.mode, sessionId))
  if (state.kind === 'open' || state.kind === 'saved') return state
  return redirect('/app/quiz')
}
