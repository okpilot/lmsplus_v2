import type { AnswerFeedback, DraftAnswer } from '../../types'
import {
  hasValidOptionalFields,
  isNonEmptyString,
  isValidDraftAnswer,
  isValidFeedbackEntry,
  isValidRecordOf,
} from './quiz-session-validators'

const storageKey = (userId: string) => `quiz-active-session:${userId}`

/** User-scoped key for the tab-scoped session handoff via sessionStorage. */
export const sessionHandoffKey = (userId: string) => `quiz-session:${userId}`
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

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
  mode?: 'study' | 'exam'
}

/** Build the sessionStorage handoff payload for resuming a session. */
export function buildHandoffPayload(userId: string, s: ActiveSession) {
  return {
    userId,
    sessionId: s.sessionId,
    questionIds: s.questionIds,
    draftAnswers: s.answers,
    draftFeedback: s.feedback,
    draftCurrentIndex: s.currentIndex,
    draftId: s.draftId,
    subjectName: s.subjectName,
    subjectCode: s.subjectCode,
  }
}

export function writeActiveSession(data: ActiveSession): void {
  try {
    localStorage.setItem(storageKey(data.userId), JSON.stringify(data))
  } catch (err) {
    // Private browsing SecurityError or QuotaExceededError — never block quiz
    console.warn('[quiz-session-storage] Write failed:', err)
  }
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
    const data = JSON.parse(raw) as ActiveSession
    // Validate required fields
    if (
      !data.sessionId ||
      !Array.isArray(data.questionIds) ||
      data.questionIds.length === 0 ||
      typeof data.savedAt !== 'number' ||
      typeof data.currentIndex !== 'number' ||
      !Number.isInteger(data.currentIndex) ||
      data.currentIndex < 0 ||
      data.currentIndex >= data.questionIds.length ||
      typeof data.answers !== 'object' ||
      data.answers === null ||
      Array.isArray(data.answers)
    ) {
      safeRemove(userId)
      return null
    }
    // Validate questionIds items are non-empty strings
    if (data.questionIds.some((id) => typeof id !== 'string' || !id)) {
      safeRemove(userId)
      return null
    }
    // Validate answers values have required DraftAnswer shape
    if (!isValidRecordOf(data.answers, isValidDraftAnswer)) {
      safeRemove(userId)
      return null
    }
    // Validate feedback values have required AnswerFeedback shape
    if (data.feedback && !isValidRecordOf(data.feedback, isValidFeedbackEntry)) {
      safeRemove(userId)
      return null
    }
    // Cross-user contamination guard
    if (data.userId !== userId) {
      safeRemove(userId)
      return null
    }
    // 7-day staleness check
    if (Date.now() - data.savedAt > SEVEN_DAYS_MS) {
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

export type SessionData = {
  sessionId: string
  questionIds: string[]
  draftAnswers?: Record<string, DraftAnswer>
  draftFeedback?: Record<string, AnswerFeedback>
  draftCurrentIndex?: number
  draftId?: string
  subjectName?: string
  subjectCode?: string
  mode?: 'study' | 'exam'
  timeLimitSeconds?: number
  passMark?: number
}

export function isValidSessionData(data: unknown, expectedUserId: string): data is SessionData {
  if (typeof data !== 'object' || data === null) return false
  const d = data as Record<string, unknown>
  if (!isNonEmptyString(d.sessionId)) return false
  if (!Array.isArray(d.questionIds) || d.questionIds.length === 0) return false
  if (d.questionIds.some((id) => !isNonEmptyString(id))) return false
  if ('userId' in d && d.userId !== expectedUserId) return false
  return hasValidOptionalFields(d, d.questionIds.length)
}

/** Read and validate the tab-scoped session handoff from sessionStorage. */
export function readSessionHandoff(userId: string): SessionData | null {
  const key = sessionHandoffKey(userId)
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      // Malformed JSON — remove the corrupt entry so it doesn't persist
      try {
        sessionStorage.removeItem(key)
      } catch {
        /* SecurityError */
      }
      return null
    }
    if (isValidSessionData(parsed, userId)) return parsed
    console.error('[readSessionHandoff] Invalid or mismatched session data — discarding')
    sessionStorage.removeItem(key)
    return null
  } catch {
    // SecurityError from getItem — nothing to clean up
    return null
  }
}

/** Convert an ActiveSession (localStorage recovery) to SessionData (hook state). */
export function toSessionData(r: ActiveSession): SessionData {
  return {
    sessionId: r.sessionId,
    questionIds: r.questionIds,
    draftAnswers: r.answers,
    draftFeedback: r.feedback,
    draftCurrentIndex: r.currentIndex,
    draftId: r.draftId,
    subjectName: r.subjectName,
    subjectCode: r.subjectCode,
    mode: r.mode,
  }
}

export function clearSessionHandoff(userId: string): void {
  try {
    sessionStorage.removeItem(sessionHandoffKey(userId))
  } catch {
    // Swallow — best effort (SecurityError in private mode)
  }
}

type BuildOpts = {
  userId: string
  sessionId: string
  questions: Array<{ id: string }>
  subjectName?: string
  subjectCode?: string
  draftId?: string
}

export function buildActiveSession(
  opts: BuildOpts,
  answers: Map<string, DraftAnswer>,
  currentIndex: number,
  feedback?: Map<string, AnswerFeedback>,
): ActiveSession {
  return {
    userId: opts.userId,
    sessionId: opts.sessionId,
    questionIds: opts.questions.map((q) => q.id),
    answers: Object.fromEntries(answers),
    feedback: feedback ? Object.fromEntries(feedback) : undefined,
    currentIndex,
    subjectName: opts.subjectName,
    subjectCode: opts.subjectCode,
    draftId: opts.draftId,
    savedAt: Date.now(),
  }
}
