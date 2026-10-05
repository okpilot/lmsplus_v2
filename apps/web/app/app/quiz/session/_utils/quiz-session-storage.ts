import type { QuizMode as DbQuizMode } from '@/lib/constants/exam-modes'
import type { SessionMode } from '../../session-types'
import type { AnswerFeedback, DraftAnswer } from '../../types'
import { isValidActiveSession } from './quiz-session-active-validation'

// The localStorage active session may ONLY hold resumable modes. Discovery is ephemeral
// (never persisted — readActiveSession rejects a persisted 'discovery'), so its mode must
// not be representable in the stored shape. SessionData (the handoff) stays broad.
type ResumableSessionMode = Extract<SessionMode, 'study' | 'exam'>

const storageKey = (userId: string) => `quiz-active-session:${userId}`

export type ActiveSession = {
  userId: string
  sessionId: string
  questionIds: string[]
  answers: Record<string, DraftAnswer>
  feedback?: Record<string, AnswerFeedback>
  currentIndex: number
  subjectName?: string
  subjectCode?: string
  draftId?: string
  savedAt: number // Date.now()
  // Resumable-only — never 'discovery' (see ResumableSessionMode above).
  mode?: ResumableSessionMode
  // DB-level exam mode (mock_exam | internal_exam). Display-only; drives badge label and
  // UI gating (e.g. hides Discard for internal_exam). Defaults to mock_exam when absent.
  examMode?: DbQuizMode
  // Exam-mode refresh recovery: timer needs deadline-relative state, independent of SessionData.
  startedAt?: string // ISO string from quiz_sessions.started_at; required for exam mode
  timeLimitSeconds?: number
  passMark?: number
}

function safeRemove(userId: string): void {
  try {
    localStorage.removeItem(storageKey(userId))
  } catch {
    // Swallow — best effort
  }
}

export function readActiveSession(userId: string): ActiveSession | null {
  try {
    const raw = localStorage.getItem(storageKey(userId))
    if (!raw) return null
    const data: unknown = JSON.parse(raw)
    if (!isValidActiveSession(data, userId)) {
      safeRemove(userId)
      return null
    }
    return data
  } catch {
    // Malformed JSON or other error
    safeRemove(userId)
    return null
  }
}

export function clearActiveSession(userId: string): void {
  safeRemove(userId)
}

/**
 * Clears the entry only when it still refers to `sessionId`; returns whether it did.
 *
 * The key is userId-scoped but every caller acts on a session it read EARLIER — at mount, or
 * from a server render that is never revalidated. In between, storage can have moved on to a
 * newer session: starting one clears the old key and writes its own, so a second tab, or a
 * discard on a stale banner, would otherwise destroy the newer session's answer buffer with a
 * blind userId-keyed clear. The single-active-session invariant (docs/security.md §11d, mig
 * 136) rules out two CONCURRENTLY live sessions, not a stale render of a finished one.
 *
 * Callers that must not ACT on a stale snapshot (rather than merely avoid clearing it) should
 * branch on the return value — false means the snapshot they hold is no longer current.
 */
export function clearActiveSessionIfCurrent(userId: string, sessionId: string): boolean {
  if (readActiveSession(userId)?.sessionId !== sessionId) return false
  safeRemove(userId)
  return true
}
