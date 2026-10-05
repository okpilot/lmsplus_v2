import type { QuizMode as DbQuizMode } from '@/lib/constants/exam-modes'
import type { SessionMode } from '../../session-types'
import type { AnswerFeedback, DraftAnswer } from '../../types'
import { hasValidOptionalFields, isNonEmptyString } from './quiz-session-validators'

/** User-scoped key for the tab-scoped session handoff via sessionStorage. */
export const sessionHandoffKey = (userId: string) => `quiz-session:${userId}`

export type SessionData = {
  sessionId: string
  questionIds: string[]
  draftAnswers?: Record<string, DraftAnswer>
  draftFeedback?: Record<string, AnswerFeedback>
  draftCurrentIndex?: number
  draftId?: string
  subjectName?: string
  subjectCode?: string
  mode?: SessionMode
  examMode?: DbQuizMode
  timeLimitSeconds?: number
  passMark?: number
  startedAt?: string
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

export function clearSessionHandoff(userId: string): void {
  try {
    sessionStorage.removeItem(sessionHandoffKey(userId))
  } catch {
    // Swallow — best effort (SecurityError in private mode)
  }
}
