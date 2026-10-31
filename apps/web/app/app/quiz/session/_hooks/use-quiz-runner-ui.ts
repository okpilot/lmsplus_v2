import { supportsNonMcQuestions } from '../_utils/supports-non-mc-questions'
import { usePreloadDragInputs } from './use-preload-drag-inputs'
import { useQuizActiveTab } from './use-quiz-active-tab'
import { useQuizLeaveGuard } from './use-quiz-leave-guard'
import type { QuizState } from './use-quiz-state'
import { useQuizUI } from './use-quiz-ui'

type DragTypedQuestions = ReadonlyArray<{ question_type: string }>
const NO_QUESTIONS: DragTypedQuestions = []

/** The runner's tab, answer-feedback and leave-guard wiring, kept out of the render body. */
export function useQuizRunnerUI(
  s: QuizState,
  { isDiscovery, questions }: Readonly<{ isDiscovery: boolean; questions: DragTypedQuestions }>,
) {
  usePreloadDragInputs(supportsNonMcQuestions(s) ? questions : NO_QUESTIONS)
  const { activeTab, setActiveTab } = useQuizActiveTab(s.currentIndex)
  const effectiveTab = s.isExam ? 'question' : activeTab
  const quizUI = useQuizUI({
    feedback: s.feedback,
    currentIndex: s.currentIndex,
  })
  const leave = useQuizLeaveGuard({
    isDiscovery,
    submitted: s.submitted,
    setShowFinishDialog: s.setShowFinishDialog,
    pendingOptionId: quizUI.pendingOptionId,
    existingAnswer: s.existingAnswer,
  })
  return { ...quizUI, activeTab, setActiveTab, effectiveTab, leave }
}
