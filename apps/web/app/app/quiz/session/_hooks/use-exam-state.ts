import { useRouter } from 'next/navigation'
import { useRef } from 'react'
import type { QuizStateOpts } from '../../session-types'
import type { AnswerFeedback, DraftAnswer } from '../../types'
import { buildExamAnswerHandlers, pickExamSubmitControls } from './exam-answer-handlers'
import { useExamAnswerBuffer } from './use-exam-answer-buffer'
import { useQuizSubmit } from './use-quiz-submit'

/**
 * Exam-mode answer pipeline: buffers answers locally (no per-answer RPC),
 * delegates batch submit to useQuizSubmit.
 */
export function useExamPipeline(opts: {
  quizOpts: QuizStateOpts
  getQuestionId: () => string
  getAnswerStartTime: () => number
  currentIndexRef: React.RefObject<number>
  navigateTo: (idx: number) => void
  navigate: (delta: number) => void
  onAnswerRecorded?: (draft: Omit<DraftAnswer, 'responseTimeMs'>) => void
}) {
  const router = useRouter()
  const emptyFeedbackRef = useRef<Map<string, AnswerFeedback>>(new Map())

  // initialAnswers flows to both study and exam pipelines (both instantiated in use-quiz-state.ts);
  // p = isExam ? exam : study gates which is surfaced, so seeding the unused pipeline is harmless.
  const { answers, answersRef, recordAnswer } = useExamAnswerBuffer({
    getQuestionId: opts.getQuestionId,
    getAnswerStartTime: opts.getAnswerStartTime,
    initialAnswers: opts.quizOpts.initialAnswers,
  })

  const submit = useQuizSubmit({
    userId: opts.quizOpts.userId,
    sessionId: opts.quizOpts.sessionId,
    answersRef,
    router,
    isExam: true,
    examMode: opts.quizOpts.examMode,
  })

  const handlers = buildExamAnswerHandlers({
    recordAnswer,
    onRecorded: opts.onAnswerRecorded,
  })

  return {
    answers,
    feedback: emptyFeedbackRef.current,
    // Exam answers are buffered locally (no per-answer RPC), so there is never
    // an in-flight answer to show a spinner for.
    answering: false,
    ...handlers,
    navigateTo: opts.navigateTo,
    navigate: opts.navigate,
    ...pickExamSubmitControls(submit),
  }
}
