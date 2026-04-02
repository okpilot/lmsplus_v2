import { useRef } from 'react'
import type { AnswerFeedback, AnswerPipelineOpts } from '../../types'
import { buildPersistenceNavigation } from './build-persistence-navigation'
import { useAnswerHandler } from './use-answer-handler'
import { useQuizPersistence } from './use-quiz-persistence'
import { useQuizSubmit } from './use-quiz-submit'

export function useAnswerPipeline(opts: AnswerPipelineOpts) {
  const { checkpoint } = useQuizPersistence(opts)
  const feedbackRef = useRef<Map<string, AnswerFeedback>>(opts.initialFeedback ?? new Map())

  const {
    feedback,
    error: answerError,
    handleSelectAnswer,
    clearError: clearAnswerError,
    pendingQuestionIdRef,
  } = useAnswerHandler({
    sessionId: opts.sessionId,
    getQuestionId: opts.getQuestionId,
    getAnswerStartTime: opts.getAnswerStartTime,
    answers: opts.answers,
    setAnswers: opts.setAnswers,
    initialFeedback: opts.initialFeedback,
    onAnswerRecorded: (a, fb) => {
      feedbackRef.current = fb
      checkpoint(a, opts.getCurrentIndex(), fb)
    },
    onAnswerReverted: (a) => checkpoint(a, opts.getCurrentIndex(), feedbackRef.current),
  })
  feedbackRef.current = feedback

  const {
    submitted,
    error: submitError,
    clearError: clearSubmitError,
    ...submit
  } = useQuizSubmit({
    userId: opts.userId,
    sessionId: opts.sessionId,
    questions: opts.questions,
    answersRef: opts.answersRef,
    feedbackRef,
    currentIndexRef: opts.currentIndexRef,
    pendingQuestionIdRef,
    router: opts.router,
    draftId: opts.draftId,
    subjectName: opts.subjectName,
    subjectCode: opts.subjectCode,
  })

  const { navigateTo, navigate } = buildPersistenceNavigation({
    checkpoint,
    navigateTo: opts.navigateTo,
    getCurrentIndex: opts.getCurrentIndex,
    clearAnswerError,
    clearSubmitError,
    answersRef: opts.answersRef,
    feedbackRef,
    pendingQuestionIdRef,
  })

  return {
    feedback,
    handleSelectAnswer,
    navigateTo,
    navigate,
    submitted,
    error: submitError ?? answerError,
    ...submit,
  }
}
