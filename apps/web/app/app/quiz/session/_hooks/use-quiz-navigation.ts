import { useRef, useState } from 'react'
import { clampIndex } from '../_utils/clamp-index'

export function useQuizNavigation(opts: { totalQuestions: number; initialIndex?: number }) {
  const [currentIndex, setCurrentIndex] = useState(
    clampIndex(opts.initialIndex, opts.totalQuestions),
  )
  const answerStartTime = useRef(Date.now())

  function navigateTo(index: number) {
    if (index >= 0 && index < opts.totalQuestions) {
      setCurrentIndex(index)
      answerStartTime.current = Date.now()
    }
  }

  return {
    currentIndex,
    answerStartTime,
    navigateTo,
    navigate: (d: number) => navigateTo(currentIndex + d),
  }
}
