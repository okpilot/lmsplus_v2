import type { StudyQuestion } from '@/lib/queries/study-queries'
import type { AnswerFeedback, DraftAnswer } from '../types'

type BuildDiscoveryHandoffOpts = {
  userId: string
  subjectName?: string
  subjectCode?: string
}

/**
 * The sessionStorage handoff payload Discovery writes for the real quiz session
 * runner. Shape matches what `readSessionHandoff`/`isValidSessionData` validate, plus
 * `mode: 'discovery'`.
 */
export type DiscoveryHandoff = {
  userId: string
  sessionId: string
  questionIds: string[]
  draftAnswers: Record<string, DraftAnswer>
  draftFeedback: Record<string, AnswerFeedback>
  draftCurrentIndex: number
  mode: 'discovery'
  subjectName?: string
  subjectCode?: string
}

/**
 * Pure transform: `StudyQuestion[]` → the Discovery handoff. Pre-marks every
 * question's correct option (selectedOptionId === correctOptionId, zero response
 * time) and seeds correct MC feedback so the runner opens each question in
 * answered/review state — browse-only, nothing scored. Only `id` + `correctOptionId`
 * ride along in the sessionStorage payload (explanations stay null to bound it); the
 * question content reaches the runner via the in-memory prefetch, or a fetch on a miss.
 */
export function buildDiscoveryHandoff(
  questions: StudyQuestion[],
  opts: BuildDiscoveryHandoffOpts,
): DiscoveryHandoff {
  const draftAnswers: Record<string, DraftAnswer> = {}
  const draftFeedback: Record<string, AnswerFeedback> = {}
  for (const q of questions) {
    draftAnswers[q.id] = { selectedOptionId: q.correctOptionId, responseTimeMs: 0 }
    draftFeedback[q.id] = {
      questionType: 'multiple_choice',
      isCorrect: true,
      correctOptionId: q.correctOptionId,
      explanationText: null,
      explanationImageUrl: null,
    }
  }
  return {
    userId: opts.userId,
    sessionId: crypto.randomUUID(),
    questionIds: questions.map((q) => q.id),
    draftAnswers,
    draftFeedback,
    draftCurrentIndex: 0,
    mode: 'discovery',
    subjectName: opts.subjectName,
    subjectCode: opts.subjectCode,
  }
}
