import { useRef, useState } from 'react'
import { clampIndex } from '../_utils/clamp-index'

export function useQuizNavigation(opts: { totalQuestions: number; initialIndex?: number }) {
  const startIndex = clampIndex(opts.initialIndex, opts.totalQuestions)
  const [currentIndex, setCurrentIndex] = useState(startIndex)
  // Tracks every question index the user has visited (the start index counts as
  // seen). Drives the Discovery navigator's "seen" colour; harmless for other modes.
  const [seenIndices, setSeenIndices] = useState<Set<number>>(() => new Set([startIndex]))
  const answerStartTime = useRef(Date.now())

  function navigateTo(index: number) {
    if (index >= 0 && index < opts.totalQuestions) {
      setCurrentIndex(index)
      setSeenIndices((prev) => (prev.has(index) ? prev : new Set(prev).add(index)))
      answerStartTime.current = Date.now()
    }
  }

  return {
    currentIndex,
    seenIndices,
    answerStartTime,
    navigateTo,
    navigate: (d: number) => navigateTo(currentIndex + d),
  }
}
