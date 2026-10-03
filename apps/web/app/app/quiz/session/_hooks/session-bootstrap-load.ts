import type { SessionQuestion } from '@/app/app/_types/session'
import { loadSessionQuestions } from '@/lib/queries/load-session-questions'
import { loadVfrRtExamQuestions } from '@/lib/queries/load-vfr-rt-exam-questions'
import { getFlaggedIds } from '../../actions/flag'
import { claimQuizDeviceBounded } from '../_utils/claim-quiz-device'
import {
  clearSessionHandoff,
  readSessionHandoff,
  type SessionData,
} from '../_utils/quiz-session-handoff'
import { type ActiveSession, toSessionData } from '../_utils/quiz-session-storage'

export type SessionLoadResult =
  | { success: true; questions: SessionQuestion[]; flaggedIds: string[]; claimError?: string }
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

// Flags are cosmetic: if the flag fetch hangs, degrade to no flags after this
// window instead of blocking the whole session bootstrap on it.
export const FLAG_FETCH_TIMEOUT_MS = 3000

/**
 * Fetches the student's flagged ids, bounded by FLAG_FETCH_TIMEOUT_MS (code-style
 * §6 bounded-await shape: Promise.race + clearTimeout once either side settles).
 * Degrades to [] on rejection, `{ success: false }`, or timeout — never rejects.
 */
function fetchFlaggedIdsBounded(questionIds: string[]): Promise<string[]> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<string[]>((resolve) => {
    timer = setTimeout(() => resolve([]), FLAG_FETCH_TIMEOUT_MS)
  })
  const flags = getFlaggedIds({ questionIds })
    .then((r) => (r.success ? r.flaggedIds : []))
    .catch(() => [] as string[])
  return Promise.race([flags, timeout]).finally(() => clearTimeout(timer))
}

/**
 * Loads the session's questions, the student's flagged question ids and the tab's claim.
 *
 * Only the questions fetch decides success/error (and stays unbounded — the
 * questions are required data). The flag fetch is individually caught and
 * time-bounded: a rejection, a `{ success: false }` result, or a hang degrades to
 * an empty flag set and never surfaces an error — flags are cosmetic and must not
 * block the session. A loadSessionQuestions rejection is mapped to the generic
 * load-failure message here, so this function never rejects.
 *
 * Next.js dispatches Server Actions one at a time per client, so the requests are
 * queued, not parallel. The cosmetic flag fetch is started first, then the questions
 * are awaited; only after they load does the claim start (non-discovery), so a failed
 * load never claims the session away from the student's other tab. A failure returns
 * immediately: loadSessionQuestions RESOLVES `{ success: false }` rather than
 * rejecting, so awaiting everything together (Promise.all) would not short-circuit
 * and would stall a known error behind the flag fetch's full timeout.
 */
export async function loadSessionData(
  questionIds: string[],
  source?: Pick<SessionData, 'sessionId' | 'examMode' | 'mode'>,
): Promise<SessionLoadResult> {
  const flagsPromise = fetchFlaggedIdsBounded(questionIds)
  try {
    const questionsResult =
      source?.examMode === 'vfr_rt_exam'
        ? await loadVfrRtExamQuestions({ sessionId: source.sessionId })
        : await loadSessionQuestions(questionIds)
    if (!questionsResult.success) return { success: false, error: questionsResult.error }
    // Never rejects; Discovery saves nothing, so it never claims.
    const claimPromise =
      source && source.mode !== 'discovery'
        ? claimQuizDeviceBounded(source.sessionId)
        : Promise.resolve(null)
    const flaggedIds = await flagsPromise
    const claimError = (await claimPromise) ?? undefined
    return { success: true, questions: questionsResult.questions, flaggedIds, claimError }
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
  setClaimError: (e: string | null) => void
}

function applyRecoverySuccess(
  r: Extract<SessionLoadResult, { success: true }>,
  recovery: ActiveSession,
  set: RecoverySetters,
) {
  set.setSession(toSessionData(recovery))
  set.setFlaggedIds(r.flaggedIds)
  set.setClaimError(r.claimError ?? null)
  set.setQuestions(r.questions)
  set.setResumeLoading(false)
  // Terminal success: setRecovery(null) unmounts the recovery screen, so the ref
  // intentionally stays set — a late duplicate trigger can never re-fire (§6).
  set.setRecovery(null)
}

/**
 * Builds the recovery-prompt Resume handler. Rebuilt each render so it closes over
 * the current `recovery` state (mirrors the quiz-recovery-handlers.ts builders).
 */
export function buildRecoveryResume(
  recovery: ActiveSession | null,
  set: RecoverySetters,
  inFlightRef: React.RefObject<boolean>,
) {
  return function handleRecoveryResume() {
    // Synchronous one-shot re-entry guard (code-style §6): `resumeLoading` is async
    // React state, so two same-tick triggers could both pass a loading check.
    if (!recovery || inFlightRef.current) return
    inFlightRef.current = true // set before the async load kicks off (code-style §6)
    set.setResumeLoading(true)
    set.setResumeError(null)
    loadSessionData(recovery.questionIds, recovery)
      .then((r) => {
        if (!r.success) {
          set.setResumeError(r.error)
          set.setResumeLoading(false)
          inFlightRef.current = false // retryable failure — release the lock
          return
        }
        applyRecoverySuccess(r, recovery, set)
      })
      .catch(() => {
        // loadSessionData is documented never to reject; this is the §5 error-path
        // net so a broken invariant (or a throwing setter) can never permanently
        // strand the Resume lock.
        inFlightRef.current = false
        set.setResumeLoading(false)
        set.setResumeError('Failed to load questions. Please try again.')
      })
  }
}

/**
 * Applies a settled initial load: error → setError; success → clears the handoff and seeds
 * flags, claim error and questions (questions last — the session mounts once they are set).
 */
export function applyInitialLoad(
  r: SessionLoadResult,
  userId: string,
  set: Pick<RecoverySetters, 'setFlaggedIds' | 'setQuestions' | 'setClaimError'> & {
    setError: (e: string) => void
  },
) {
  if (!r.success) return set.setError(r.error)
  clearSessionHandoff(userId)
  set.setFlaggedIds(r.flaggedIds)
  set.setClaimError(r.claimError ?? null)
  set.setQuestions(r.questions)
}
