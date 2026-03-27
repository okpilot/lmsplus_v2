import type { DraftAnswer } from '../../types'

const STORAGE_KEY = 'quiz-active-session'
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

export type ActiveSession = {
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch (err) {
    // Private browsing SecurityError or QuotaExceededError — never block quiz
    console.warn('[quiz-session-storage] Write failed:', err)
  }
}

export function readActiveSession(): ActiveSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as ActiveSession
    // Validate required fields
    if (!data.sessionId || !Array.isArray(data.questionIds) || typeof data.savedAt !== 'number') {
      localStorage.removeItem(STORAGE_KEY)
      return null
    }
    // 7-day staleness check
    if (Date.now() - data.savedAt > SEVEN_DAYS_MS) {
      localStorage.removeItem(STORAGE_KEY)
      return null
    }
    return data
  } catch {
    // Malformed JSON or other error
    localStorage.removeItem(STORAGE_KEY)
    return null
  }
}

export function clearActiveSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Swallow — best effort
  }
}

type BuildOpts = {
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
