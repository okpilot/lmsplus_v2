import type { SessionQuestion } from '@/app/app/_types/session'
import { FLAG_FETCH_TIMEOUT_MS } from '@/lib/constants/flag-fetch-timeout'
import { loadSessionQuestions } from '@/lib/queries/load-session-questions'
import { withTimeout } from '@/lib/utils/with-timeout'
import { getFlaggedIds } from '../../actions/flag'
import { clearDiscoveryPrefetch, readDiscoveryPrefetch } from '../_utils/discovery-prefetch'
import {
  clearSessionHandoff,
  readSessionHandoff,
  type SessionData,
} from '../_utils/quiz-session-handoff'

export type SessionLoadResult =
  | { success: true; questions: SessionQuestion[]; flaggedIds: string[] }
  | { success: false; error: string }

// Module-level handoff cache (owned here rather than in use-session-bootstrap). It survives a
// same-navigation remount of the session page after the handoff has been cleared from
// sessionStorage.
let cachedSession: { userId: string; session: SessionData } | null = null

/** @internal Test-only reset for the module-level cache. */
export function _resetCachedSession() {
  cachedSession = null
}

/** Drops the cached handoff and the Discovery prefetch for a user. */
export function dropCachedSession(userId: string) {
  clearDiscoveryPrefetch(userId)
  if (cachedSession?.userId === userId) cachedSession = null
}

/** Reads the tab-scoped handoff, falling back to (and refreshing) the module cache. */
export function readBootstrapSession(userId: string): SessionData | null {
  const data =
    readSessionHandoff(userId) ?? (cachedSession?.userId === userId ? cachedSession.session : null)
  if (data) cachedSession = { userId, session: data }
  return data
}

const TIMED_OUT: string[] = []

/**
 * Fetches the student's flagged ids, bounded by FLAG_FETCH_TIMEOUT_MS via `withTimeout`.
 * Degrades to [] on rejection, `{ success: false }`, or timeout — never rejects.
 */
async function fetchFlaggedIdsBounded(questionIds: string[]): Promise<string[]> {
  const flags = getFlaggedIds({ questionIds })
    .then((r) => {
      if (r.success) return r.flaggedIds
      console.error('[loadSessionData] flags result { success: false }:', r.error)
      return [] as string[]
    })
    .catch((e: unknown) => {
      console.error(
        '[loadSessionData] flags read failed:',
        e instanceof Error ? e.message : String(e),
      )
      return [] as string[]
    })
  const result = await withTimeout(flags, FLAG_FETCH_TIMEOUT_MS, TIMED_OUT)
  if (result !== TIMED_OUT) return result
  console.error(`[loadSessionData] flags timed out after ${FLAG_FETCH_TIMEOUT_MS}ms`)
  return []
}

/**
 * Fetch path: loads a Discovery session's questions and the student's flagged question
 * ids from the server. Used when no in-memory prefetch matches (e.g. a hard reload).
 *
 * Only the questions fetch decides success/error (and stays unbounded — the
 * questions are required data). The flag fetch is individually caught and
 * time-bounded: a rejection, a `{ success: false }` result, or a hang degrades to
 * an empty flag set and never surfaces an error. A loadSessionQuestions rejection is
 * mapped to the generic load-failure message, so this function never rejects.
 *
 * The cosmetic flag fetch is started first, then the questions are awaited. A failure
 * returns immediately: loadSessionQuestions RESOLVES `{ success: false }` rather than
 * rejecting, so awaiting both together (Promise.all) would stall a known error behind
 * the flag fetch's full timeout.
 */
export async function loadSessionData(questionIds: string[]): Promise<SessionLoadResult> {
  const flagsPromise = fetchFlaggedIdsBounded(questionIds)
  try {
    const questionsResult = await loadSessionQuestions(questionIds)
    if (!questionsResult.success) return { success: false, error: questionsResult.error }
    return { success: true, questions: questionsResult.questions, flaggedIds: await flagsPromise }
  } catch {
    return { success: false, error: 'Failed to load questions. Please try again.' }
  }
}

/** Serves the in-memory startStudy payload on a match, else falls back to the fetch path. */
export function loadDiscoverySession(
  data: SessionData,
  userId: string,
): Promise<SessionLoadResult> {
  const hit = readDiscoveryPrefetch(userId, data.sessionId)
  if (!hit) return loadSessionData(data.questionIds)
  return Promise.resolve({ success: true, questions: hit.questions, flaggedIds: hit.flaggedIds })
}

/**
 * Applies a settled initial load: error → setError; success → clears the handoff and seeds
 * flags and questions (questions last — the session mounts once they are set).
 */
export function applyInitialLoad(
  r: SessionLoadResult,
  userId: string,
  set: {
    setFlaggedIds: (ids: string[]) => void
    setQuestions: (q: SessionQuestion[]) => void
    setError: (e: string) => void
  },
) {
  if (!r.success) return set.setError(r.error)
  clearSessionHandoff(userId)
  set.setFlaggedIds(r.flaggedIds)
  set.setQuestions(r.questions)
}
