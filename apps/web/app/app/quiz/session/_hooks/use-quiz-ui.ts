'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AnswerFeedback } from '../../types'

type FeedbackMapInput = Map<string, AnswerFeedback>

type UseQuizUIOptions = {
  feedback: FeedbackMapInput
  currentIndex: number
}

type UseQuizUIResult = {
  feedbackMap: Map<string, { isCorrect: boolean }>
  pendingOptionId: string | null
  handleSelectionChange: (id: string | null) => void
}

export function useQuizUI({ feedback, currentIndex }: UseQuizUIOptions): UseQuizUIResult {
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

  // Clear pending selection when navigating to a different question
  // biome-ignore lint/correctness/useExhaustiveDependencies: currentIndex triggers reset on navigation
  useEffect(() => {
    setPendingOptionId(null)
  }, [currentIndex])

  return { feedbackMap, pendingOptionId, handleSelectionChange }
}
