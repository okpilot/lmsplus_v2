'use client'

import type { QuizSessionProps } from '../../session-types'
import { useFlaggedQuestions } from './use-flagged-questions'
import { useQuizRunnerUI } from './use-quiz-runner-ui'
import { useQuizState } from './use-quiz-state'
import { useQuizTimer } from './use-quiz-timer'
import { useUnblockedQuizKeyboard } from './use-unblocked-quiz-keyboard'

/** Everything the session screen renders from: state, tabs, flags, timer and keyboard. */
export function useQuizSession(props: Readonly<QuizSessionProps>) {
  const s = useQuizState(props)
  const isDiscovery = props.mode === 'discovery'
  const ui = useQuizRunnerUI(s, { isDiscovery, questions: props.questions })
  const flags = useFlaggedQuestions(props.initialFlaggedIds ?? [])
  const timer = useQuizTimer(props.startedAt, s.setShowFinishDialog)

  const { highlightedOptionId } = useUnblockedQuizKeyboard({
    optionIds: s.question?.options.map((o) => o.id) ?? [],
    currentIndex: s.currentIndex,
    isExam: s.isExam,
    // Pause shortcuts while the finish or Discovery leave dialog is open; lightweight popovers (the keyboard legend) stay live — no destructive action, Escape-dismissable.
    enabled: !s.showFinishDialog && !ui.leave.discoveryConfirmOpen,
    onNavigate: s.navigate,
    onConfirm: s.handleSelectAnswer,
    onTab: ui.setActiveTab,
  })

  return { s, isDiscovery, ui, flags, timer, highlightedOptionId }
}
