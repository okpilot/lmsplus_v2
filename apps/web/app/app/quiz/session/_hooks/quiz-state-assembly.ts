import type { SessionQuestion } from '@/app/app/_types/session'
import type { DraftAnswer } from '../../types'
import type { useAnswerPipeline } from './use-answer-pipeline'
import type { useExamPipeline } from './use-exam-state'

/** Whichever answer pipeline is active — exam (buffered) or study (per-answer RPC).
 * Both hooks return a structurally compatible shape for the fields read here. */
type ActivePipeline = ReturnType<typeof useExamPipeline> | ReturnType<typeof useAnswerPipeline>

export type AssembleQuizStateInput = {
  nav: { currentIndex: number; seenIndices: Set<number> }
  question: SessionQuestion | undefined
  questionId: string
  answers: Map<string, DraftAnswer>
  questionIds: string[]
  pinnedQuestions: Set<string>
  togglePin: () => void
  p: ActivePipeline
  isExam: boolean
}

/** Pure assembly of the useQuizState() return shape from already-computed values.
 * No hook calls — every input is a value or a callback the caller derived via hooks. */
export function assembleQuizState(input: AssembleQuizStateInput) {
  const { nav, question, questionId, answers, questionIds, pinnedQuestions, togglePin, p, isExam } =
    input
  return {
    currentIndex: nav.currentIndex,
    seenIndices: nav.seenIndices,
    question,
    questionId,
    answeredCount: answers.size,
    existingAnswer: answers.get(questionId),
    currentFeedback: p.feedback.get(questionId) ?? null,
    questionIds,
    answeredIds: new Set(answers.keys()),
    feedback: p.feedback,
    pinnedQuestions,
    isPinned: pinnedQuestions.has(questionId),
    handleSelectAnswer: p.handleSelectAnswer,
    handleTextAnswer: p.handleTextAnswer,
    handleDialogFillAnswer: p.handleDialogFillAnswer,
    handleOrderingAnswer: p.handleOrderingAnswer,
    handleDiagramLabelAnswer: p.handleDiagramLabelAnswer,
    navigateTo: p.navigateTo,
    navigate: p.navigate,
    togglePin,
    error: p.error,
    isExam,
    submitting: p.submitting,
    pendingAction: p.pendingAction,
    answering: p.answering,
    handleSubmit: p.handleSubmit,
    handleSave: p.handleSave,
    handleDiscard: p.handleDiscard,
    showFinishDialog: p.showFinishDialog,
    setShowFinishDialog: p.setShowFinishDialog,
  }
}
