import type { StudyQuestion } from '@/lib/queries/study-queries'
import type { AnswerFeedback, DraftAnswer } from '../types'

type BuildDiscoveryHandoffOpts = {
  userId: string
  subjectName?: string
  subjectCode?: string
}

/**
 * The sessionStorage handoff payload Discovery writes for the real quiz session
 * runner. Shape matches what `readSessionHandoff`/`isValidSessionData` validate
 * (mirrors `buildHandoffPayload`'s output keys), plus `mode: 'discovery'`.
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
 * answered/review state — browse-only, nothing scored. The runner re-fetches
 * question text/options/explanation fresh via `get_quiz_questions`, so only `id`
 * + `correctOptionId` ride along (explanations stay null to bound the payload).
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
