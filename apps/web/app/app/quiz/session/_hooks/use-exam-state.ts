import { useRouter } from 'next/navigation'
import { useRef } from 'react'
import type { QuizStateOpts } from '../../session-types'
import type { AnswerFeedback, DraftAnswer } from '../../types'
import { buildExamAnswerHandlers, pickExamSubmitControls } from './exam-answer-handlers'
import { useExamAnswerBuffer } from './use-exam-answer-buffer'
import { useQuizPersistence } from './use-quiz-persistence'
import { useQuizSubmit } from './use-quiz-submit'

/**
 * Exam-mode answer pipeline: buffers answers locally (no per-answer RPC),
 * persists to localStorage with mode='exam' for refresh recovery,
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
  const emptyPendingRef = useRef(new Set<string>())

  const { checkpoint } = useQuizPersistence({ ...opts.quizOpts, mode: 'exam' })

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
    questions: opts.quizOpts.questions,
    answersRef,
    feedbackRef: emptyFeedbackRef,
    currentIndexRef: opts.currentIndexRef,
    pendingQuestionIdRef: emptyPendingRef,
    router,
    draftId: opts.quizOpts.draftId,
    subjectName: opts.quizOpts.subjectName,
    subjectCode: opts.quizOpts.subjectCode,
    isExam: true,
    examMode: opts.quizOpts.examMode,
  })

  const handlers = buildExamAnswerHandlers({
    recordAnswer,
    checkpoint: () => checkpoint(answersRef.current, opts.currentIndexRef.current),
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
