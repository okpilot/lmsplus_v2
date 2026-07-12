import type { SessionQuestion } from '@/app/app/_types/session'
import { loadSessionQuestions } from '@/lib/queries/load-session-questions'
import { getFlaggedIds } from '../../actions/flag'
import { readSessionHandoff, type SessionData } from '../_utils/quiz-session-handoff'
import { type ActiveSession, toSessionData } from '../_utils/quiz-session-storage'

export type SessionLoadResult =
  | { success: true; questions: SessionQuestion[]; flaggedIds: string[] }
  | { success: false; error: string }

// Module-level handoff cache (owned here rather than in use-session-bootstrap so the
// hook stays under the 80-line cap). It survives a same-navigation remount of the
// session page after the handoff has been cleared from sessionStorage.
let cachedSession: { userId: string; session: SessionData } | null = null

/** @internal Test-only reset for the module-level cache. */
export function _resetCachedSession() {
  cachedSession = null
}

/** Drops the cached handoff for a user once their questions have rendered. */
export function dropCachedSession(userId: string) {
  if (cachedSession?.userId === userId) cachedSession = null
}

/** Reads the tab-scoped handoff, falling back to (and refreshing) the module cache. */
export function readBootstrapSession(userId: string): SessionData | null {
  const data =
    readSessionHandoff(userId) ?? (cachedSession?.userId === userId ? cachedSession.session : null)
  if (data) cachedSession = { userId, session: data }
  return data
}

/**
 * Loads the session's questions and the student's flagged question ids in parallel.
 *
 * Only the questions fetch decides success/error. The flag fetch is individually
 * caught: a rejection or a `{ success: false }` result degrades to an empty flag set
 * and never surfaces an error — flags are cosmetic and must not block the session.
 * A loadSessionQuestions rejection is mapped to the generic load-failure message
 * here, so this function never rejects.
 */
export async function loadSessionData(questionIds: string[]): Promise<SessionLoadResult> {
  const flagsPromise = getFlaggedIds({ questionIds })
    .then((r) => (r.success ? r.flaggedIds : []))
    .catch(() => [] as string[])
  try {
    const [questionsResult, flaggedIds] = await Promise.all([
      loadSessionQuestions(questionIds),
      flagsPromise,
    ])
    if (!questionsResult.success) return { success: false, error: questionsResult.error }
    return { success: true, questions: questionsResult.questions, flaggedIds }
  } catch {
    return { success: false, error: 'Failed to load questions. Please try again.' }
  }
}

type RecoverySetters = {
  setSession: (s: SessionData) => void
  setQuestions: (q: SessionQuestion[]) => void
  setFlaggedIds: (ids: string[]) => void
  setRecovery: (r: ActiveSession | null) => void
  setResumeLoading: (v: boolean) => void
  setResumeError: (e: string | null) => void
}

/**
 * Builds the recovery-prompt Resume handler. Rebuilt each render so it closes over
 * the current `recovery` state (mirrors the quiz-recovery-handlers.ts builders).
 */
export function buildRecoveryResume(recovery: ActiveSession | null, set: RecoverySetters) {
  return function handleRecoveryResume() {
    if (!recovery) return
    set.setResumeLoading(true)
    set.setResumeError(null)
    loadSessionData(recovery.questionIds).then((r) => {
      if (!r.success) {
        set.setResumeError(r.error ?? 'Failed to load questions. Try again.')
        set.setResumeLoading(false)
        return
      }
      set.setSession(toSessionData(recovery))
      set.setFlaggedIds(r.flaggedIds)
      set.setQuestions(r.questions)
      set.setResumeLoading(false)
      set.setRecovery(null)
    })
  }
}
