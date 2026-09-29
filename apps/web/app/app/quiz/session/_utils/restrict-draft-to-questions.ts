import type { SessionQuestion } from '@/app/app/_types/session'
import { clampIndex } from './clamp-index'
import type { SessionData } from './quiz-session-handoff'

/** Drops draft answers/feedback for questions no longer served and clamps the resume index. */
export function restrictDraftToQuestions(
  session: Pick<SessionData, 'draftAnswers' | 'draftFeedback' | 'draftCurrentIndex'>,
  questions: readonly Pick<SessionQuestion, 'id'>[],
) {
  const ids = new Set(questions.map((q) => q.id))
  const keep = <V>(entries: Record<string, V>) =>
    Object.entries(entries).filter(([key]) => ids.has(key))
  return {
    answers: session.draftAnswers ? Object.fromEntries(keep(session.draftAnswers)) : undefined,
    feedback: session.draftFeedback ? new Map(keep(session.draftFeedback)) : undefined,
    index:
      session.draftCurrentIndex != null
        ? clampIndex(session.draftCurrentIndex, questions.length)
        : undefined,
  }
}
