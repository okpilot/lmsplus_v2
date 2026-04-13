import { useRouter } from 'next/navigation'
import { useRef } from 'react'
import type { AnswerFeedback, QuizStateOpts } from '../../types'
import { useExamAnswerBuffer } from './use-exam-answer-buffer'
import { useQuizSubmit } from './use-quiz-submit'

/**
 * Exam-mode answer pipeline: buffers answers locally (no per-answer RPC),
 * skips localStorage persistence, delegates batch submit to useQuizSubmit.
 */
export function useExamPipeline(opts: {
  quizOpts: QuizStateOpts
  getQuestionId: () => string
  getAnswerStartTime: () => number
  currentIndexRef: React.RefObject<number>
  navigateTo: (idx: number) => void
  navigate: (delta: number) => void
}) {
  const router = useRouter()
  const emptyFeedbackRef = useRef<Map<string, AnswerFeedback>>(new Map())
  const emptyPendingRef = useRef(new Set<string>())

  const { answers, answersRef, confirmAnswer } = useExamAnswerBuffer({
    getQuestionId: opts.getQuestionId,
    getAnswerStartTime: opts.getAnswerStartTime,
  })

  const submit = useQuizSubmit({
    userId: opts.quizOpts.userId,
    sessionId: opts.quizOpts.sessionId,
    questions: opts.quizOpts.questions,
    answersRef,
    feedbackRef: emptyFeedbackRef,
    currentIndexRef: opts.currentIndexRef,
    pendingQuestionIdRef: emptyPendingRef,
    router,
    draftId: opts.quizOpts.draftId,
    subjectName: opts.quizOpts.subjectName,
    subjectCode: opts.quizOpts.subjectCode,
  })

  return {
    answers,
    feedback: new Map<string, AnswerFeedback>(),
    handleSelectAnswer: confirmAnswer,
    navigateTo: opts.navigateTo,
    navigate: opts.navigate,
    submitted: submit.submitted,
    error: submit.error,
    submitting: submit.submitting,
    handleSubmit: submit.handleSubmit,
    handleSave: submit.handleSave,
    handleDiscard: submit.handleDiscard,
    showFinishDialog: submit.showFinishDialog,
    setShowFinishDialog: submit.setShowFinishDialog,
  }
}
