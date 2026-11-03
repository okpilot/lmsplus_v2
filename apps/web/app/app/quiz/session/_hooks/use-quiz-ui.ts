'use client'

import { useCallback, useMemo, useState } from 'react'
import type { QuestionTab } from '../../_components/question-tabs'
import type { AnswerFeedback } from '../../types'

type FeedbackMapInput = Map<string, AnswerFeedback>

type UseQuizUIOptions = {
  feedback: FeedbackMapInput
  currentIndex: number
  activeTab?: QuestionTab
}

type UseQuizUIResult = {
  feedbackMap: Map<string, { isCorrect: boolean }>
  pendingOptionId: string | null
  handleSelectionChange: (id: string | null) => void
}

export function useQuizUI({
  feedback,
  currentIndex,
  activeTab,
}: UseQuizUIOptions): UseQuizUIResult {
  const feedbackMap = useMemo(() => {
    const map = new Map<string, { isCorrect: boolean }>()
    for (const [qId, fb] of feedback) {
      map.set(qId, { isCorrect: fb.isCorrect })
    }
    return map
  }, [feedback])

  // Track selected option for mobile footer submit button
  const [pendingOptionId, setPendingOptionId] = useState<string | null>(null)
  const handleSelectionChange = useCallback((id: string | null) => setPendingOptionId(id), [])

  // Clear pending selection in the same render the question or tab changes: AnswerOptions unmounts
  // off the Question tab, and an effect would leave one frame where Submit sends the old option.
  const [resetKey, setResetKey] = useState({ currentIndex, activeTab })
  if (resetKey.currentIndex !== currentIndex || resetKey.activeTab !== activeTab) {
    setResetKey({ currentIndex, activeTab })
    setPendingOptionId(null)
  }

  return { feedbackMap, pendingOptionId, handleSelectionChange }
}
