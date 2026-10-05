import { loadSavedQuizzes, type SavedQuizSession } from '@/lib/queries/load-saved-quizzes'
import type { ActiveExamSession } from '../actions/get-active-exam-session'
import { getActiveExamSession } from '../actions/get-active-exam-session'
import type { ActivePracticeSession } from '../actions/get-active-practice-session'
import { getActivePracticeSession } from '../actions/get-active-practice-session'
import { loadDrafts } from '../actions/load-draft'
import type { DraftData } from '../types'

export type QuizPageData = {
  drafts: DraftData[]
  savedSessions: SavedQuizSession[]
  examLookupFailed: boolean
  activeExams: ActiveExamSession[]
  orphanedIds: string[]
  expiredIds: string[]
  practiceLookupFailed: boolean
  activePractice: ActivePracticeSession | null
}

/**
 * Loads and normalizes everything the quiz page needs in one round-trip: drafts, saved
 * sessions, active exam sessions (+ orphaned/expired ids), and the active practice session.
 * Each source is fetched in parallel and its discriminated result is flattened into
 * a flat view-model so the page stays composition-only (code-style §2). The
 * actions resolve auth internally; the saved-sessions query takes the caller id.
 */
export async function loadQuizPageData(userId: string): Promise<QuizPageData> {
  const [{ drafts }, savedSessions, examResult, practiceResult] = await Promise.all([
    loadDrafts(),
    loadSavedQuizzes(userId),
    getActiveExamSession(),
    getActivePracticeSession(),
  ])

  return {
    drafts,
    savedSessions,
    examLookupFailed: !examResult.success,
    activeExams: examResult.success ? examResult.sessions : [],
    orphanedIds: examResult.success ? examResult.orphanedSessionIds : [],
    expiredIds: examResult.success ? examResult.expiredSessionIds : [],
    practiceLookupFailed: !practiceResult.success,
    activePractice: practiceResult.success ? practiceResult.session : null,
  }
}
