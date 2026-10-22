import { useEffect, useMemo } from 'react'
import { isDragInputType, preloadDragInputs } from '../_components/lazy-answer-inputs'

export function usePreloadDragInputs(questions: ReadonlyArray<{ question_type: string }>) {
  const key = useMemo(
    () =>
      [...new Set(questions.map((q) => q.question_type).filter(isDragInputType))].sort().join(','),
    [questions],
  )
  // Code preload, not data fetching.
  useEffect(() => {
    if (key) preloadDragInputs(key.split(','))
  }, [key])
}
