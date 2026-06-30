import type { ActiveExamSession } from '../actions/get-active-exam-session'
import { getActiveExamSession } from '../actions/get-active-exam-session'
import type { ActivePracticeSession } from '../actions/get-active-practice-session'
import { getActivePracticeSession } from '../actions/get-active-practice-session'
import { loadDrafts } from '../actions/load-draft'
import type { DraftData } from '../types'

export type QuizPageData = {
  drafts: DraftData[]
  examLookupFailed: boolean
  activeExams: ActiveExamSession[]
  orphanedIds: string[]
  expiredIds: string[]
  practiceLookupFailed: boolean
  activePractice: ActivePracticeSession | null
}

/**
 * Loads and normalizes everything the quiz page needs in one round-trip: drafts,
 * active exam sessions (+ orphaned/expired ids), and the active practice session.
 * Each source is fetched in parallel and its discriminated result is flattened into
 * a flat view-model so the page stays composition-only (code-style §2). The three
 * actions resolve auth internally, so no caller id is needed here.
 */
export async function loadQuizPageData(): Promise<QuizPageData> {
  const [{ drafts }, examResult, practiceResult] = await Promise.all([
    loadDrafts(),
    getActiveExamSession(),
    getActivePracticeSession(),
  ])

  return {
    drafts,
    examLookupFailed: !examResult.success,
    activeExams: examResult.success ? examResult.sessions : [],
    orphanedIds: examResult.success ? examResult.orphanedSessionIds : [],
    expiredIds: examResult.success ? examResult.expiredSessionIds : [],
    practiceLookupFailed: !practiceResult.success,
    activePractice: practiceResult.success ? practiceResult.session : null,
  }
}
