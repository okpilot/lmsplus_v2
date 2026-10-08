import { useQuizActiveTab } from './use-quiz-active-tab'
import { useQuizLeaveGuard } from './use-quiz-leave-guard'
import type { QuizState } from './use-quiz-state'
import { useQuizUI } from './use-quiz-ui'

/** The runner's tab, answer-feedback and leave-guard wiring, kept out of the render body. */
export function useQuizRunnerUI(
  s: QuizState,
  { isDiscovery, sessionId }: Readonly<{ isDiscovery: boolean; sessionId: string }>,
) {
  const { activeTab, setActiveTab } = useQuizActiveTab(s.currentIndex)
  const effectiveTab = s.isExam ? 'question' : activeTab
  const quizUI = useQuizUI({
    feedback: s.feedback,
    currentIndex: s.currentIndex,
    activeTab: effectiveTab,
    existingAnswer: s.existingAnswer,
  })
  const leave = useQuizLeaveGuard({
    isDiscovery,
    sessionId,
    submitted: s.submitted,
    setShowFinishDialog: s.setShowFinishDialog,
    pendingOptionId: quizUI.pendingOptionId,
    existingAnswer: s.existingAnswer,
  })
  return { ...quizUI, activeTab, setActiveTab, effectiveTab, leave }
}
