import type { MutableRefObject } from 'react'
import type { AnswerFeedback, DraftAnswer } from '../../types'

type Checkpoint = (
  answers: Map<string, DraftAnswer>,
  index: number,
  feedback: Map<string, AnswerFeedback>,
) => void

type Opts = {
  checkpoint: Checkpoint
  navigateTo: (index: number) => void
  getCurrentIndex: () => number
  clearAnswerError: () => void
  clearSubmitError: () => void
  answersRef: MutableRefObject<Map<string, DraftAnswer>>
  feedbackRef: MutableRefObject<Map<string, AnswerFeedback>>
  pendingQuestionIdRef: MutableRefObject<Set<string>>
}

export function useQuizPersistenceNavigation({
  checkpoint,
  navigateTo,
  getCurrentIndex,
  clearAnswerError,
  clearSubmitError,
  answersRef,
  feedbackRef,
  pendingQuestionIdRef,
}: Opts) {
  const wrappedNavigateTo = (index: number) => {
    clearAnswerError()
    clearSubmitError()
    navigateTo(index)
    const pending = pendingQuestionIdRef.current
    if (pending.size > 0) {
      const safe = new Map(answersRef.current)
      for (const qId of pending) safe.delete(qId)
      checkpoint(safe, index, feedbackRef.current)
    } else {
      checkpoint(answersRef.current, index, feedbackRef.current)
    }
  }

  const wrappedNavigate = (d: number) => wrappedNavigateTo(getCurrentIndex() + d)

  return { checkpoint, navigateTo: wrappedNavigateTo, navigate: wrappedNavigate }
}
