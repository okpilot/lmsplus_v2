'use client'

import { useEffect, useRef, useState } from 'react'
import type { QuestionTab } from '../../_components/question-tabs'

/**
 * Owns the question/explanation/comments/stats tab.
 *
 * `revealExplanationFor` carries the question id whose explanation should be surfaced without the
 * student having to find the tab — pass `null` to leave the tab alone. It exists because the
 * explanation was effectively unreachable: the tab never opened by itself and reset to `question`
 * on every navigation, so the teaching text under a wrong answer was opt-in and easy to never see.
 * That matters most for `dialog_fill`, where the runner reveals only the canonical phrase under the
 * box; the reason it is the right phrase lives in the explanation.
 *
 * Fires ONCE per question id (tracked in a ref, not state — a re-render must not re-open a tab the
 * student has since navigated away from). Revisiting an already-revealed question leaves the tab
 * where the student put it.
 */
export function useQuizActiveTab(
  currentIndex: number,
  revealExplanationFor?: string | null,
): {
  activeTab: QuestionTab
  setActiveTab: (tab: QuestionTab) => void
} {
  const [activeTab, setActiveTab] = useState<QuestionTab>('question')
  const revealedIds = useRef<Set<string>>(new Set())

  // Reset tab on question navigation — not data fetching
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional trigger on index change
  useEffect(() => {
    setActiveTab('question')
  }, [currentIndex])

  // Declared AFTER the reset above so that when both fire in one commit — answering does not change
  // currentIndex, but navigating to an unrevealed wrong answer changes both — the reveal wins.
  useEffect(() => {
    if (!revealExplanationFor) return
    if (revealedIds.current.has(revealExplanationFor)) return
    revealedIds.current.add(revealExplanationFor)
    setActiveTab('explanation')
  }, [revealExplanationFor])

  return { activeTab, setActiveTab }
}
