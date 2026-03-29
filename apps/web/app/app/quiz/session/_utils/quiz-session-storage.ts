import type { DraftAnswer } from '../../types'

const storageKey = (userId: string) => `quiz-active-session:${userId}`

/** User-scoped key for the tab-scoped session handoff via sessionStorage. */
export const sessionHandoffKey = (userId: string) => `quiz-session:${userId}`
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

export type ActiveSession = {
  userId: string
  sessionId: string
  questionIds: string[]
  answers: Record<string, DraftAnswer>
  currentIndex: number
  subjectName?: string
  subjectCode?: string
  draftId?: string
  savedAt: number // Date.now()
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
      typeof data.savedAt !== 'number' ||
      typeof data.currentIndex !== 'number' ||
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
    for (const val of Object.values(data.answers)) {
      const v = val as Record<string, unknown>
      if (typeof v?.selectedOptionId !== 'string' || typeof v?.responseTimeMs !== 'number') {
        safeRemove(userId)
        return null
      }
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
): ActiveSession {
  return {
    userId: opts.userId,
    sessionId: opts.sessionId,
    questionIds: opts.questions.map((q) => q.id),
    answers: Object.fromEntries(answers),
    currentIndex,
    subjectName: opts.subjectName,
    subjectCode: opts.subjectCode,
    draftId: opts.draftId,
    savedAt: Date.now(),
  }
}
