'use client'

import { useEffect, useState } from 'react'
import type { QuestionTab } from '../../_components/question-tabs'

export function useQuizActiveTab(currentIndex: number): {
  activeTab: QuestionTab
  setActiveTab: (tab: QuestionTab) => void
} {
  const [activeTab, setActiveTab] = useState<QuestionTab>('question')
  // Reset tab on question navigation — not data fetching
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional trigger on index change
  useEffect(() => {
    setActiveTab('question')
  }, [currentIndex])
  return { activeTab, setActiveTab }
}
