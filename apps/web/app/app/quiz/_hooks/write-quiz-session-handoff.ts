import { sessionHandoffKey } from '../session/_utils/quiz-session-handoff'

/**
 * Writes the started quiz session's handoff to sessionStorage. Returns false on
 * a storage failure (private-mode SecurityError, quota) so the caller surfaces a
 * message instead of navigating to an empty session. Extracted from
 * useQuizStart to keep the hook within the 80-line hook budget (code-style.md
 * §1) — mirrors use-study-start.ts's writeDiscoveryHandoff.
 */
export function writeQuizSessionHandoff(
  userId: string,
  sessionId: string,
  questionIds: string[],
  subjectName?: string,
  subjectCode?: string,
): boolean {
  try {
    sessionStorage.setItem(
      sessionHandoffKey(userId),
      JSON.stringify({ userId, sessionId, questionIds, subjectName, subjectCode }),
    )
    return true
  } catch (err) {
    console.warn('[write-quiz-session-handoff] sessionStorage handoff failed:', err)
    return false
  }
}
