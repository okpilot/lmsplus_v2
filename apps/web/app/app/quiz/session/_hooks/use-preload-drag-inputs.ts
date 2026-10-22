import { useEffect } from 'react'
import { preloadDragInputs } from '../_components/lazy-answer-inputs'

const DRAG_TYPES = ['diagram_label', 'ordering']

export function usePreloadDragInputs(questions: ReadonlyArray<{ question_type: string }>) {
  const key = DRAG_TYPES.filter((t) => questions.some((q) => q.question_type === t)).join(',')
  // Code preload, not data fetching.
  useEffect(() => {
    if (key) preloadDragInputs(key.split(','))
  }, [key])
}
