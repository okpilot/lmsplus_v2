import { useEffect } from 'react'
import { isDragInputType, preloadDragInputs } from '../_components/lazy-answer-inputs'

export function usePreloadDragInputs(questions: ReadonlyArray<{ question_type: string }>) {
  const key = [...new Set(questions.map((q) => q.question_type).filter(isDragInputType))]
    .sort()
    .join(',')
  // Code preload, not data fetching.
  useEffect(() => {
    if (key) preloadDragInputs(key.split(','))
  }, [key])
}
