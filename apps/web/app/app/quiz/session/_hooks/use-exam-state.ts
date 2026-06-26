import { useRouter } from 'next/navigation'
import { useRef } from 'react'
import type { QuizStateOpts } from '../../session-types'
import type { AnswerFeedback } from '../../types'
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
}) {
  const router = useRouter()
  const emptyFeedbackRef = useRef<Map<string, AnswerFeedback>>(new Map())
  const emptyPendingRef = useRef(new Set<string>())

  const { checkpoint } = useQuizPersistence({ ...opts.quizOpts, mode: 'exam' })

  // initialAnswers flows to both study and exam pipelines (both instantiated in use-quiz-state.ts);
  // p = isExam ? exam : study gates which is surfaced, so seeding the unused pipeline is harmless.
  const { answers, answersRef, confirmAnswer } = useExamAnswerBuffer({
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

  function handleSelectAnswer(id: string): Promise<boolean> {
    const recorded = confirmAnswer(id)
    if (recorded) {
      checkpoint(answersRef.current, opts.currentIndexRef.current)
    }
    return Promise.resolve(recorded)
  }

  // Non-MC types (short_answer / dialog_fill) are practice-only — the
  // check_non_mc_answer RPC rejects exam-mode sessions, and exam questions are
  // MC. These exist only to keep the exam/study pipeline return shapes unioned
  // (use-quiz-state.ts: `p = isExam ? exam : study`). They are never reached:
  // QuizMainPanel renders the text/dialog inputs only in study mode.
  const noopNonMcHandler = (): Promise<boolean> => Promise.resolve(false)

  return {
    answers,
    feedback: emptyFeedbackRef.current,
    // Exam answers are buffered locally (no per-answer RPC), so there is never
    // an in-flight answer to show a spinner for.
    answering: false,
    handleSelectAnswer,
    handleTextAnswer: noopNonMcHandler,
    handleDialogFillAnswer: noopNonMcHandler,
    navigateTo: opts.navigateTo,
    navigate: opts.navigate,
    submitted: submit.submitted,
    error: submit.error,
    submitting: submit.submitting,
    pendingAction: submit.pendingAction,
    handleSubmit: submit.handleSubmit,
    handleSave: submit.handleSave,
    handleDiscard: submit.handleDiscard,
    showFinishDialog: submit.showFinishDialog,
    setShowFinishDialog: submit.setShowFinishDialog,
  }
}
