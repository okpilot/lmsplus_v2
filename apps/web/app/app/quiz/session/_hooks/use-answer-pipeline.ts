import type { AnswerPipelineOpts } from '../../session-types'
import { buildPersistenceNavigation } from './build-persistence-navigation'
import { useAnswerHandler } from './use-answer-handler'
import { useQuizSubmit } from './use-quiz-submit'

export function useAnswerPipeline(opts: AnswerPipelineOpts) {
  const {
    feedback,
    error: answerError,
    answering,
    handleSelectAnswer,
    handleTextAnswer,
    handleDialogFillAnswer,
    handleOrderingAnswer,
    handleDiagramLabelAnswer,
    clearError: clearAnswerError,
    pendingQuestionIdRef,
  } = useAnswerHandler({
    sessionId: opts.sessionId,
    getQuestionId: opts.getQuestionId,
    getAnswerStartTime: opts.getAnswerStartTime,
    answers: opts.answers,
    setAnswers: opts.setAnswers,
    initialFeedback: opts.initialFeedback,
  })
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
    pendingQuestionIdRef,
    router: opts.router,
  })
  const { navigateTo, navigate } = buildPersistenceNavigation({
    navigateTo: opts.navigateTo,
    getCurrentIndex: opts.getCurrentIndex,
    clearAnswerError,
    clearSubmitError,
  })

  return {
    feedback,
    answering,
    handleSelectAnswer,
    handleTextAnswer,
    handleDialogFillAnswer,
    handleOrderingAnswer,
    handleDiagramLabelAnswer,
    navigateTo,
    navigate,
    submitted,
    error: submitError ?? answerError,
    ...submit,
  }
}
